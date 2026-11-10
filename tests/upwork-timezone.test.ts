/**
 * Organization-timezone windows for Upwork today/week/follow-up math.
 * A server in UTC must never decide where the Pakistan day boundary falls.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_POLICY, orgTodayRange, orgWeekRange, type OperatingPolicy } from '@/lib/org-clock'

const policy: OperatingPolicy = { ...DEFAULT_POLICY, organizationId: 'org', timezone: 'Asia/Karachi' }

describe('orgTodayRange', () => {
  it('keeps 23:30 PKT inside the Pakistan day', () => {
    const now = new Date('2026-11-10T18:30:00.000Z') // 23:30 PKT
    expect(orgTodayRange(policy, now)).toEqual({
      start: '2026-11-09T19:00:00.000Z',
      end: '2026-11-10T19:00:00.000Z',
    })
  })

  it('moves 00:01 PKT into the next Pakistan day', () => {
    const now = new Date('2026-11-10T19:01:00.000Z') // 00:01 PKT next day
    const range = orgTodayRange(policy, now)
    expect(range.start).toBe('2026-11-10T19:00:00.000Z')
    expect(range.end).toBe('2026-11-11T19:00:00.000Z')
    expect(now.toISOString() >= range.start).toBe(true)
    expect(now.toISOString() < range.end).toBe(true)
  })
})

describe('orgWeekRange', () => {
  it('is the rolling seven Pakistan days ending today', () => {
    const now = new Date('2026-11-10T18:30:00.000Z') // Tuesday 23:30 PKT
    expect(orgWeekRange(policy, now)).toEqual({
      start: '2026-11-03T19:00:00.000Z',
      end: '2026-11-10T19:00:00.000Z',
    })
  })

  it('does not leak the server timezone into the boundary', () => {
    const now = new Date('2026-11-10T00:30:00.000Z') // 05:30 PKT same day
    const range = orgWeekRange(policy, now)
    expect(range.start).toBe('2026-11-03T19:00:00.000Z')
  })
})
