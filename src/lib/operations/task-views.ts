import { classifyUnifiedTaskTab } from '@/lib/tasks/rank-unified-tasks'
import type { UnifiedTask } from '@/lib/tasks/types'

export type TaskView = 'all' | 'overdue' | 'today' | 'upcoming' | 'completed'

/** Board view membership. 'all' = every open task; the rest follow the canonical tab classifier. */
export function taskViewMatches(task: UnifiedTask, view: TaskView, now: number, timeZone = 'UTC'): boolean {
  const tab = classifyUnifiedTaskTab(task, now, timeZone)
  if (view === 'all') return tab !== 'completed'
  return tab === view
}
