/**
 * Server-paginated lead reads for the Leads table.
 *
 * The database filters, orders, counts and pages; only the current page is
 * enriched, so the browser never holds the lead set. A derived filter (stage or
 * priority) is not a column, so that path enriches the scoped set and paginates
 * in memory instead — the stage can never be filtered in SQL without a second
 * writer, which the canonical owners forbid.
 */
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { getAuthorizedIdentities } from '@/lib/auth/workspace'
import { isProductAdmin } from '@/lib/auth/admin-page'
import { createScoutStore } from '@/lib/store'
import { resolveActiveWorkspace } from '@/lib/workspace/resolve-active-identity'
import type { WorkspaceIdentity } from '@/lib/workspace/active-identity'
import { enrichLeads, scopeLeadsToIdentities, BOARD_CARD_LIMIT, CARD_ORDER, type BoardPreview } from '@/lib/leads/board-rows'
import {
  assertRepCannotUseTeamScope,
  filterLeadsByTeamOwners,
  resolveLeadListScope,
} from '@/lib/leads/lead-scope'
import {
  LEADS_MAX_PAGE_SIZE,
  LEADS_PAGE_SIZE,
  derivePipelineStage,
  isDerivedSort,
  isPipelineStage,
  leadPriority,
  parseLeadsQuery,
  sortLeadRows,
  type LeadRow,
  type LeadsQuery,
  type PipelineStage,
} from '@/components/leads/pipeline-utils'
import type { Lead } from '@/lib/domain/types'

export { parseLeadsQuery }
export type { LeadsQuery }
export { LEADS_PAGE_SIZE, LEADS_MAX_PAGE_SIZE }

export interface LeadsPageData {
  leads: LeadRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  orgView: boolean
  /** Manager team expansion (never org-wide). */
  teamView: boolean
  workspace: WorkspaceIdentity | null
  reps: Array<{ id: string; name: string }>
  /** Sending identities available to this viewer, for the profile filter. */
  profiles: Array<{ id: string; identity_name: string }>
}

async function resolveManagedOwnerIds(
  store: Awaited<ReturnType<typeof createScoutStore>>,
  managedTeamIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const teamId of managedTeamIds) {
    const members = await store.getTeamMembers(teamId)
    for (const m of members) ids.add(m.repId)
  }
  return ids
}

export interface ScopedFilteredLeads {
  rows: LeadRow[]
  total: number
  orgView: boolean
  teamView: boolean
  workspace: WorkspaceIdentity | null
  reps: Array<{ id: string; name: string }>
}

/**
 * The canonical filtered lead set, shared by the Leads table and the Pipeline.
 *
 * Every filter — column filters (q/owner/profile/source/status) and derived
 * filters (stage/priority) — is applied here, server-side, before paging, and
 * the canonical sort is applied too. Both surfaces consume this one contract so
 * a filter can never mean one thing on the table and another on the pipeline.
 */
export async function loadScopedFilteredLeads(query: LeadsQuery): Promise<ScopedFilteredLeads> {
  const user = await getCurrentUser()
  const authCtx = await getAuthContext()
  const store = await createScoutStore()
  const productAdmin = isProductAdmin(user, authCtx)

  let workspace: WorkspaceIdentity | null = null
  try {
    workspace = await resolveActiveWorkspace()
  } catch {
    workspace = null
  }

  const stage = isPipelineStage(query.stage) ? query.stage : null
  const priority = query.priority ?? null

  const resolved = resolveLeadListScope({
    auth: authCtx,
    isProductAdmin: productAdmin,
    requested: query.scope ?? (productAdmin ? 'org' : undefined),
  })
  const mode = assertRepCannotUseTeamScope(
    resolved.mode,
    Boolean(authCtx?.isManager && (authCtx.managedTeamIds?.length ?? 0) > 0),
  )
  const orgView = mode === 'org'
  const teamView = mode === 'team'

  let managedOwners: Set<string> | null = null
  if (teamView && authCtx) {
    managedOwners = await resolveManagedOwnerIds(store, authCtx.managedTeamIds)
    managedOwners.add(authCtx.repId)
  }

  const repsRes = orgView || teamView ? await store.listAllReps() : []
  const reps = (Array.isArray(repsRes) ? repsRes : [])
    .filter((rep) => (managedOwners ? managedOwners.has(rep.id) : true))
    .map((rep) => ({ id: rep.id, name: rep.name }))

  const all: Lead[] = orgView
    ? await store.fetchLeadsAll()
    : teamView
      ? filterLeadsByTeamOwners(
          await store.fetchLeadsAll(),
          managedOwners ?? new Set(),
          authCtx?.repId ?? '',
        )
      : await store.listOwnedLeads()
  // A rep's default book is every identity they can execute, not just the
  // active workspace (BUG-34).
  const executableIdentities = orgView || teamView
    ? []
    : (await getAuthorizedIdentities())
        .filter((identity) => identity.status === 'active')
        .map((identity) => ({ id: identity.revenueIdentityId, profileId: identity.profileId }))
  const scoped = orgView || teamView
    ? all
    : scopeLeadsToIdentities(all, executableIdentities)
  const columnFiltered = applyCanonicalColumnFilters(scoped, query)
  const enriched = await enrichLeads(columnFiltered, {
    authCtx,
    orgView: orgView || teamView,
    reps,
  })
  const rows = sortLeadRows(
    enriched.filter((lead) => {
      if (stage && derivePipelineStage(lead) !== stage) return false
      if (priority && leadPriority(lead) !== priority) return false
      return true
    }),
    query.sort,
    query.dir,
  )
  return { rows, total: rows.length, orgView, teamView, workspace, reps }
}

export async function loadLeadsPage(query: LeadsQuery): Promise<LeadsPageData> {
  const user = await getCurrentUser()
  const authCtx = await getAuthContext()
  const store = await createScoutStore()
  const productAdmin = isProductAdmin(user, authCtx)

  let workspace: WorkspaceIdentity | null = null
  try {
    workspace = await resolveActiveWorkspace()
  } catch {
    workspace = null
  }

  const page = Math.max(1, Math.floor(query.page ?? 1))
  const pageSize = Math.min(
    LEADS_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(query.pageSize ?? LEADS_PAGE_SIZE)),
  )

  const stage = isPipelineStage(query.stage) ? query.stage : null
  const priority = query.priority ?? null
  // Stage/priority are derived and 'activity'/'score' are derived sorts — those
  // cannot be expressed as a column filter, so they read the scoped set.
  const derived = Boolean(stage || priority) || isDerivedSort(query.sort)

  const resolved = resolveLeadListScope({
    auth: authCtx,
    isProductAdmin: productAdmin,
    requested: query.scope ?? (productAdmin ? 'org' : undefined),
  })
  const mode = assertRepCannotUseTeamScope(
    resolved.mode,
    Boolean(authCtx?.isManager && (authCtx.managedTeamIds?.length ?? 0) > 0),
  )
  const orgView = mode === 'org'
  const teamView = mode === 'team'

  let managedOwners: Set<string> | null = null
  if (teamView && authCtx) {
    managedOwners = await resolveManagedOwnerIds(store, authCtx.managedTeamIds)
    managedOwners.add(authCtx.repId)
  }

  const repsRes = orgView || teamView ? await store.listAllReps() : []
  const reps = (Array.isArray(repsRes) ? repsRes : [])
    .filter((rep) => (managedOwners ? managedOwners.has(rep.id) : true))
    .map((rep) => ({ id: rep.id, name: rep.name }))

  // Sending identities for the profile filter. Admins get the organization;
  // reps get exactly the identities they can execute, so the filter offers the
  // same set on both surfaces and never an identity they cannot work.
  const authorizedIdentities = orgView || teamView
    ? []
    : (await getAuthorizedIdentities()).filter((identity) => identity.status === 'active')
  const executableIdentities = authorizedIdentities.map((identity) => ({
    id: identity.revenueIdentityId,
    profileId: identity.profileId,
  }))
  const profiles: Array<{ id: string; identity_name: string }> = []
  if (orgView && authCtx) {
    try {
      const rows = await store.getSupabaseClient()
        .from('revenue_identities')
        .select('id, identity_name')
        .eq('organization_id', authCtx.orgId)
        .order('identity_name')
        .limit(200)
      for (const row of rows.data ?? []) {
        profiles.push({ id: row.id, identity_name: row.identity_name })
      }
    } catch {
      // The filter degrades to All / No profile rather than failing the page.
    }
  } else if (!teamView) {
    for (const identity of authorizedIdentities) {
      profiles.push({ id: identity.revenueIdentityId, identity_name: identity.identityName })
    }
  }

  if (!derived) {
    // DB path: when team-scoped without a specific owner, we still need owner
    // membership — load owned-by-self page is wrong. For team without owner
    // filter, fall through to the in-memory path so we can apply the set.
    if (teamView && !query.owner) {
      // Managers need teammates' leads — org fetch then filter to managed owners.
      const filtered = await loadScopedFilteredLeads(query)
      const start = (page - 1) * pageSize
      return {
        leads: filtered.rows.slice(start, start + pageSize),
        reps: filtered.reps,
        orgView: false,
        teamView: true,
        workspace: filtered.workspace,
        profiles,
        total: filtered.total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(filtered.total / pageSize)),
      }
    }

    const result = await store.listLeadsPage({
      q: query.q,
      owner: query.owner,
      profile: query.profile,
      identities: orgView || teamView ? undefined : executableIdentities,
      source: query.source,
      status: query.status,
      sort: query.sort,
      dir: query.dir,
      page,
      pageSize,
    })
    let pageLeads = result.leads
    if (teamView && managedOwners) {
      pageLeads = filterLeadsByTeamOwners(pageLeads, managedOwners, authCtx?.repId ?? '')
    }
    const scoped = orgView || teamView
      ? pageLeads
      : scopeLeadsToIdentities(pageLeads, executableIdentities)
    const leads = await enrichLeads(scoped, {
      authCtx,
      orgView: orgView || teamView,
      reps,
    })
    return {
      leads,
      reps,
      orgView,
      teamView,
      workspace,
      profiles,
      total: result.total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
    }
  }

  const filtered = await loadScopedFilteredLeads(query)
  const start = (page - 1) * pageSize

  return {
    leads: filtered.rows.slice(start, start + pageSize),
    reps: filtered.reps,
    orgView: filtered.orgView,
    teamView: filtered.teamView,
    workspace: filtered.workspace,
    profiles,
    total: filtered.total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(filtered.total / pageSize)),
  }
}

/** True when any filter that changes the result set is present. */
export function hasActiveLeadFilters(query: LeadsQuery): boolean {
  return Boolean(
    query.q?.trim() ||
    (query.owner && query.owner !== 'all') ||
    (query.profile && query.profile !== 'all') ||
    (query.source && query.source !== 'all') ||
    (query.status && query.status !== 'all') ||
    (query.priority && query.priority !== 'all') ||
    (query.stage && query.stage !== 'all'),
  )
}

/**
 * The Pipeline board under an active filter.
 *
 * Shares `loadScopedFilteredLeads` with the table, so counts and cards come from
 * the same canonical filter contract — never from a client-side slice of the
 * already-bounded card payload. The unfiltered board keeps the SQL aggregate
 * fast path in `loadBoardPreview`; filtering is a deliberate, bounded read.
 */
export async function loadFilteredBoard(
  query: LeadsQuery,
  cardLimit: number = BOARD_CARD_LIMIT,
): Promise<BoardPreview> {
  const filtered = await loadScopedFilteredLeads(query)

  const counts = {} as Record<PipelineStage, number>
  for (const stage of Object.keys(CARD_ORDER) as PipelineStage[]) counts[stage] = 0
  for (const lead of filtered.rows) counts[derivePipelineStage(lead)] += 1

  const cards = [...filtered.rows]
    .sort((a, b) => {
      const byStage = CARD_ORDER[derivePipelineStage(a)] - CARD_ORDER[derivePipelineStage(b)]
      if (byStage !== 0) return byStage
      const aAt = a.lastActivityAt ?? a.createdAt
      const bAt = b.lastActivityAt ?? b.createdAt
      return new Date(bAt).getTime() - new Date(aAt).getTime()
    })
    .slice(0, cardLimit)

  return { cards, counts, total: filtered.total, orgView: filtered.orgView, workspace: filtered.workspace }
}

/** The canonical column-filter contract shared by the table and the pipeline. */
export function applyCanonicalColumnFilters(leads: Lead[], query: LeadsQuery): Lead[] {
  const q = query.q?.trim().toLowerCase()
  // "all" is a UI sentinel, never a real value: treat it as no filter so any
  // caller — including a stale URL — gets the unfiltered set.
  const owner = query.owner && query.owner !== 'all' ? query.owner : null
  const profile = query.profile && query.profile !== 'all' ? query.profile : null
  const source = query.source && query.source !== 'all' ? query.source : null
  const status = query.status && query.status !== 'all' ? query.status : null
  return leads.filter((lead) => {
    if (owner === 'unassigned' && lead.ownerRepId) return false
    if (owner && owner !== 'unassigned' && lead.ownerRepId !== owner) return false
    if (profile === 'unassigned') {
      // No sending identity at all: neither a revenue identity nor a sender profile.
      if (lead.revenueIdentityId || lead.senderProfileId) return false
    } else if (profile) {
      if (lead.revenueIdentityId !== profile && lead.senderProfileId !== profile) return false
    }
    if (source && lead.source !== source) return false
    if (status && lead.status !== status) return false
    if (q) {
      const hay = `${lead.contactName ?? ''} ${lead.company ?? ''} ${lead.contactTitle ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
