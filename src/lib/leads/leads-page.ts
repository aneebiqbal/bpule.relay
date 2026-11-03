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
import { isProductAdmin } from '@/lib/auth/admin-page'
import { createScoutStore } from '@/lib/store'
import { resolveActiveWorkspace } from '@/lib/workspace/resolve-active-identity'
import type { WorkspaceIdentity } from '@/lib/workspace/active-identity'
import { enrichLeads, scopeLeadsToWorkspace } from '@/lib/leads/board-rows'
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

  if (!derived) {
    // DB path: when team-scoped without a specific owner, we still need owner
    // membership — load owned-by-self page is wrong. For team without owner
    // filter, fall through to the in-memory path so we can apply the set.
    if (teamView && !query.owner) {
      // Managers need teammates' leads — org fetch then filter to managed owners.
      const orgLeads = await store.fetchLeadsAll()
      const teamLeads = filterLeadsByTeamOwners(
        orgLeads,
        managedOwners ?? new Set(),
        authCtx?.repId ?? '',
      )
      const filtered = applyColumnFilters(teamLeads, query)
      const enriched = await enrichLeads(filtered, {
        authCtx,
        orgView: true,
        reps,
      })
      const sorted = sortLeadRows(enriched, query.sort, query.dir)
      const total = sorted.length
      const start = (page - 1) * pageSize
      return {
        leads: sorted.slice(start, start + pageSize),
        reps,
        orgView: false,
        teamView: true,
        workspace,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      }
    }

    const result = await store.listLeadsPage({
      q: query.q,
      owner: query.owner,
      profile: query.profile,
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
      : scopeLeadsToWorkspace(pageLeads, workspace, false)
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
      total: result.total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
    }
  }

  const all: Lead[] = orgView
    ? await store.fetchLeadsAll()
    : teamView
      ? filterLeadsByTeamOwners(
          await store.fetchLeadsAll(),
          managedOwners ?? new Set(),
          authCtx?.repId ?? '',
        )
      : await store.listOwnedLeads()
  const scoped = orgView || teamView
    ? all
    : scopeLeadsToWorkspace(all, workspace, false)
  const columnFiltered = applyColumnFilters(scoped, query)
  const enriched = await enrichLeads(columnFiltered, {
    authCtx,
    orgView: orgView || teamView,
    reps,
  })
  const filtered = enriched.filter((lead) => {
    if (stage && derivePipelineStage(lead) !== stage) return false
    if (priority && leadPriority(lead) !== priority) return false
    return true
  })
  const sorted = sortLeadRows(filtered, query.sort, query.dir)
  const total = sorted.length
  const start = (page - 1) * pageSize

  return {
    leads: sorted.slice(start, start + pageSize),
    reps,
    orgView,
    teamView,
    workspace,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

function applyColumnFilters(leads: Lead[], query: LeadsQuery): Lead[] {
  const q = query.q?.trim().toLowerCase()
  return leads.filter((lead) => {
    if (query.owner === 'unassigned' && lead.ownerRepId) return false
    if (query.owner && query.owner !== 'unassigned' && lead.ownerRepId !== query.owner) return false
    if (query.profile) {
      const id = query.profile
      if (lead.revenueIdentityId !== id && lead.senderProfileId !== id) return false
    }
    if (query.source && lead.source !== query.source) return false
    if (query.status && lead.status !== query.status) return false
    if (q) {
      const hay = `${lead.contactName ?? ''} ${lead.company ?? ''} ${lead.contactTitle ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
