/**
 * Lead archival policy.
 *
 * The follow-up cadence itself now lives in ONE canonical module
 * (`src/lib/conversation/follow-up-policy.ts`); this file re-exports those
 * arithmetic helpers so existing importers keep working, and keeps only the
 * archive-eligibility rule (a housekeeping sweep, not a cadence decision).
 */

import { calendarDaysBetween } from '@/lib/conversation/follow-up-policy'

export {
  FOLLOW_UP_DUE_CALENDAR_DAYS,
  MAX_FOLLOWUPS_PER_LEAD,
  calendarDaysBetween,
  businessDaysBetween,
  followupDueInDays,
  isFollowupDue,
  FOLLOW_UP_POLICY_VERSION,
} from '@/lib/conversation/follow-up-policy'

export type {
  FollowUpPolicyInput,
  FollowUpPolicyResult,
} from '@/lib/conversation/follow-up-policy'

/**
 * Lead archival: how many follow-ups a lead may receive before it is
 * eligible for the daily archival sweep. Same cap as the follow-up policy —
 * a lead is only archive-eligible once ALL follow-ups have actually been used.
 */
export const ARCHIVE_ELIGIBLE_FOLLOWUP_COUNT = 3

/**
 * How many PLAIN calendar days (not business days) must have passed since
 * the last outbound send, with no reply, before a lead is archive-eligible.
 * Deliberately calendar days, not business days: this is a housekeeping
 * sweep, not an outreach-timing decision.
 */
export const ARCHIVE_ELIGIBLE_DAYS_SINCE_LAST_SEND = 3

/**
 * Pure archive-eligibility check (approved design): a lead becomes
 * archive-eligible when BOTH hold:
 *   1. All 3 follow-ups have been sent (followupCount >= 3)
 *   2. At least 3 full calendar days have passed since the last outbound
 *      send, with no reply received since.
 *
 * `lastSendAt` is the sent_at of the most recent non-reply outbound message;
 * pass null when there has never been an outbound send (never eligible).
 * `hasRepliedSinceLastSend` must be true whenever the lead's status is
 * 'replied', or a reply-type message exists after lastSendAt.
 */
export function isArchiveEligible(input: {
  followupCount: number
  lastSendAt: string | null
  hasRepliedSinceLastSend: boolean
  now?: Date
}): boolean {
  const { followupCount, lastSendAt, hasRepliedSinceLastSend, now = new Date() } = input
  if (hasRepliedSinceLastSend) return false
  if (followupCount < ARCHIVE_ELIGIBLE_FOLLOWUP_COUNT) return false
  if (!lastSendAt) return false

  const last = new Date(lastSendAt)
  const elapsedMs = now.getTime() - last.getTime()
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000)
  return elapsedDays >= ARCHIVE_ELIGIBLE_DAYS_SINCE_LAST_SEND
}
