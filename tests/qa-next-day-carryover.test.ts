/**
 * NEXT_DAY_CARRYOVER
 *
 * Tomorrow starts with a ready queue: the next operating day inherits what was
 * not finished, and the weekend is skipped rather than treated as a missed day.
 */
import { describe, expect, it } from 'vitest'
import { addDays, nextOperatingDay, normalizePolicy, type OperatingPolicy } from '@/lib/org-clock'
import { buildCarryover } from '@/lib/rep-day/persist'
import { makeRepDayView } from './helpers/fake-rep-day-client'

const POLICY: OperatingPolicy = normalizePolicy({
  organizationId: 'org-1',
  timezone: 'Asia/Karachi',
  workingDays: [1, 2, 3, 4, 5],
})

describe('NEXT_DAY_CARRYOVER — the next operating day', () => {
  it('skips the weekend', () => {
    expect(nextOperatingDay(POLICY, '2026-10-30')).toBe('2026-11-02') // Fri → Mon
  })

  it('moves one day inside the week', () => {
    expect(nextOperatingDay(POLICY, '2026-10-29')).toBe('2026-10-30')
  })

  it('crosses a month boundary', () => {
    expect(nextOperatingDay(POLICY, '2026-10-30')).toBe('2026-11-02')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})

describe('NEXT_DAY_CARRYOVER — what is inherited', () => {
  it('carries the outstanding commitments and waiting replies', () => {
    const carryover = buildCarryover(makeRepDayView({ requiredRemaining: 12, mandatoryRemaining: 3 }))

    expect(carryover).toMatchObject({
      from: '2026-10-30',
      requiredRemaining: 12,
      repliesWaiting: 3,
    })
    expect(carryover.commitments).toEqual([
      { key: 'profiles_supplied', label: 'Profiles', remaining: 7 },
      { key: 'followups_completed', label: 'Follow-ups', remaining: 5 },
    ])
  })

  it('carries nothing when the day was completed', () => {
    const carryover = buildCarryover(
      makeRepDayView({
        requiredRemaining: 0,
        mandatoryRemaining: 0,
        commitments: [
          {
            key: 'profiles_supplied',
            label: 'Profiles',
            target: 25,
            completed: 25,
            remaining: 0,
            unit: 'count',
            measured: true,
            seeded: false,
            sources: [],
          },
        ],
      }),
    )

    expect(carryover.requiredRemaining).toBe(0)
    expect(carryover.commitments).toEqual([])
  })
})
