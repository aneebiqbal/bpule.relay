/**
 * Canonical follow-up policy — the ONE place a follow-up decision is made.
 *
 * Every consumer (queue engine, Today, lead detail, follow-up API, cron, the
 * composer, admin views) reads `evaluateFollowUpPolicy`. There is no other
 * clock. The legacy clocks were:
 *   - DB trigger 0033  → 5 business days, 1 follow-up (outlier)
 *   - relay/timing-engine.ts → 24 h window (dead code, only used by dead
 *     orchestration/next-action.ts)
 * `conversation_states.next_followup_at` is a persisted copy of this policy's
 * `nextFollowupAt`, written by markContacted() after a real send and read by the
 * admin command center. It is a snapshot, not a second clock: it is computed
 * here and stored there.
 * The live product behaviour was the 3/6/6 calendar-day cadence, max 3
 * follow-ups; this module keeps that behaviour and makes it single-source.
 *
 * Business-day arithmetic lives here too, so any future policy that needs
 * working days uses one implementation.
 */

import { isTerminalLeadStatus } from './terminal'
import type { SalesOutcome } from '@/lib/sales/outcomes'

export const FOLLOW_UP_POLICY_VERSION = 'follow_up_policy_v1'

/** Calendar days required before the next follow-up, indexed by followupCount. */
export const FOLLOW_UP_DUE_CALENDAR_DAYS: Record<number, number> = {
  0: 3,
  1: 6,
  2: 6,
}

/** Maximum follow-ups per lead. */
export const MAX_FOLLOWUPS_PER_LEAD = 3

const DAY_MS = 1000 * 60 * 60 * 24

/** Number of whole calendar days between two instants, floor-rounded. */
export function calendarDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

/** Number of whole business days (Mon-Fri) between two instants, floor-rounded. */
export function businessDaysBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  let count = 0
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(0, 0, 0, 0)
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1)
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) count += 1
  }
  return count
}

/** Calendar days required before the next follow-up, given how many have been sent. */
export function followupDueInDays(followupCount: number): number {
  if (followupCount < 0) return FOLLOW_UP_DUE_CALENDAR_DAYS[0]
  return FOLLOW_UP_DUE_CALENDAR_DAYS[followupCount] ?? FOLLOW_UP_DUE_CALENDAR_DAYS[2]
}

export function isFollowupDue(sentAt: string, hasReplied: boolean, now: Date = new Date(), followupCount = 0): boolean {
  if (hasReplied) return false
  return calendarDaysBetween(new Date(sentAt), now) >= followupDueInDays(followupCount)
}

export interface FollowUpPolicyInput {
  leadStatus: string | null
  outcome?: SalesOutcome | string | null
  conversationStage?: string | null
  lastOutboundAt: string | null
  lastInboundAt: string | null
  followupCount: number
  /** An explicit date the client asked to be contacted again. */
  deferralDate?: string | null
  channel: string
  organizationTimezone?: string | null
  now?: Date
}

export interface FollowUpPolicyResult {
  eligible: boolean
  nextFollowupAt: string | null
  reason: string
  policyVersion: string
  terminal: boolean
  cancelledByReply: boolean
  cancelledByOutcome: boolean
}

const TERMINAL_OUTCOMES: ReadonlySet<string> = new Set(['WON', 'LOST', 'DO_NOT_CONTACT'])

function reason(terminal: boolean, cancelledByReply: boolean, cancelledByOutcome: boolean): string {
  if (terminal) return 'Terminal outcome: no follow-up is allowed.'
  if (cancelledByReply) return 'The client replied; a cold follow-up is cancelled.'
  if (cancelledByOutcome) return 'The client declined or opted out; no follow-up.'
  return ''
}

/**
 * The single follow-up decision. Pure: plain data in, plain result out, so it
 * can be unit-tested without a database and consumed by every surface.
 */
export function evaluateFollowUpPolicy(input: FollowUpPolicyInput): FollowUpPolicyResult {
  const now = input.now ?? new Date()
  const version = FOLLOW_UP_POLICY_VERSION

  const terminal =
    isTerminalLeadStatus(input.leadStatus) ||
    (!!input.outcome && TERMINAL_OUTCOMES.has(String(input.outcome)))
  if (terminal) {
    return { eligible: false, nextFollowupAt: null, reason: 'Terminal outcome: no follow-up is allowed.', policyVersion: version, terminal: true, cancelledByReply: false, cancelledByOutcome: true }
  }

  if (!input.lastOutboundAt) {
    return { eligible: false, nextFollowupAt: null, reason: 'No outbound message has been sent yet.', policyVersion: version, terminal: false, cancelledByReply: false, cancelledByOutcome: false }
  }

  const lastOut = new Date(input.lastOutboundAt)
  const lastIn = input.lastInboundAt ? new Date(input.lastInboundAt) : null
  if (lastIn && lastIn >= lastOut) {
    return { eligible: false, nextFollowupAt: null, reason: 'The client replied after our last message.', policyVersion: version, terminal: false, cancelledByReply: true, cancelledByOutcome: false }
  }

  if (input.followupCount >= MAX_FOLLOWUPS_PER_LEAD) {
    return { eligible: false, nextFollowupAt: null, reason: `All ${MAX_FOLLOWUPS_PER_LEAD} follow-ups have been used.`, policyVersion: version, terminal: false, cancelledByReply: false, cancelledByOutcome: false }
  }

  // An explicit deferral date is the client's own instruction; it overrides the cadence.
  if (input.deferralDate) {
    const deferral = new Date(input.deferralDate)
    if (!Number.isNaN(deferral.getTime())) {
      const due = deferral.getTime() <= now.getTime()
      return {
        eligible: due,
        nextFollowupAt: due ? null : deferral.toISOString(),
        reason: due ? 'The client\'s requested date has arrived.' : `The client asked to be contacted on ${deferral.toISOString().slice(0, 10)}.`,
        policyVersion: version,
        terminal: false,
        cancelledByReply: false,
        cancelledByOutcome: false,
      }
    }
  }

  const dueIn = followupDueInDays(input.followupCount)
  const daysSince = calendarDaysBetween(lastOut, now)
  const nextAt = new Date(lastOut.getTime() + dueIn * DAY_MS)
  const eligible = daysSince >= dueIn
  return {
    eligible,
    nextFollowupAt: eligible ? null : nextAt.toISOString(),
    reason: eligible
      ? `No reply after ${daysSince} calendar days (due at ${dueIn}).`
      : `Not due yet: ${daysSince}/${dueIn} calendar days since the last message.`,
    policyVersion: version,
    terminal: false,
    cancelledByReply: false,
    cancelledByOutcome: false,
  }
}

/** Convenience: the next follow-up timestamp, or null when due/terminal. */
export function nextFollowUpAt(input: FollowUpPolicyInput): string | null {
  return evaluateFollowUpPolicy(input).nextFollowupAt
}

/** A human reason that is always populated, even for the blocked cases. */
export function followUpReason(input: FollowUpPolicyInput): string {
  return evaluateFollowUpPolicy(input).reason || reason(false, false, false)
}
