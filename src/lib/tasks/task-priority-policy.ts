import type { RelayTodayAction } from '@/components/relay-today-workspace'
import { TODAY_FOLLOWUP_KINDS, TODAY_REPLY_KINDS } from '@/lib/relay/today-counts'
import type { UnifiedTaskKind, UnifiedTaskPriority } from '@/lib/tasks/types'
import { overdueSeverity } from '@/lib/rep-home/action-presentation'

const REPLY_SET = new Set<string>(TODAY_REPLY_KINDS)
const FOLLOWUP_SET = new Set<string>(TODAY_FOLLOWUP_KINDS)

/** Single mapping for derived-task priority — no page-specific overrides. */
export function derivedTaskPriority(action: RelayTodayAction, now = Date.now()): UnifiedTaskPriority {
  if (action.kind === 'admin_review') return 'CRITICAL'

  if (REPLY_SET.has(action.kind)) {
    const raw = `${action.whatHappened} ${action.whyItMatters}`.toLowerCase()
    if (raw.includes('thread') && (raw.includes('mismatch') || raw.includes('review'))) return 'CRITICAL'
    if (raw.includes('positive') || action.priority === 'urgent') return 'HIGH'
    return 'HIGH'
  }

  if (FOLLOWUP_SET.has(action.kind)) {
    const sev = overdueSeverity(action.createdAt, now)
    if (sev === 'critical') return 'HIGH'
    return 'NORMAL'
  }

  if (action.kind === 'proposal_ready' || action.humanAction === 'APPLY_UPWORK') return 'HIGH'
  if (action.kind === 'high_fit_lead' || action.kind === 'new_opportunity') {
    if (action.humanAction === 'RESEARCH') return 'NORMAL'
    return action.priority === 'urgent' || action.priority === 'high' ? 'HIGH' : 'NORMAL'
  }
  if (action.kind === 'connection_dm_due') return 'NORMAL'
  if (action.humanAction === 'RESEARCH') return 'NORMAL'
  if (action.priority === 'urgent') return 'CRITICAL'
  if (action.priority === 'high') return 'HIGH'
  if (action.priority === 'low') return 'LOW'
  return 'NORMAL'
}

export function derivedTaskKind(action: RelayTodayAction): UnifiedTaskKind {
  if (REPLY_SET.has(action.kind)) return 'REPLY'
  if (FOLLOWUP_SET.has(action.kind)) return 'FOLLOW_UP'
  if (action.kind === 'proposal_ready' || action.humanAction === 'RESUME_DRAFT') return 'PROPOSAL'
  if (action.kind === 'connection_dm_due') {
    return action.humanAction === 'SEND_CONNECTION' ? 'CONNECT' : 'SEND_MESSAGE'
  }
  if (action.humanAction === 'RESEARCH' || action.kind === 'high_fit_lead') return 'RESEARCH'
  if (action.kind === 'admin_review' || action.humanAction === 'REVIEW_REFERRAL') return 'REVIEW'
  if (action.kind === 'job_worth_apply') return 'ADMIN'
  return 'REVIEW'
}

export function assignedKindToUnified(kind: string): UnifiedTaskKind {
  switch (kind) {
    case 'ADMIN':
      return 'ADMIN'
    case 'REVIEW':
    case 'REQUEST_UPDATE':
      return 'REVIEW'
    case 'RESEARCH':
      return 'RESEARCH'
    case 'PREPARE_PROPOSAL':
      return 'PROPOSAL'
    case 'CALL':
    case 'CUSTOM':
    default:
      return 'CUSTOM'
  }
}
