import { createServerSupabase } from '@/lib/supabase/server'
/**
 * Prospect workspace — the single loader and tab contract.
 *
 * The workspace is four views over existing authorities (Analyze | Recent |
 * Saved | Watchlist). Only the active view's data is required to render it, so
 * `loadProspectsView(tab)` loads exactly that and nothing else.
 *
 * The default view is Analyze, which renders the intake form and needs no lead
 * data at all. Every visit — including Analyze — used to pay for the full
 * enriched lead board (`loadBoardData`): all leads plus their messages,
 * conversation states and open tasks. That is the cost this module removes.
 */
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { isProductAdmin } from '@/lib/auth/admin-page'
import { createScoutStore } from '@/lib/store'
import { resolveActiveWorkspace } from '@/lib/workspace/resolve-active-identity'
import type { WorkspaceIdentity } from '@/lib/workspace/active-identity'
import { loadBoardData, scopeLeadsToWorkspace } from '@/lib/leads/board-rows'
import { chunkedIn } from '@/lib/supabase/chunked-in'
import { derivePipelineStage, type LeadRow } from '@/components/leads/pipeline-utils'
import type { RecentProspectRow } from '@/lib/domain/types'
import { prospectStatus, type ProspectStatus } from '@/lib/prospect/display'

/** The four Prospect views. Analyze is the default route; the rest are `?tab=`. */
export type ProspectTab = 'analyze' | 'recent' | 'saved' | 'watchlist'

/** True for the three URL-backed views; Analyze needs no `?tab=` parameter. */
export function isProspectTabParam(
  value: string | undefined,
): value is Exclude<ProspectTab, 'analyze'> {
  return value === 'recent' || value === 'saved' || value === 'watchlist'
}

/** A captured prospect plus its derived workspace status. */
export type RecentProspect = RecentProspectRow & { outcome: ProspectStatus }

export interface ProspectsViewData {
  tab: ProspectTab
  recent: RecentProspect[]
  saved: LeadRow[]
  watchlist: LeadRow[]
  workspace: WorkspaceIdentity | null
  orgView: boolean
  /** sender profile id → display name, for row attribution. */
  profiles: Record<string, string>
}

/** The Recent view is a bounded window, never the organisation's history. */
export const PROSPECT_RECENT_LIMIT = 50

/** Resolve the active sending identity once; every view needs it for context. */
async function loadWorkspace(): Promise<WorkspaceIdentity | null> {
  try {
    return await resolveActiveWorkspace()
  } catch {
    return null
  }
}

/** Narrow profile-name lookup for the Recent rows' "Analyzed for" column. */
async function loadProfileNames(
  recent: RecentProspect[],
  authCtx: Awaited<ReturnType<typeof getAuthContext>>,
): Promise<Record<string, string>> {
  const profiles: Record<string, string> = {}
  const profileIds = [
    ...new Set(recent.map((row) => row.senderProfileId).filter((id): id is string => Boolean(id))),
  ]
  if (profileIds.length === 0 || !authCtx) return profiles
  try {
    const client = await createServerSupabase()
    const rows = await chunkedIn<{ id: string; display_name: string | null; full_name: string | null }>(
      profileIds,
      (chunk) => client
        .from('profiles')
        .select('id, display_name, full_name')
        .eq('organization_id', authCtx.orgId)
        .in('id', chunk),
    )
    for (const row of rows) {
      profiles[row.id as string] = (row.display_name ?? row.full_name ?? 'Profile') as string
    }
  } catch {
    // Attribution degrades to "not assigned", never to a guess.
  }
  return profiles
}

/**
 * Load only the data the active Prospect view renders.
 *
 * - `analyze`   → workspace context only. No lead, message, task or state read.
 * - `watchlist` → the Observe-stage leads.
 * - `recent`    → the bounded captured-prospect projection + profile names.
 * - `saved`     → the leads a captured prospect was converted into.
 */
export async function loadProspectsView(tab: ProspectTab): Promise<ProspectsViewData> {
  const user = await getCurrentUser()
  const authCtx = await getAuthContext()
  const store = await createScoutStore()
  const orgView = isProductAdmin(user, authCtx)
  const workspace = await loadWorkspace()

  // The default view. Nothing here needs the lead board.
  if (tab === 'analyze') {
    return { tab, recent: [], saved: [], watchlist: [], workspace, orgView, profiles: {} }
  }

  // The board feeds Saved, Watchlist and Recent's converted-lead status. A
  // failure degrades those views to empty rather than crashing the page — the
  // Analyze view and the rest of the shell stay fully usable.
  let board: Awaited<ReturnType<typeof loadBoardData>> | null = null
  try {
    board = await loadBoardData()
  } catch (err) {
    console.error('[prospects-view] board load failed:', err)
  }
  const leads = board?.leads ?? []
  const stageById = new Map(leads.map((lead) => [lead.id, derivePipelineStage(lead)]))

  if (tab === 'watchlist') {
    return {
      tab,
      recent: [],
      saved: [],
      watchlist: leads.filter((lead) => stageById.get(lead.id) === 'observe'),
      workspace,
      orgView,
      profiles: {},
    }
  }

  // Bounded (50) and blob-free: the Recent list never transfers rawInput or the
  // canonical blob, and never reads the organisation's full history.
  const captured = await store.listRecentProspects(PROSPECT_RECENT_LIMIT)
  const recent = scopeLeadsToWorkspace(captured, workspace, orgView).map((row) => ({
    ...row,
    outcome: prospectStatus(row, row.convertedLeadId ? stageById.get(row.convertedLeadId) ?? null : null),
  }))

  if (tab === 'recent') {
    return {
      tab,
      recent,
      saved: [],
      watchlist: [],
      workspace,
      orgView,
      profiles: await loadProfileNames(recent, authCtx),
    }
  }

  // A saved lead is one a captured prospect was converted into — the persisted
  // convertedLeadId link, not a raw-text comparison.
  const convertedLeadIds = new Set(
    recent.filter((row) => row.status === 'converted' && row.convertedLeadId).map((row) => row.convertedLeadId!),
  )
  return {
    tab,
    recent: [],
    saved: leads.filter((lead) => convertedLeadIds.has(lead.id)),
    watchlist: [],
    workspace,
    orgView,
    profiles: {},
  }
}
