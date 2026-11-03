import type { UnifiedTask, UnifiedTaskKind, UnifiedTaskPriority } from '@/lib/tasks/types'
import { overdueSeverity } from '@/lib/rep-home/action-presentation'

export type UnifiedTaskTab = 'today' | 'overdue' | 'upcoming' | 'completed' | 'all'

const PRIORITY_RANK: Record<UnifiedTaskPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
}

function kindRank(task: UnifiedTask): number {
  // Spec order for "Do this next":
  // CRITICAL assigned → REPLY → OVERDUE FOLLOW_UP → HIGH assigned →
  // PROPOSAL/MEETING → HIGH opportunity → RESEARCH/REVIEW → NORMAL assigned
  if (task.source === 'ASSIGNED' && task.priority === 'CRITICAL') return 0
  if (task.kind === 'REPLY') return 1
  if (task.kind === 'FOLLOW_UP' && isOverdue(task)) return 2
  if (task.source === 'ASSIGNED' && task.priority === 'HIGH') return 3
  if (task.kind === 'PROPOSAL' || task.kind === 'MEETING') return 4
  if (task.priority === 'HIGH' && (task.kind === 'RESEARCH' || task.kind === 'CONNECT' || task.kind === 'SEND_MESSAGE')) {
    return 5
  }
  if (task.kind === 'RESEARCH' || task.kind === 'REVIEW') return 6
  if (task.source === 'ASSIGNED' && task.priority === 'NORMAL') return 7
  if (task.kind === 'FOLLOW_UP') return 8
  if (task.source === 'ASSIGNED') return 9
  return 10
}

export function isOverdue(task: UnifiedTask, now = Date.now()): boolean {
  if (task.status !== 'OPEN' && task.status !== 'IN_PROGRESS') return false
  if (task.dueAt) {
    const due = new Date(task.dueAt).getTime()
    return !Number.isNaN(due) && due < now
  }
  // Derived replies waiting too long — use wait age, do not invent dueAt.
  if (task.source === 'DERIVED' && task.kind === 'REPLY') {
    return overdueSeverity(task.createdAt, now) !== 'none' && overdueSeverity(task.createdAt, now) !== 'mild'
  }
  return false
}

export function classifyUnifiedTaskTab(task: UnifiedTask, now = Date.now()): Exclude<UnifiedTaskTab, 'all'> {
  if (task.status === 'DONE' || task.status === 'CANCELLED') return 'completed'
  if (isOverdue(task, now)) return 'overdue'
  if (
    task.priority === 'CRITICAL'
    || task.priority === 'HIGH'
    || task.kind === 'REPLY'
    || task.kind === 'FOLLOW_UP'
    || (task.source === 'ASSIGNED' && isDueToday(task, now))
  ) {
    return 'today'
  }
  return 'upcoming'
}

function isDueToday(task: UnifiedTask, now: number): boolean {
  if (!task.dueAt) return false
  const due = new Date(task.dueAt)
  const d = new Date(now)
  return (
    due.getFullYear() === d.getFullYear()
    && due.getMonth() === d.getMonth()
    && due.getDate() === d.getDate()
  )
}

/**
 * Rank unified tasks for Rep Home "Do this next" and workspace defaults.
 * Does not override canonical safety — only orders presentation.
 */
export function rankUnifiedTasks(tasks: UnifiedTask[]): UnifiedTask[] {
  return [...tasks]
    .filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS')
    .sort((a, b) => {
      const byKind = kindRank(a) - kindRank(b)
      if (byKind !== 0) return byKind
      const byPri = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (byPri !== 0) return byPri
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY
      if (aDue !== bDue) return aDue - bDue
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
}

export function filterUnifiedTasks(
  tasks: UnifiedTask[],
  opts: {
    tab?: UnifiedTaskTab
    kind?: UnifiedTaskKind | 'ALL'
    priority?: UnifiedTaskPriority | 'ALL'
    source?: 'DERIVED' | 'ASSIGNED' | 'ALL'
    profileId?: string | 'ALL'
    assigneeRepId?: string | 'ALL'
    now?: number
  },
): UnifiedTask[] {
  const now = opts.now ?? Date.now()
  return tasks.filter((t) => {
    if (opts.tab && opts.tab !== 'all') {
      if (classifyUnifiedTaskTab(t, now) !== opts.tab) return false
    }
    if (opts.kind && opts.kind !== 'ALL' && t.kind !== opts.kind) return false
    if (opts.priority && opts.priority !== 'ALL' && t.priority !== opts.priority) return false
    if (opts.source && opts.source !== 'ALL' && t.source !== opts.source) return false
    if (opts.profileId && opts.profileId !== 'ALL' && t.profileId !== opts.profileId) return false
    if (opts.assigneeRepId && opts.assigneeRepId !== 'ALL' && t.assigneeRepId !== opts.assigneeRepId) {
      return false
    }
    return true
  })
}

/** Cross-home parity helper: open-task count for the same filters. */
export function countOpenUnifiedTasks(tasks: UnifiedTask[]): number {
  return tasks.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length
}

export function countOverdueUnifiedTasks(tasks: UnifiedTask[], now = Date.now()): number {
  return tasks.filter((t) => isOverdue(t, now)).length
}
