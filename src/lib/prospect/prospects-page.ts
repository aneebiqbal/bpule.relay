import { createServerSupabase } from '@/lib/supabase/server'
/**
 * The Prospect workspace: Analyze | Recent | Saved | Watchlist.
 *
 * Analyze is the existing intake experience. Recent is the captured-prospect
 * record (the authority for "what did I check"), Saved is the leads those
 * captures became, and Watchlist is the canonical observe set. No second data
 * model — every tab reads an existing authority.
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
import type { CapturedProspect } from '@/lib/domain/types'

export interface ProspectsPageData {
  recent: CapturedProspect[]
  saved: LeadRow[]
  watchlist: LeadRow[]
  workspace: WorkspaceIdentity | null
  orgView: boolean
  /** sender profile id → display name, so every row can attribute its profile. */
  profiles: Record<string, string>
}

export async function loadProspectsPage(): Promise<ProspectsPageData> {
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

  const captured = await store.listCapturedProspects()
  const recent = scopeLeadsToWorkspace(captured, workspace, orgView)

  const board = await loadBoardData()
  const convertedInputs = new Set(
    recent.filter((row) => row.status === 'converted' && row.rawInput).map((row) => row.rawInput),
  )
  const saved = board.leads.filter((lead) => lead.rawInput && convertedInputs.has(lead.rawInput))
  const watchlist = board.leads.filter((lead) => derivePipelineStage(lead) === 'observe')

  const profiles: Record<string, string> = {}
  const profileIds = [
    ...new Set(recent.map((row) => row.senderProfileId).filter((id): id is string => Boolean(id))),
  ]
  if (profileIds.length > 0 && authCtx) {
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
  }

  return { recent, saved, watchlist, workspace, orgView, profiles }
}
