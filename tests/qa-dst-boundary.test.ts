/**
 * DST_BOUNDARY
 *
 * A workday must not gain or lose an hour when the clock changes, and a
 * business date must be 23, 24 or 25 hours long depending on the transition.
 * These are the cases that break naive `toLocaleString` offset math.
 */
import { describe, expect, it } from 'vitest'
import {
  businessDateRange,
  isAfterWorkday,
  isBeforeWorkday,
  isWithinWorkday,
  minutesRemaining,
  normalizePolicy,
  orgDate,
  workdayProgress,
  workdayWindow,
  zonedWallClockToUtc,
  type OperatingPolicy,
} from '@/lib/org-clock'

const NEW_YORK: OperatingPolicy = normalizePolicy({ timezone: 'America/New_York' })
const LONDON: OperatingPolicy = normalizePolicy({ timezone: 'Europe/London' })

function hoursBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000
}

describe('DST_BOUNDARY — a business date is 23, 24 or 25 hours long', () => {
  it('New York spring-forward day is 23 hours', () => {
    const range = businessDateRange('2026-03-08', NEW_YORK.timezone)
    expect(hoursBetween(range.start, range.end)).toBe(23)
  })

  it('New York fall-back day is 25 hours', () => {
    const range = businessDateRange('2026-11-01', NEW_YORK.timezone)
    expect(hoursBetween(range.start, range.end)).toBe(25)
  })

  it('London spring-forward day is 23 hours', () => {
    const range = businessDateRange('2026-03-29', LONDON.timezone)
    expect(hoursBetween(range.start, range.end)).toBe(23)
  })

  it('London fall-back day is 25 hours', () => {
    const range = businessDateRange('2026-10-25', LONDON.timezone)
    expect(hoursBetween(range.start, range.end)).toBe(25)
  })

  it('an ordinary day stays 24 hours in both zones', () => {
    expect(hoursBetween(
      businessDateRange('2026-06-15', NEW_YORK.timezone).start,
      businessDateRange('2026-06-15', NEW_YORK.timezone).end,
    )).toBe(24)
    expect(hoursBetween(
      businessDateRange('2026-06-15', LONDON.timezone).start,
      businessDateRange('2026-06-15', LONDON.timezone).end,
    )).toBe(24)
  })
})

describe('DST_BOUNDARY — the workday window keeps its wall-clock hours', () => {
  it('New York 09:00–18:00 is 13:00–22:00 UTC in summer and 14:00–23:00 UTC in winter', () => {
    expect(workdayWindow(NEW_YORK, '2026-07-15').startIso).toBe('2026-07-15T13:00:00.000Z')
    expect(workdayWindow(NEW_YORK, '2026-07-15').endIso).toBe('2026-07-15T22:00:00.000Z')
    expect(workdayWindow(NEW_YORK, '2026-01-15').startIso).toBe('2026-01-15T14:00:00.000Z')
    expect(workdayWindow(NEW_YORK, '2026-01-15').endIso).toBe('2026-01-15T23:00:00.000Z')
  })

  it('the workday stays nine hours on both transition days', () => {
    expect(workdayWindow(NEW_YORK, '2026-03-08').durationMinutes).toBe(540)
    expect(workdayWindow(NEW_YORK, '2026-11-01').durationMinutes).toBe(540)
    expect(workdayWindow(LONDON, '2026-03-29').durationMinutes).toBe(540)
    expect(workdayWindow(LONDON, '2026-10-25').durationMinutes).toBe(540)
  })

  it('London 09:00–18:00 is 08:00–17:00 UTC in summer and 09:00–18:00 UTC in winter', () => {
    expect(workdayWindow(LONDON, '2026-07-15').startIso).toBe('2026-07-15T08:00:00.000Z')
    expect(workdayWindow(LONDON, '2026-01-15').startIso).toBe('2026-01-15T09:00:00.000Z')
  })
})

describe('DST_BOUNDARY — progress does not jump across a transition', () => {
  it('starts at 0 and ends at 1 on the spring-forward day', () => {
    const window = workdayWindow(NEW_YORK, '2026-03-08')
    expect(workdayProgress(new Date(window.startIso), NEW_YORK)).toBe(0)
    expect(workdayProgress(new Date(window.endIso), NEW_YORK)).toBe(1)
    // 13:30 UTC = 09:30 EDT, thirty minutes into a nine-hour day.
    expect(workdayProgress(new Date('2026-03-08T13:30:00Z'), NEW_YORK)).toBeCloseTo(30 / 540, 5)
  })

  it('starts at 0 and ends at 1 on the fall-back day', () => {
    const window = workdayWindow(NEW_YORK, '2026-11-01')
    expect(workdayProgress(new Date(window.startIso), NEW_YORK)).toBe(0)
    expect(workdayProgress(new Date(window.endIso), NEW_YORK)).toBe(1)
    expect(workdayProgress(new Date('2026-11-01T14:30:00Z'), NEW_YORK)).toBeCloseTo(30 / 540, 5)
  })

  it('reports the same minutes remaining at the same local time on either side of the transition', () => {
    // 12:00 local → six hours left, on both days.
    expect(minutesRemaining(new Date('2026-03-08T16:00:00Z'), NEW_YORK)).toBe(360) // 12:00 EDT
    expect(minutesRemaining(new Date('2026-11-01T17:00:00Z'), NEW_YORK)).toBe(360) // 12:00 EST
  })

  it('classifies before / inside / after the window on a transition day', () => {
    const before = new Date('2026-03-08T12:59:00Z') // 08:59 EDT
    const inside = new Date('2026-03-08T13:00:00Z') // 09:00 EDT
    const after = new Date('2026-03-08T22:00:00Z') // 18:00 EDT
    expect(isBeforeWorkday(before, NEW_YORK, '2026-03-08')).toBe(true)
    expect(isWithinWorkday(inside, NEW_YORK, '2026-03-08')).toBe(true)
    expect(isAfterWorkday(after, NEW_YORK, '2026-03-08')).toBe(true)
  })

  it('resolves a non-existent local time deterministically just after the gap', () => {
    // 02:30 does not exist on 2026-03-08 in New York; it lands at 03:30 EDT.
    const resolved = zonedWallClockToUtc(2026, 3, 8, 2, 30, NEW_YORK.timezone)
    expect(resolved.toISOString()).toBe('2026-03-08T07:30:00.000Z')
  })

  it('resolves the fall-back overlap deterministically', () => {
    // 01:30 occurs twice on 2026-11-01; the first (EDT) is chosen.
    const resolved = zonedWallClockToUtc(2026, 11, 1, 1, 30, NEW_YORK.timezone)
    expect(resolved.toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })

  it('keeps the business date stable through the transition hour', () => {
    expect(orgDate(new Date('2026-03-08T06:59:00Z'), NEW_YORK.timezone)).toBe('2026-03-08')
    expect(orgDate(new Date('2026-03-08T07:01:00Z'), NEW_YORK.timezone)).toBe('2026-03-08')
    expect(orgDate(new Date('2026-11-01T05:59:00Z'), NEW_YORK.timezone)).toBe('2026-11-01')
    expect(orgDate(new Date('2026-11-01T06:01:00Z'), NEW_YORK.timezone)).toBe('2026-11-01')
  })
})
