import { createServerSupabase } from '@/lib/supabase/server'
/**
 * The rows behind the Leads pipeline, built once on the server. The board
 * and the dashboard both read these, so a lead sits in the same stage and
 * shows the same score everywhere.
 */
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { isProductAdmin } from '@/lib/auth/admin-page'
import { computeLifecycleState } from '@/lib/leads/lifecycle-policy'
import type { LeadRow, PipelineStage } from '@/components/leads/pipeline-utils'
import { derivePipelineStage } from '@/components/leads/pipeline-utils'
import type { Lead, RevenueIdentityChannel } from '@/lib/domain/types'
import { normalizeChannel } from '@/lib/profiles/channel'
import { leadBelongsToWorkspace, leadBelongsToAnyWorkspace, type WorkspaceIdentity } from '@/lib/workspace/active-identity'
import { resolveActiveWorkspace } from '@/lib/workspace/resolve-active-identity'
import { chunkedIn } from '@/lib/supabase/chunked-in'

/** Cards sent to the client on first paint. Counts cover the full set. */
export const BOARD_CARD_LIMIT = 150

/**
 * The one rule that decides which leads a board shows.
 *
 * An admin's board is intentionally org-wide. A rep's board is scoped to the
 * selected workspace identity — switching profiles must change the visible lead
 * set (BUG-30). A rep with no resolvable workspace keeps their full book rather
 * than an empty board.
 */
export function scopeLeadsToWorkspace<
  T extends { revenueIdentityId?: string | null; senderProfileId?: string | null },
>(leads: readonly T[], workspace: WorkspaceIdentity | null, orgView: boolean): T[] {
  if (orgView || !workspace) return [...leads]
  return leads.filter((lead) => leadBelongsToWorkspace(lead, workspace))
}

/**
 * A rep's default book: every identity they can execute (PRIMARY plus active
 * coverage). Scoping to the single active workspace made a lead created under
 * one sender invisible under another, which is how a duplicate detector could
 * report a lead the rep had no way to find (BUG-34 / BUG-36).
 */
export function scopeLeadsToIdentities<
  T extends { revenueIdentityId?: string | null; senderProfileId?: string | null },
>(leads: readonly T[], identities: ReadonlyArray<{ id: string; profileId?: string | null }>): T[] {
  if (identities.length === 0) return [...leads]
  return leads.filter((lead) => leadBelongsToAnyWorkspace(lead, identities))
}

export interface BoardData {
  leads: LeadRow[]
  orgView: boolean
  reps: Array<{ id: string; name: string }>
  workspace: WorkspaceIdentity | null
}

/**
 * Bounded pipeline payload.
 *
 * The board must not transfer the organisation's whole lead set on first paint.
 * Counts are computed server-side over the full set; only the highest-priority
 * `cardLimit` cards are returned. Counts and cards therefore never disagree —
 * the card list is a declared subset, and the UI says so.
 */
export interface BoardPreview {
  cards: LeadRow[]
  counts: Record<PipelineStage, number>
  total: number
  orgView: boolean
  workspace: WorkspaceIdentity | null
}

export const CARD_ORDER: Record<PipelineStage, number> = {
  needs_reply: 0,
  follow_up_due: 1,
  to_contact: 2,
  observe: 3,
  waiting: 4,
  cold: 5,
  done: 6,
}

export async function loadBoardPreview(cardLimit = BOARD_CARD_LIMIT): Promise<BoardPreview> {
  const user = await getCurrentUser()
  const authCtx = await getAuthContext()
  const store = await createScoutStore()
  const orgView = isProductAdmin(user, authCtx)

  let workspace: WorkspaceIdentity | null = null
  try {
    workspace = await resolveActiveWorkspace()
  } catch {
    workspace = null
  }

  const repsRes = orgView ? await store.listAllReps() : []
  const reps = (Array.isArray(repsRes) ? repsRes : []).map((rep) => ({ id: rep.id, name: rep.name }))

  const scope = {
    ownerRepId: orgView ? null : (authCtx?.repId ?? null),
    revenueIdentityId: orgView ? null : (workspace?.id ?? null),
    profileId: orgView ? null : (workspace?.profileId ?? null),
  }

  // Neon: one aggregate for the counts and one bounded id query for the cards.
  // Supabase (PostgREST) has no raw-SQL surface, so both return null and the
  // JS authority below computes the same result.
  const sqlCounts = await store.getPipelineStageSummary(scope)
  const sqlIds = sqlCounts ? await store.getPipelineCardIds(scope, cardLimit) : null

  if (sqlCounts && sqlIds) {
    const leads = await store.getLeadsByIds(sqlIds)
    const cards = await enrichLeads(leads, { authCtx, orgView, reps })
    const total = Object.values(sqlCounts).reduce((sum, n) => sum + n, 0)
    return { cards, counts: sqlCounts, total, orgView, workspace }
  }

  const data = await loadBoardData()

  const counts = {} as Record<PipelineStage, number>
  for (const stage of Object.keys(CARD_ORDER) as PipelineStage[]) counts[stage] = 0
  for (const lead of data.leads) counts[derivePipelineStage(lead)] += 1

  const cards = [...data.leads]
    .sort((a, b) => {
      const byStage = CARD_ORDER[derivePipelineStage(a)] - CARD_ORDER[derivePipelineStage(b)]
      if (byStage !== 0) return byStage
      const aAt = a.lastActivityAt ?? a.createdAt
      const bAt = b.lastActivityAt ?? b.createdAt
      return new Date(bAt).getTime() - new Date(aAt).getTime()
    })
    .slice(0, cardLimit)

  return { cards, counts, total: data.leads.length, orgView: data.orgView, workspace: data.workspace }
}

export interface EnrichContext {
  authCtx: Awaited<ReturnType<typeof getAuthContext>>
  orgView: boolean
  reps: Array<{ id: string; name: string }>
}

/**
 * The one enrichment pass: messages, conversation state and sender profiles.
 * The full board and a single paginated page both run through this, so a lead
 * shows the same activity, owner and profile attribution everywhere.
 */
export async function enrichLeads(
  visibleLeads: Lead[],
  ctx: EnrichContext,
): Promise<LeadRow[]> {
  const { authCtx, orgView, reps } = ctx
  const leadIds = visibleLeads.map((l) => l.id)

  const [messagesRes, followupCountsRes, openTasksRes] = await Promise.all([
    (async () => {
      if (!authCtx || leadIds.length === 0) return []
      try {
        const client = await createServerSupabase()
        // sent_text is required to reproduce the exact "has an outbound/inbound
        // body" rule; the board never renders the body, so it is not attached to
        // the row sent to the client.
        const select = 'lead_id, sent_at, created_at, sent_text, direction, type'
        type MessageRow = { lead_id: string; sent_at: string | null; created_at: string | null; sent_text: string | null; direction: string; type: string }
        // One `in.(...)` with hundreds of UUIDs is rejected by the URL limit
        // and comes back empty, which made the whole org look inactive.
        const [outbound, inbound] = await Promise.all([
          chunkedIn<MessageRow>(leadIds, (chunk) => client
            .from('messages')
            .select(select)
            .eq('organization_id', authCtx.orgId)
            .in('lead_id', chunk)
            .neq('direction', 'inbound')
            .order('sent_at', { ascending: false })),
          chunkedIn<MessageRow>(leadIds, (chunk) => client
            .from('messages')
            .select(select)
            .eq('organization_id', authCtx.orgId)
            .in('lead_id', chunk)
            .eq('direction', 'inbound')
            .order('sent_at', { ascending: false })),
        ])
        const byNewest = (a: MessageRow, b: MessageRow) =>
          String(b.sent_at ?? b.created_at).localeCompare(String(a.sent_at ?? a.created_at))
        return [...outbound.sort(byNewest), ...inbound.sort(byNewest)]
      } catch (err) {
        console.error('[board-rows] message load failed:', err)
        return []
      }
    })(),
    (async () => {
      if (!authCtx || leadIds.length === 0) return []
      try {
        const client = await createServerSupabase()
        return await chunkedIn<{ lead_id: string; followup_count: number | null }>(leadIds, (chunk) => client
          .from('conversation_states')
          .select('lead_id, followup_count')
          .eq('organization_id', authCtx.orgId)
          .in('lead_id', chunk))
      } catch (err) {
        console.error('[board-rows] conversation state load failed:', err)
        return []
      }
    })(),
    (async () => {
      if (!authCtx || leadIds.length === 0) return [] as Array<{ lead_id: string }>
      try {
        const client = await createServerSupabase()
        return await chunkedIn<{ lead_id: string }>(leadIds, (chunk) => client
          .from('assigned_tasks')
          .select('lead_id')
          .eq('organization_id', authCtx.orgId)
          .in('status', ['OPEN', 'IN_PROGRESS', 'WAITING'])
          .in('lead_id', chunk))
      } catch {
        // Table may not be migrated yet — treat as zero open tasks.
        return []
      }
    })(),
  ])

  const ownerByRepId = Object.fromEntries(reps.map((rep) => [rep.id, rep.name]))
  const messages = Array.isArray(messagesRes) ? messagesRes : []

  const lastActivityByLead = new Map<string, string>()
  const lastOutboundByLead = new Map<string, string>()
  const lastInboundByLead = new Map<string, string>()
  const hasDmSentByLead = new Set<string>()

  for (const m of messages) {
    const leadId = m.lead_id as string
    const ts = (m.sent_at ?? m.created_at) as string
    if (ts && !lastActivityByLead.has(leadId)) lastActivityByLead.set(leadId, ts)

    const direction = m.direction as string
    const type = m.type as string
    const text = m.sent_text as string

    // Exact pre-optimisation rule: a message counts as outbound/inbound only
    // when it carries a body. Changing this would move connection-only leads
    // between pipeline stages.
    if (direction !== 'inbound' && text && !lastOutboundByLead.has(leadId)) {
      lastOutboundByLead.set(leadId, (m.sent_at ?? m.created_at) as string)
    }
    if (direction === 'inbound' && text && !lastInboundByLead.has(leadId)) {
      lastInboundByLead.set(leadId, (m.sent_at ?? m.created_at) as string)
    }
    // Pipeline/detail parity: track whether a DM was sent so connection-
    // accepted leads land in to_contact (action required), not waiting.
    if (type === 'dm' && direction !== 'inbound' && text) {
      hasDmSentByLead.add(leadId)
    }
  }

  const followupCountByLead = new Map<string, number>()
  const followupCounts = Array.isArray(followupCountsRes) ? followupCountsRes : []
  for (const fc of followupCounts) {
    followupCountByLead.set(fc.lead_id as string, (fc.followup_count as number) ?? 0)
  }

  const openTaskCountByLead = new Map<string, number>()
  for (const row of openTasksRes) {
    const id = row.lead_id as string
    if (!id) continue
    openTaskCountByLead.set(id, (openTaskCountByLead.get(id) ?? 0) + 1)
  }

  const senderProfileIds = [...new Set(visibleLeads.map((l) => l.senderProfileId).filter(Boolean) as string[])]
  const profileById = new Map<string, string>()
  const platformById = new Map<string, RevenueIdentityChannel>()
  if (senderProfileIds.length > 0 && authCtx) {
    try {
      const client = await createServerSupabase()
      const profiles = await chunkedIn<{ id: string; display_name: string | null; full_name: string | null; platform: string | null }>(senderProfileIds, (chunk) => client
        .from('profiles')
        .select('id, display_name, full_name, platform')
        .eq('organization_id', authCtx.orgId)
        .in('id', chunk))
      for (const p of profiles) {
        profileById.set(p.id as string, (p.display_name ?? p.full_name ?? 'Profile') as string)
        platformById.set(p.id as string, normalizeChannel(p.platform))
      }
    } catch { }
  }

  const leads: LeadRow[] = visibleLeads.map((lead) => {
    const outboundAt = lastOutboundByLead.get(lead.id) ?? null
    const inboundAt = lastInboundByLead.get(lead.id) ?? null
    const lifecycle = computeLifecycleState({
      status: lead.status,
      createdAt: lead.createdAt,
      connectionAcceptedAt: lead.connectionAcceptedAt,
      lockedReason: lead.lockedReason,
      lockedUntil: lead.lockedUntil,
      lastOutboundAt: outboundAt,
      lastInboundAt: inboundAt,
      followupCount: followupCountByLead.get(lead.id) ?? 0,
      archived: lead.archived,
    })
    return {
      ...lead,
      ownerName: orgView && lead.ownerRepId ? ownerByRepId[lead.ownerRepId] : undefined,
      lastActivityAt: lastActivityByLead.get(lead.id) ?? null,
      senderProfileName: lead.senderProfileId ? profileById.get(lead.senderProfileId) ?? undefined : undefined,
      senderProfileChannel: lead.senderProfileId ? (platformById.get(lead.senderProfileId) ?? null) : null,
      lastOutboundAt: outboundAt,
      lastInboundAt: inboundAt,
      followupCount: followupCountByLead.get(lead.id) ?? 0,
      openAssignedTaskCount: openTaskCountByLead.get(lead.id) ?? 0,
      hasDmSent: hasDmSentByLead.has(lead.id),
      lifecycle,
    }
  })

  return leads
}

export async function loadBoardData(): Promise<BoardData> {
  const user = await getCurrentUser()
  const authCtx = await getAuthContext()
  const store = await createScoutStore()
  const orgView = isProductAdmin(user, authCtx)

  let workspace: WorkspaceIdentity | null = null
  try {
    workspace = await resolveActiveWorkspace()
  } catch {
    workspace = null
  }

  const allLeads = orgView ? await store.fetchLeadsAll() : await store.listOwnedLeads()
  const visibleLeads = scopeLeadsToWorkspace(allLeads, workspace, orgView)
  const repsRes = orgView ? await store.listAllReps() : []
  const reps = (Array.isArray(repsRes) ? repsRes : []).map((rep) => ({ id: rep.id, name: rep.name }))

  const leads = await enrichLeads(visibleLeads, { authCtx, orgView, reps })

  return { leads, orgView, reps, workspace }
}
