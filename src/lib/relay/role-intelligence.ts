import type {
  RelayQueue,
  RelayRole,
  RelayRoleContext,
  RelayTask,
  Rep,
  Organization,
} from '@/lib/domain/types'
import type { RateMetric } from '@/lib/store/types'
import { filterQueueByRole } from './queue-engine'

/**
 * Role Intelligence
 *
 * ADMIN: "What should my team focus on? Who needs help? What is working?"
 * BD: "What should I do next? Why? Give me everything needed to do it well."
 */

export interface BDView {
  nextAction: RelayTask | null
  queue: RelayTask[]
  focus: string
  guidance: string
}

export interface AdminQueue {
  task: RelayTask
  repName: string | null
}

export interface AdminView {
  hotActions: AdminQueue[]
  teamNeeds: AdminQueue[]
  coldWarnings: AdminQueue[]
  working: {
    topPerformer: string | null
    bestSignal: string | null
    replyRate: number | null
  }
}

/**
 * Get the BD view: what should I do next, and what's the full queue.
 */
export function getBDView(queue: RelayQueue): BDView {
  const filtered = filterQueueByRole(queue, 'bd')
  const [next, ...rest] = filtered

  const urgentCount = filtered.filter((t) => t.priority === 'urgent').length
  const highCount = filtered.filter((t) => t.priority === 'high').length

  let focus = ''
  let guidance = ''

  if (urgentCount > 0) {
    focus = `${urgentCount} urgent ${urgentCount === 1 ? 'action' : 'actions'} need your attention`
    guidance = 'Start at the top. Urgent items are replies and time-sensitive follow-ups.'
  } else if (highCount > 0) {
    focus = `${highCount} high-priority ${highCount === 1 ? 'opportunity' : 'opportunities'}`
    guidance = 'Work the high-priority queue while energy is fresh.'
  } else if (filtered.length > 0) {
    focus = `${filtered.length} items in your queue`
    guidance = 'Review the queue and work what matters most today.'
  } else {
    focus = 'Nothing needs attention right now'
    guidance = 'Good time to prospect, refine profiles, or work on content.'
  }

  return {
    nextAction: next ?? null,
    queue: rest,
    focus,
    guidance,
  }
}

/**
 * Get the ADMIN view: team focus, who needs help, what is working.
 */
export function getAdminView(queue: RelayQueue, teamRate: RateMetric | null): AdminView {
  const allTasks = queue.tasks

  const hotActions: AdminQueue[] = []
  const teamNeeds: AdminQueue[] = []
  const coldWarnings: AdminQueue[] = []

  for (const task of allTasks) {
    const entry: AdminQueue = {
      task,
      repName: task.kind === 'admin_review' ? null : inferRepName(task, queue.roleContext.rep),
    }

    if (task.kind === 'reply_needed') {
      hotActions.push(entry)
    } else if (task.kind === 'admin_review') {
      teamNeeds.push(entry)
    } else if (task.kind === 'lead_going_cold') {
      coldWarnings.push(entry)
    }
  }

  // Limit to most relevant
  return {
    hotActions: hotActions.slice(0, 5),
    teamNeeds: teamNeeds.slice(0, 5),
    coldWarnings: coldWarnings.slice(0, 5),
    working: {
      topPerformer: null, // Would require team stats query
      bestSignal: findBestSignal(allTasks),
      replyRate: teamRate?.replyRate ?? null,
    },
  }
}

function inferRepName(task: RelayTask, currentRep: Rep): string | null {
  // In a real implementation, we'd have rep info per task
  // For now, return null — the UI shows entity IDs
  return null
}

function findBestSignal(tasks: RelayTask[]): string | null {
  const signalCounts = new Map<string, number>()
  for (const t of tasks) {
    if (t.kind === 'reply_needed' || t.kind === 'followup_due') {
      const sig = t.whatHappened.match(/type: (\d)/)?.[1]
      if (sig) signalCounts.set(sig, (signalCounts.get(sig) ?? 0) + 1)
    }
  }
  let best: string | null = null
  let bestCount = 0
  for (const [sig, count] of signalCounts) {
    if (count > bestCount) {
      best = sig
      bestCount = count
    }
  }
  return best ? `Signal ${best}` : null
}

/**
 * Build the role context from a rep + organization.
 */
export function buildRoleContext(rep: Rep, org: Organization): RelayRoleContext {
  return {
    role: rep.role === 'admin' ? 'admin' : 'bd',
    rep,
    organization: org,
  }
}

/**
 * Determine what the UI should emphasize based on role.
 */
export function getRoleUIRole(role: RelayRole): {
  showTeamView: boolean
  showAdminTasks: boolean
  emptyStateAction: string
} {
  if (role === 'admin') {
    return {
      showTeamView: true,
      showAdminTasks: true,
      emptyStateAction: 'Team is on track. Check back after the next batch of leads.',
    }
  }
  return {
    showTeamView: false,
    showAdminTasks: false,
    emptyStateAction: 'Nothing needs your attention. Time to prospect or create.',
  }
}
