/**
 * The rep-day state machine.
 *
 * One pure function owns the transition between states. No page, route or
 * component decides a rep's status independently — they all read this result.
 *
 *   NOT_STARTED → ACTIVE → AT_RISK → CRITICAL → READY_TO_CLOSE → CLOSED
 *                                                          ↘ MISSED
 *
 * Time comes in as an argument, so the whole machine is deterministic and the
 * browser E2E can walk a full day without waiting for it.
 */
import {
  isAfterWorkday,
  isBeforeWorkday,
  minutesRemaining,
  workdayProgress,
  type OperatingPolicy,
} from '@/lib/org-clock'
import { computePace, type PaceResult } from './pacing'

export type RepDayState =
  | 'NOT_STARTED'
  | 'ACTIVE'
  | 'AT_RISK'
  | 'CRITICAL'
  | 'READY_TO_CLOSE'
  | 'CLOSED'
  | 'MISSED'

export const REP_DAY_STATES: RepDayState[] = [
  'NOT_STARTED',
  'ACTIVE',
  'AT_RISK',
  'CRITICAL',
  'READY_TO_CLOSE',
  'CLOSED',
  'MISSED',
]

export type RepDayReason =
  | 'non_working_day'
  | 'before_workday'
  | 'not_checked_in'
  | 'on_pace'
  | 'behind'
  | 'materially_behind'
  | 'work_complete'
  | 'exception_approved'
  | 'closed'
  | 'incomplete'
  | 'not_closed'

export interface RepDayStateInput {
  policy: OperatingPolicy
  businessDate: string
  now: Date
  isWorkingDay: boolean
  checkInAt: string | null
  closedAt: string | null
  /** Fraction of the measured commitment completed, 0..1. */
  commitmentProgress: number
  /** Count of required actions still outstanding. */
  requiredRemaining: number
  /** Outstanding work that must be answered regardless of target (replies). */
  mandatoryRemaining: number
  exceptionApproved: boolean
}

export interface RepDayStateResult {
  state: RepDayState
  /** False on a non-working day: there is no operating day to be in a state of. */
  applicable: boolean
  reason: RepDayReason
  workdayProgress: number
  minutesRemaining: number
  paceRatio: number | null
  pace: PaceResult
}

export function deriveRepDayState(input: RepDayStateInput): RepDayStateResult {
  const progress = workdayProgress(input.now, input.policy, input.businessDate)
  const remaining = minutesRemaining(input.now, input.policy, input.businessDate)

  const pace = computePace({
    workdayProgress: progress,
    commitmentProgress: input.commitmentProgress,
    mandatoryRemaining: input.mandatoryRemaining,
    exceptionApproved: input.exceptionApproved,
    thresholds: input.policy.warningThresholds,
  })

  const base = {
    workdayProgress: progress,
    minutesRemaining: remaining,
    paceRatio: pace.paceRatio,
    pace,
  }

  if (!input.isWorkingDay) {
    return { ...base, state: 'NOT_STARTED', applicable: false, reason: 'non_working_day' }
  }

  // An explicit close is final. It is never overwritten by the clock.
  if (input.closedAt) {
    return { ...base, state: 'CLOSED', applicable: true, reason: 'closed' }
  }

  // The day has ended and the rep has not closed it. The shortfall is recorded,
  // never erased.
  if (isAfterWorkday(input.now, input.policy, input.businessDate)) {
    const workLeft = input.requiredRemaining > 0 || input.mandatoryRemaining > 0
    return {
      ...base,
      state: 'MISSED',
      applicable: true,
      reason: workLeft ? 'incomplete' : 'not_closed',
    }
  }

  if (isBeforeWorkday(input.now, input.policy, input.businessDate)) {
    return { ...base, state: 'NOT_STARTED', applicable: true, reason: 'before_workday' }
  }

  if (!input.checkInAt) {
    return { ...base, state: 'NOT_STARTED', applicable: true, reason: 'not_checked_in' }
  }

  const workDone = input.requiredRemaining === 0 && input.mandatoryRemaining === 0

  if (input.exceptionApproved) {
    return { ...base, state: 'READY_TO_CLOSE', applicable: true, reason: 'exception_approved' }
  }

  if (workDone) {
    return { ...base, state: 'READY_TO_CLOSE', applicable: true, reason: 'work_complete' }
  }

  switch (pace.band) {
    case 'materially_behind':
      return { ...base, state: 'CRITICAL', applicable: true, reason: 'materially_behind' }
    case 'behind':
      return { ...base, state: 'AT_RISK', applicable: true, reason: 'behind' }
    default:
      return { ...base, state: 'ACTIVE', applicable: true, reason: 'on_pace' }
  }
}

/** Professional, non-punitive label. Never humiliation, never fake urgency. */
export function repDayStateLabel(state: RepDayState): string {
  switch (state) {
    case 'NOT_STARTED':
      return 'Not started'
    case 'ACTIVE':
      return 'On track'
    case 'AT_RISK':
      return 'At risk'
    case 'CRITICAL':
      return 'Critical'
    case 'READY_TO_CLOSE':
      return 'Ready to close'
    case 'CLOSED':
      return 'Closed'
    case 'MISSED':
      return 'Missed'
  }
}

/** Whether the state blocks closing the day without an exception. */
export function isBlockingState(state: RepDayState): boolean {
  return state === 'AT_RISK' || state === 'CRITICAL' || state === 'ACTIVE' || state === 'NOT_STARTED'
}
