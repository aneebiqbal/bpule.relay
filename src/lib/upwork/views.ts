/**
 * Upwork views and next actions — derived from canonical facts only.
 * Follow-up due and archive candidate are computed, never stored statuses.
 */
import { followUpDueAt, isArchiveCandidate, type UpworkJobStatus } from '@/lib/upwork/lifecycle'

export type UpworkView =
  | 'needs_action'
  | 'saved'
  | 'draft_ready'
  | 'applied'
  | 'client_replied'
  | 'interview'
  | 'won'
  | 'lost'
  | 'archived'
  | 'all'

export interface UpworkJobFacts {
  status: UpworkJobStatus
  submittedAt: string | null
  followUps: readonly string[]
  firstReplyAt: string | null
  now: string
}

const STATUS_VIEW: Record<UpworkJobStatus, UpworkView> = {
  SAVED: 'saved',
  DRAFT_READY: 'draft_ready',
  APPLIED: 'applied',
  CLIENT_REPLIED: 'client_replied',
  INTERVIEW: 'interview',
  WON: 'won',
  LOST: 'lost',
  ARCHIVED: 'archived',
}

export function upworkJobView(facts: UpworkJobFacts): UpworkView {
  return STATUS_VIEW[facts.status]
}

export function isNeedsAction(facts: UpworkJobFacts): boolean {
  if (facts.status === 'SAVED' || facts.status === 'DRAFT_READY') return true
  if (facts.status === 'CLIENT_REPLIED' || facts.status === 'INTERVIEW') return true
  if (facts.status !== 'APPLIED') return false
  if (facts.firstReplyAt) return false
  const due = followUpDueAt(facts.submittedAt, facts.followUps, facts.firstReplyAt)
  if (due && due <= facts.now) return true
  return isArchiveCandidate(facts.submittedAt, facts.followUps, facts.firstReplyAt, facts.now)
}

export function upworkNextAction(facts: UpworkJobFacts): string | null {
  if (facts.status === 'SAVED') return 'Review this job'
  if (facts.status === 'DRAFT_READY') return 'Apply now'
  if (facts.status === 'CLIENT_REPLIED') return 'Reply to the client'
  if (facts.status === 'INTERVIEW') return 'Prepare for the interview'
  if (facts.status !== 'APPLIED' || facts.firstReplyAt) return null
  if (isArchiveCandidate(facts.submittedAt, facts.followUps, facts.firstReplyAt, facts.now)) {
    return 'Ready to archive'
  }
  const due = followUpDueAt(facts.submittedAt, facts.followUps, facts.firstReplyAt)
  if (due && due <= facts.now) return 'Follow up'
  return null
}
