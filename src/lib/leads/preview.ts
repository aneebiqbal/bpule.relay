/**
 * Lightweight lead context for the preview drawer.
 *
 * The drawer must open instantly, so this payload is bounded by design: the
 * record's identity, the canonical next action, owner/profile attribution,
 * open tasks and the most recent activity. Conversation bodies are fetched
 * separately, only when the Conversation tab is opened — never up front.
 */
import { createServerSupabase } from '@/lib/supabase/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { isProductAdmin } from '@/lib/auth/admin-page'
import { resolveActiveWorkspace } from '@/lib/workspace/resolve-active-identity'
import { derivePipelineStage, leadNextAction, leadPriority, type LeadPriority } from '@/components/leads/pipeline-utils'
import { formatRoleLine } from '@/lib/leads/role-line'

/**
 * Narrow by intent: identity + the few fields the drawer renders. No raw_input,
 * no canonical_intelligence blob, no score_breakdown, no evidence ledger.
 */
const PREVIEW_LEAD_COLUMNS = [
  'id',
  'organization_id',
  'owner_rep_id',
  'company',
  'contact_name',
  'contact_title',
  'score',
  'verdict',
  'status',
  'direction',
  'sender_profile_id',
  'revenue_identity_id',
  'connection_accepted_at',
  'archived',
  'created_at',
  'canonical_intelligence->buyerIntent',
].join(', ')

export interface LeadPreviewData {
  id: string
  name: string | null
  company: string | null
  title: string | null
  roleLine: string | null
  stage: string
  priority: LeadPriority
  score: number | null
  nextAction: { label: string; href: string }
  owner: { id: string; name: string } | null
  profile: { id: string; name: string } | null
  lastActivityAt: string | null
  openTaskCount: number
  intent: string | null
  /** Bounded operational timeline — the same events the record page shows. */
  events: Array<{ id: string; label: string; at: string }>
}

/** The drawer's contract: never returns raw source, AI traces or embeddings. */
export async function loadLeadPreview(leadId: string): Promise<LeadPreviewData | null> {
  const user = await getCurrentUser()
  const authCtx = await getAuthContext()
  if (!authCtx) return null

  const client = await createServerSupabase()
  const { data: row, error } = await client
    .from('leads')
    .select(PREVIEW_LEAD_COLUMNS)
    .eq('id', leadId)
    .eq('organization_id', authCtx.orgId)
    .maybeSingle()
  if (error || !row) return null

  const orgView = isProductAdmin(user, authCtx)
  const workspace = await resolveActiveWorkspace().catch(() => null)
  const inScope = orgView
    ? true
    : workspace
      ? row.revenue_identity_id === workspace.id || row.sender_profile_id === workspace.id
      : (row.owner_rep_id ?? authCtx.repId) === authCtx.repId

  if (!inScope) return null

  const ownerId = row.owner_rep_id as string | null
  const profileId = row.sender_profile_id as string | null

  const store = await createScoutStore()
  const [owner, profile, activity, tasks, timeline] = await Promise.all([
    ownerId ? store.getRepInfo(ownerId).catch(() => null) : Promise.resolve(null),
    profileId ? store.getProfile(profileId).catch(() => null) : Promise.resolve(null),
    client
      .from('messages')
      .select('sent_at', { count: 'exact', head: true })
      .eq('lead_id', leadId)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1),
    client
      .from('assigned_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', leadId)
      .in('status', ['OPEN', 'IN_PROGRESS']),
    client
      .from('messages')
      .select('id, type, direction, sent_at')
      .eq('lead_id', leadId)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(5),
  ])

  const events = [
    ...(timeline.data ?? []).map((m) => ({
      id: m.id as string,
      label: `${(m.direction as string) === 'inbound' ? 'Reply received' : 'Message sent'} · ${(m.type as string) ?? 'message'}`,
      at: m.sent_at as string,
    })),
    { id: 'created', label: 'Lead created', at: row.created_at as string },
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const lead = {
    id: row.id as string,
    company: row.company as string,
    contactName: (row.contact_name as string) ?? null,
    contactTitle: (row.contact_title as string) ?? null,
    score: (row.score as number) ?? null,
    verdict: row.verdict as never,
    status: row.status as never,
    direction: (row.direction as never) ?? 'outbound',
    senderProfileId: profileId,
    revenueIdentityId: row.revenue_identity_id as string | null,
    connectionAcceptedAt: (row.connection_accepted_at as string) ?? null,
    createdAt: row.created_at as string,
    lastActivityAt: (activity.data?.[0]?.sent_at as string) ?? null,
    followupCount: 0,
  }

  return {
    id: lead.id,
    name: lead.contactName,
    company: lead.company,
    title: lead.contactTitle,
    roleLine: lead.contactTitle ? formatRoleLine(lead.contactTitle, null) : null,
    stage: derivePipelineStage(lead as never),
    priority: leadPriority(lead as never),
    score: lead.score,
    nextAction: leadNextAction(lead as never),
    owner: owner ? { id: owner.id, name: owner.name } : null,
    profile: profile
      ? { id: profile.id, name: profile.displayName ?? profile.fullName ?? 'Profile' }
      : null,
    lastActivityAt: lead.lastActivityAt,
    openTaskCount: tasks.count ?? 0,
    intent: ((row.buyerIntent as { buyerIntentLevel?: string } | null)?.buyerIntentLevel ?? null),
    events,
  }
}
