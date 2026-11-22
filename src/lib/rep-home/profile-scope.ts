import type { Lead } from '@/lib/domain/types'
import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import { leadBelongsToWorkspace, type WorkspaceIdentity } from '@/lib/workspace/active-identity'
import { leadIdFromAction } from '@/lib/rep-home/action-presentation'

export function filterLeadsByWorkspace<T extends Lead>(
  leads: T[],
  workspace: WorkspaceIdentity | null,
): T[] {
  if (!workspace) return leads
  return leads.filter((lead) => leadBelongsToWorkspace(lead, workspace))
}

export function filterActionsByWorkspace(
  actions: RelayTodayAction[],
  leadsById: Map<string, Lead>,
  workspace: WorkspaceIdentity | null,
): RelayTodayAction[] {
  if (!workspace) return actions
  return actions.filter((action) => {
    const leadId = leadIdFromAction(action)
    if (!leadId) return true
    const lead = leadsById.get(leadId)
    if (!lead) return false
    return leadBelongsToWorkspace(lead, workspace)
  })
}

export function sliceTargetSummaryForWorkspace(
  byIdentity: RepWorkspaceIdentityTargets[],
  workspace: WorkspaceIdentity | null,
): RepWorkspaceIdentityTargets[] {
  if (!workspace) return byIdentity
  return byIdentity.filter((row) => row.revenueIdentityId === workspace.id)
}

export interface RepWorkspaceIdentityTargets {
  assignmentId: string
  revenueIdentityId: string
  identityName: string
  title: string | null
  channel: string
  targets: Array<{
    targetId: string
    activityType: string
    /** The channel lane's full requirement. */
    targetCount: number
    /** This rep's personal expectation (allocation or solo lane). */
    personalTargetCount: number
    completedCount: number
    remaining: number
    status: string
  }>
}

export function sumTargets(rows: RepWorkspaceIdentityTargets[]) {
  return rows.reduce(
    (acc, row) => {
      for (const t of row.targets) {
        acc.totalTarget += t.personalTargetCount ?? t.targetCount
        acc.totalCompleted += t.completedCount
        acc.totalRemaining += Math.max(0, (t.personalTargetCount ?? t.targetCount) - t.completedCount)
      }
      return acc
    },
    { totalTarget: 0, totalCompleted: 0, totalRemaining: 0 },
  )
}
