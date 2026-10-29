/**
 * ORG_OPERATING_CLOCK
 *
 * The organization operating policy is the only source of a workday window.
 * These tests pin the arithmetic: clock parsing, window resolution, progress,
 * remaining minutes, and next-operating-day selection.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POLICY,
  formatClock,
  formatDuration,
  isOrgWorkingDay,
  minutesRemaining,
  minutesUntilWorkdayStart,
  nextOperatingDay,
  normalizePolicy,
  parseClock,
  previousOperatingDay,
  workdayProgress,
  workdayWindow,
  type OperatingPolicy,
} from '@/lib/org-clock'

const KARACHI: OperatingPolicy = normalizePolicy({
  organizationId: 'org-karachi',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

describe('ORG_OPERATING_CLOCK — policy parsing', () => {
  it('parses and formats 24-hour clock values', () => {
    expect(parseClock('09:00')).toBe(540)
    expect(parseClock('09:00:00')).toBe(540)
    expect(parseClock('18:30')).toBe(1110)
    expect(parseClock('00:00')).toBe(0)
    expect(parseClock('24:00')).toBeNull()
    expect(parseClock('9am')).toBeNull()
    expect(parseClock(null)).toBeNull()
    expect(formatClock(540)).toBe('09:00')
    expect(formatClock(1110)).toBe('18:30')
  })

  it('normalizes a partial policy into a complete one', () => {
    const policy = normalizePolicy({ organizationId: 'x', timezone: 'Asia/Karachi' })
    expect(policy.workdayStart).toBe('09:00')
    expect(policy.workdayEnd).toBe('18:00')
    expect(policy.workingDays).toEqual([1, 2, 3, 4, 5])
    expect(policy.warningThresholds.riskStartPct).toBe(25)
    expect(policy.warningThresholds.criticalPaceRatio).toBe(0.6)
  })

  it('repairs a reversed window instead of producing a negative day', () => {
    const policy = normalizePolicy({ workdayStart: '18:00', workdayEnd: '09:00' })
    expect(parseClock(policy.workdayStart)!).toBeLessThan(parseClock(policy.workdayEnd)!)
  })

  it('falls back to a default policy when the organization id is empty', () => {
    expect(DEFAULT_POLICY.timezone).toBe('UTC')
    expect(DEFAULT_POLICY.workingDays).toEqual([1, 2, 3, 4, 5])
  })
})

describe('ORG_OPERATING_CLOCK — workday window', () => {
  it('resolves 09:00–18:00 Asia/Karachi to 04:00–13:00 UTC', () => {
    const window = workdayWindow(KARACHI, '2026-10-30')
    expect(window.startIso).toBe('2026-10-30T04:00:00.000Z')
    expect(window.endIso).toBe('2026-10-30T13:00:00.000Z')
    expect(window.durationMinutes).toBe(540)
  })

  it('reports progress 0 before the window, 0.5 at the midpoint, 1 after', () => {
    expect(workdayProgress(new Date('2026-10-30T03:59:00Z'), KARACHI)).toBe(0)
    expect(workdayProgress(new Date('2026-10-30T08:30:00Z'), KARACHI)).toBeCloseTo(0.5, 5)
    expect(workdayProgress(new Date('2026-10-30T13:01:00Z'), KARACHI)).toBe(1)
  })

  it('counts minutes remaining until the local workday ends', () => {
    // 12:00 local = 07:00 UTC; 6 hours left.
    expect(minutesRemaining(new Date('2026-10-30T07:00:00Z'), KARACHI)).toBe(360)
    expect(minutesRemaining(new Date('2026-10-30T14:00:00Z'), KARACHI)).toBe(0)
  })

  it('counts minutes until the workday opens', () => {
    // 08:00 local = 03:00 UTC; one hour to go.
    expect(minutesUntilWorkdayStart(new Date('2026-10-30T03:00:00Z'), KARACHI)).toBe(60)
    expect(minutesUntilWorkdayStart(new Date('2026-10-30T06:00:00Z'), KARACHI)).toBe(0)
  })

  it('respects a custom window', () => {
    const early = normalizePolicy({ timezone: 'UTC', workdayStart: '06:30', workdayEnd: '15:15' })
    const window = workdayWindow(early, '2026-10-30')
    expect(window.startIso).toBe('2026-10-30T06:30:00.000Z')
    expect(window.endIso).toBe('2026-10-30T15:15:00.000Z')
    expect(window.durationMinutes).toBe(525)
  })
})

describe('ORG_OPERATING_CLOCK — working days', () => {
  it('knows Friday is a working day and Saturday is not', () => {
    expect(isOrgWorkingDay(KARACHI, '2026-10-30')).toBe(true) // Friday
    expect(isOrgWorkingDay(KARACHI, '2026-10-31')).toBe(false) // Saturday
  })

  it('skips the weekend when finding the next operating day', () => {
    expect(nextOperatingDay(KARACHI, '2026-10-30')).toBe('2026-11-02') // Fri → Mon
    expect(nextOperatingDay(KARACHI, '2026-10-29')).toBe('2026-10-30')
  })

  it('walks backwards to the previous operating day', () => {
    expect(previousOperatingDay(KARACHI, '2026-11-02')).toBe('2026-10-30') // Mon → Fri
  })

  it('honours a six-day week', () => {
    const sixDay = normalizePolicy({ timezone: 'Asia/Karachi', workingDays: [1, 2, 3, 4, 5, 6] })
    expect(isOrgWorkingDay(sixDay, '2026-10-31')).toBe(true)
    expect(nextOperatingDay(sixDay, '2026-10-31')).toBe('2026-11-02')
  })
})

describe('ORG_OPERATING_CLOCK — presentation', () => {
  it('formats durations the way the Today header reads them', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(43)).toBe('43m')
    expect(formatDuration(261)).toBe('4h 21m')
    expect(formatDuration(120)).toBe('2h')
  })
})
