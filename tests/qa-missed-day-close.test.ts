/**
 * MISSED_DAY_CLOSE
 *
 * A day that ends without a close is recorded as missed. The shortfall is
 * written, not inferred later, and the rep is told.
 */
import { describe, expect, it } from 'vitest'
import { normalizePolicy, type OperatingPolicy } from '@/lib/org-clock'
import { deriveRepDayState } from '@/lib/rep-day/state-machine'
import { buildShortfall } from '@/lib/rep-day/persist'
import { planOperationalJobs } from '@/lib/scheduler/plan'
import { makeRepDayView } from './helpers/fake-rep-day-client'

const POLICY: OperatingPolicy = normalizePolicy({
  organizationId: 'org-1',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

const DATE = '2026-10-30'
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 30, hour - 5, minute))

describe('MISSED_DAY_CLOSE — the state', () => {
  it('is MISSED the moment the workday ends without a close', () => {
    const result = deriveRepDayState({
      policy: POLICY,
      businessDate: DATE,
      now: at(18, 0),
      isWorkingDay: true,
      checkInAt: '2026-10-30T04:05:00.000Z',
      closedAt: null,
      commitmentProgress: 0.6,
      requiredRemaining: 8,
      mandatoryRemaining: 1,
      exceptionApproved: false,
    })

    expect(result.state).toBe('MISSED')
    expect(result.reason).toBe('incomplete')
    expect(result.minutesRemaining).toBe(0)
  })

  it('is MISSED even when the work was done but the day was never closed', () => {
    const result = deriveRepDayState({
      policy: POLICY,
      businessDate: DATE,
      now: at(18, 30),
      isWorkingDay: true,
      checkInAt: '2026-10-30T04:05:00.000Z',
      closedAt: null,
      commitmentProgress: 1,
      requiredRemaining: 0,
      mandatoryRemaining: 0,
      exceptionApproved: false,
    })

    expect(result.state).toBe('MISSED')
    expect(result.reason).toBe('not_closed')
  })

  it('is never overwritten once closed', () => {
    const result = deriveRepDayState({
      policy: POLICY,
      businessDate: DATE,
      now: at(23, 0),
      isWorkingDay: true,
      checkInAt: '2026-10-30T04:05:00.000Z',
      closedAt: '2026-10-30T12:45:00.000Z',
      commitmentProgress: 1,
      requiredRemaining: 0,
      mandatoryRemaining: 0,
      exceptionApproved: false,
    })

    expect(result.state).toBe('CLOSED')
  })
})

describe('MISSED_DAY_CLOSE — the record', () => {
  it('writes a shortfall naming every outstanding commitment', () => {
    const shortfall = buildShortfall(makeRepDayView({ requiredRemaining: 8 }), 'incomplete')
    expect(shortfall.closedIncomplete).toBe(true)
    expect(shortfall.requiredRemaining).toBe(8)
    expect(Array.isArray(shortfall.commitments)).toBe(true)
    expect((shortfall.commitments as unknown[]).length).toBeGreaterThan(0)
  })

  it('is planned exactly once, at the end of the day', () => {
    const before = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(17, 59) })
    const after = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(18, 0) })

    expect(before.map((job) => job.jobKind)).not.toContain('CLOSE_MISSED_DAY')
    const closes = after.filter((job) => job.jobKind === 'CLOSE_MISSED_DAY')
    expect(closes).toHaveLength(1)
    expect(closes[0].dedupeKey).toBe('2026-10-30:CLOSE_MISSED_DAY:end')
  })
})
