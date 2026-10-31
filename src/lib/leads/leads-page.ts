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
import { enrichLeads, scopeLeadsToWorkspace, type ActivityEvent } from '@/lib/leads/board-rows'
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
  workspace: WorkspaceIdentity | null
  reps: Array<{ id: string; name: string }>
  events: ActivityEvent[]
}

export async function loadLeadsPage(query: LeadsQuery): Promise<LeadsPageData> {
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

  const repsRes = orgView ? await store.listAllReps() : []
  const reps = (Array.isArray(repsRes) ? repsRes : []).map((rep) => ({ id: rep.id, name: rep.name }))

  if (!derived) {
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
    const scoped = orgView ? result.leads : scopeLeadsToWorkspace(result.leads, workspace, orgView)
    const { leads, events } = await enrichLeads(scoped, { authCtx, orgView, reps })
    return {
      leads,
      events,
      reps,
      orgView,
      workspace,
      total: result.total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
    }
  }

  const all: Lead[] = orgView ? await store.fetchLeadsAll() : await store.listOwnedLeads()
  const scoped = scopeLeadsToWorkspace(all, workspace, orgView)
  const { leads: enriched, events } = await enrichLeads(scoped, { authCtx, orgView, reps })
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
    events,
    reps,
    orgView,
    workspace,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}
