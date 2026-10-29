/**
 * ORG_LOCAL_DATE_BOUNDARY
 *
 * The business date must be the organization's calendar date, never the UTC
 * date and never the browser's. Each case below is an instant where the two
 * disagree, which is exactly when the old
 * `new Date().toISOString().slice(0, 10)` was wrong.
 */
import { describe, expect, it } from 'vitest'
import {
  businessDateRange,
  isOrgWorkingDay,
  normalizePolicy,
  orgDate,
  orgParts,
  orgWeekday,
  type OperatingPolicy,
} from '@/lib/org-clock'

const KARACHI: OperatingPolicy = normalizePolicy({ timezone: 'Asia/Karachi' })
const NEW_YORK: OperatingPolicy = normalizePolicy({ timezone: 'America/New_York' })
const LONDON: OperatingPolicy = normalizePolicy({ timezone: 'Europe/London' })
const UTC: OperatingPolicy = normalizePolicy({ timezone: 'UTC' })

describe('ORG_LOCAL_DATE_BOUNDARY — the local date differs from the UTC date', () => {
  it('Asia/Karachi is already tomorrow at 20:00 UTC', () => {
    const instant = new Date('2026-10-30T20:00:00Z') // 01:00 on the 31st, Karachi
    expect(instant.toISOString().slice(0, 10)).toBe('2026-10-30') // the old answer
    expect(orgDate(instant, KARACHI.timezone)).toBe('2026-10-31') // the right answer
  })

  it('America/New_York is still yesterday at 02:00 UTC', () => {
    const instant = new Date('2026-10-31T02:00:00Z') // 22:00 on the 30th, New York
    expect(instant.toISOString().slice(0, 10)).toBe('2026-10-31')
    expect(orgDate(instant, NEW_YORK.timezone)).toBe('2026-10-30')
  })

  it('Europe/London agrees with UTC in winter but not in summer', () => {
    expect(orgDate(new Date('2026-01-15T23:30:00Z'), LONDON.timezone)).toBe('2026-01-15')
    // 23:30 UTC in July is 00:30 BST the next day.
    expect(orgDate(new Date('2026-07-15T23:30:00Z'), LONDON.timezone)).toBe('2026-07-16')
  })

  it('UTC policy matches the UTC date at every hour', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const instant = new Date(Date.UTC(2026, 9, 30, hour, 30))
      expect(orgDate(instant, UTC.timezone)).toBe('2026-10-30')
    }
  })
})

describe('ORG_LOCAL_DATE_BOUNDARY — weekday comes from the organization zone', () => {
  it('Friday 23:00 UTC is already Saturday in Karachi', () => {
    const fridayLate = new Date('2026-10-30T23:00:00Z') // 04:00 Sat, Karachi
    expect(fridayLate.getUTCDay()).toBe(5) // Friday, the old answer
    expect(orgWeekday(fridayLate, KARACHI.timezone)).toBe(6) // Saturday
    expect(isOrgWorkingDay(KARACHI, orgDate(fridayLate, KARACHI.timezone))).toBe(false)
  })

  it('Sunday 23:30 UTC is already Monday in Karachi', () => {
    const sundayLate = new Date('2026-11-01T23:30:00Z')
    expect(sundayLate.getUTCDay()).toBe(0) // Sunday
    expect(orgWeekday(sundayLate, KARACHI.timezone)).toBe(1) // Monday
  })

  it('Monday 02:00 UTC is still Sunday in New York', () => {
    const mondayEarly = new Date('2026-11-02T02:00:00Z') // 21:00 Sun, EST
    expect(mondayEarly.getUTCDay()).toBe(1)
    expect(orgWeekday(mondayEarly, NEW_YORK.timezone)).toBe(0)
  })

  it('reports minutes of day in the organization zone', () => {
    const parts = orgParts(new Date('2026-10-30T04:30:00Z'), KARACHI.timezone)
    expect(parts.hour).toBe(9)
    expect(parts.minute).toBe(30)
    expect(parts.minutesOfDay).toBe(570)
    expect(parts.date).toBe('2026-10-30')
  })
})

describe('ORG_LOCAL_DATE_BOUNDARY — the date range a business day covers', () => {
  it('starts and ends at local midnight, expressed in UTC', () => {
    const range = businessDateRange('2026-10-30', KARACHI.timezone)
    expect(range.start).toBe('2026-10-29T19:00:00.000Z')
    expect(range.end).toBe('2026-10-30T19:00:00.000Z')
  })

  it('is 24 hours on an ordinary day', () => {
    const range = businessDateRange('2026-10-30', NEW_YORK.timezone)
    const hours = (new Date(range.end).getTime() - new Date(range.start).getTime()) / 3_600_000
    expect(hours).toBe(24)
  })
})
