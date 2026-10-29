/**
 * REP_DAY_STATE_MACHINE
 *
 * The synthetic day from the brief, walked on the pure machine:
 *   08:50 NOT_STARTED → 09:05 ACTIVE → 12:00 ACTIVE → 15:00 AT_RISK
 *   → 16:30 CRITICAL → 17:30 READY_TO_CLOSE → 17:45 CLOSED
 * plus the missed day, the exception and the non-working day.
 */
import { describe, expect, it } from 'vitest'
import { normalizePolicy, type OperatingPolicy } from '@/lib/org-clock'
import { deriveRepDayState, isBlockingState, repDayStateLabel } from '@/lib/rep-day/state-machine'

const POLICY: OperatingPolicy = normalizePolicy({
  organizationId: 'org-1',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

const DATE = '2026-10-30' // Friday
const at = (localHour: number, localMinute = 0): Date =>
  new Date(Date.UTC(2026, 9, 30, localHour - 5, localMinute))

function derive(overrides: Partial<Parameters<typeof deriveRepDayState>[0]> = {}) {
  return deriveRepDayState({
    policy: POLICY,
    businessDate: DATE,
    now: at(12, 0),
    isWorkingDay: true,
    checkInAt: '2026-10-30T04:05:00.000Z',
    closedAt: null,
    commitmentProgress: 0.5,
    requiredRemaining: 10,
    mandatoryRemaining: 0,
    exceptionApproved: false,
    ...overrides,
  })
}

describe('REP_DAY_STATE_MACHINE — the operating day', () => {
  it('08:50 is NOT_STARTED because the workday has not opened', () => {
    const result = derive({ now: at(8, 50), checkInAt: null, commitmentProgress: 0, requiredRemaining: 20 })
    expect(result.state).toBe('NOT_STARTED')
    expect(result.reason).toBe('before_workday')
    expect(result.applicable).toBe(true)
    expect(result.minutesRemaining).toBe(550)
  })

  it('09:05 after check-in is ACTIVE', () => {
    const result = derive({ now: at(9, 5), commitmentProgress: 0.03, requiredRemaining: 19 })
    expect(result.state).toBe('ACTIVE')
    expect(result.reason).toBe('on_pace')
  })

  it('12:00 with half the work done is ACTIVE', () => {
    const result = derive({ now: at(12, 0), commitmentProgress: 0.5, requiredRemaining: 10 })
    expect(result.state).toBe('ACTIVE')
    expect(result.workdayProgress).toBeCloseTo(1 / 3, 5)
  })

  it('15:00 with low completion is AT_RISK', () => {
    const result = derive({ now: at(15, 0), commitmentProgress: 0.2, requiredRemaining: 16 })
    expect(result.state).toBe('AT_RISK')
    expect(result.reason).toBe('behind')
    expect(result.paceRatio!).toBeLessThan(0.8)
  })

  it('16:30 while still behind is CRITICAL', () => {
    const result = derive({ now: at(16, 30), commitmentProgress: 0.3, requiredRemaining: 14 })
    expect(result.state).toBe('CRITICAL')
    expect(result.reason).toBe('materially_behind')
  })

  it('17:30 after catching up is READY_TO_CLOSE', () => {
    const result = derive({ now: at(17, 30), commitmentProgress: 1, requiredRemaining: 0 })
    expect(result.state).toBe('READY_TO_CLOSE')
    expect(result.reason).toBe('work_complete')
    expect(result.minutesRemaining).toBe(30)
  })

  it('17:45 after closing is CLOSED', () => {
    const result = derive({ now: at(17, 45), closedAt: '2026-10-30T12:45:00.000Z', requiredRemaining: 0 })
    expect(result.state).toBe('CLOSED')
  })
})

describe('REP_DAY_STATE_MACHINE — the day ends without a close', () => {
  it('18:00+ with work outstanding is MISSED (incomplete)', () => {
    const result = derive({ now: at(18, 5), commitmentProgress: 0.4, requiredRemaining: 12 })
    expect(result.state).toBe('MISSED')
    expect(result.reason).toBe('incomplete')
    expect(result.minutesRemaining).toBe(0)
  })

  it('18:00+ with all work done but never closed is MISSED (not closed)', () => {
    const result = derive({ now: at(18, 5), commitmentProgress: 1, requiredRemaining: 0 })
    expect(result.state).toBe('MISSED')
    expect(result.reason).toBe('not_closed')
  })

  it('never started and never closed is MISSED', () => {
    const result = derive({ now: at(19, 0), checkInAt: null, commitmentProgress: 0, requiredRemaining: 20 })
    expect(result.state).toBe('MISSED')
  })
})

describe('REP_DAY_STATE_MACHINE — exceptions and mandatory work', () => {
  it('an approved exception makes a day with work remaining READY_TO_CLOSE', () => {
    const result = derive({ now: at(15, 0), commitmentProgress: 0.2, requiredRemaining: 16, exceptionApproved: true })
    expect(result.state).toBe('READY_TO_CLOSE')
    expect(result.reason).toBe('exception_approved')
  })

  it('an unanswered buyer reply keeps an otherwise complete day from closing', () => {
    const result = derive({ now: at(17, 0), commitmentProgress: 1, requiredRemaining: 0, mandatoryRemaining: 1 })
    expect(result.state).not.toBe('READY_TO_CLOSE')
  })

  it('replies waiting make an on-pace rep AT_RISK after the risk threshold', () => {
    const result = derive({ now: at(15, 0), commitmentProgress: 0.7, requiredRemaining: 5, mandatoryRemaining: 2 })
    expect(result.state).toBe('AT_RISK')
  })

  it('a non-working day has no operating state', () => {
    const result = derive({ isWorkingDay: false, now: at(12, 0) })
    expect(result.applicable).toBe(false)
    expect(result.reason).toBe('non_working_day')
  })
})

describe('REP_DAY_STATE_MACHINE — labels and blocking', () => {
  it('uses professional labels, never punitive ones', () => {
    expect(repDayStateLabel('CRITICAL')).toBe('Critical')
    expect(repDayStateLabel('MISSED')).toBe('Missed')
    expect(repDayStateLabel('ACTIVE')).toBe('On track')
  })

  it('knows which states block an unconditional close', () => {
    expect(isBlockingState('ACTIVE')).toBe(true)
    expect(isBlockingState('AT_RISK')).toBe(true)
    expect(isBlockingState('CRITICAL')).toBe(true)
    expect(isBlockingState('READY_TO_CLOSE')).toBe(false)
    expect(isBlockingState('CLOSED')).toBe(false)
    expect(isBlockingState('MISSED')).toBe(false)
  })
})
