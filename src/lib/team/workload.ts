import type { PeopleRow } from '@/lib/operations/people'

/**
 * Workload is context, not a performance score. One row per person with the
 * counts a manager compares: open pipeline, replies waiting, overdue tasks and
 * follow-ups. No combined "score" is derived here.
 */
export interface WorkloadRow {
  repId: string
  repName: string
  open: number
  openLeads: number
  replies: number
  overdueTasks: number
  followUps: number
  targetPct: number
}

export function buildWorkloadRows(rows: PeopleRow[]): WorkloadRow[] {
  return rows
    .map((r) => {
      const open = r.openLeads + r.repliesWaiting + r.followUpsOverdue + r.overdueTasks
      return {
        repId: r.repId,
        repName: r.repName,
        open,
        openLeads: r.openLeads,
        replies: r.repliesWaiting,
        overdueTasks: r.overdueTasks,
        followUps: r.followUpsOverdue,
        targetPct: Math.round(r.targetPct),
      }
    })
    .sort((a, b) => b.open - a.open || a.repName.localeCompare(b.repName))
}

/** Largest open-workload in the set — the bar scale. 1 when everyone is clear. */
export function workloadScale(rows: WorkloadRow[]): number {
  return Math.max(1, ...rows.map((r) => r.open))
}
