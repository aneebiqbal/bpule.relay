/**
 * Business-day rollover contracts.
 *
 * "Today" is the organization's calendar date, never the server's. These tests
 * pin the 23:59 → 00:00 boundary in Asia/Karachi (the default expectation) and
 * the UTC-versus-local distinction that caused yesterday's numbers to survive.
 */
import { describe, expect, it } from 'vitest'
import {
  addDays,
  businessDateRange,
  nextDateBoundary,
  orgDate,
  type OperatingPolicy,
} from '@/lib/org-clock'
import { normalizePolicy } from '@/lib/org-clock'

const KARACHI: OperatingPolicy = normalizePolicy({
  organizationId: 'org-karachi',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

describe('BUSINESS_DAY_ROLLOVER', () => {
  it('23:59 and 00:00 are different business dates in Asia/Karachi', () => {
    // 2026-11-22 23:59 in Karachi = 2026-11-22 18:59 UTC.
    expect(orgDate(new Date('2026-11-22T18:59:00.000Z'), KARACHI.timezone)).toBe('2026-11-22')
    // 2026-11-23 00:00 in Karachi = 2026-11-22 19:00 UTC.
    expect(orgDate(new Date('2026-11-22T19:00:00.000Z'), KARACHI.timezone)).toBe('2026-11-23')
  })

  it('the rollover boundary is local midnight, not UTC midnight', () => {
    const before = nextDateBoundary(KARACHI.timezone, new Date('2026-11-22T18:59:59.000Z'))
    expect(before.date).toBe('2026-11-23')
    expect(before.startIso).toBe('2026-11-22T19:00:00.000Z')
    expect(before.milliseconds).toBe(1_000)
  })

  it('a UTC day boundary does not advance the Karachi business date', () => {
    // 2026-11-23 00:00 UTC is 05:00 in Karachi — still the same business date.
    expect(orgDate(new Date('2026-11-23T00:00:00.000Z'), KARACHI.timezone)).toBe('2026-11-23')
    // 2026-11-22 23:59 UTC is already 2026-11-23 in Karachi.
    expect(orgDate(new Date('2026-11-22T23:59:00.000Z'), KARACHI.timezone)).toBe('2026-11-23')
  })

  it('the local day range covers exactly one organization date', () => {
    const { start, end } = businessDateRange('2026-11-23', KARACHI.timezone)
    expect(start).toBe('2026-11-22T19:00:00.000Z')
    expect(end).toBe('2026-11-23T19:00:00.000Z')
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(86_400_000)
    // Both endpoints render as the same business date.
    expect(orgDate(new Date(start), KARACHI.timezone)).toBe('2026-11-23')
    expect(orgDate(new Date(end), KARACHI.timezone)).toBe(addDays('2026-11-23', 1))
  })
})
