/**
 * Capacity engine contracts.
 *
 * Effort is estimated minutes, utilization is a planning band, and the engine
 * never changes credited units or silently trims requirements.
 */
import { describe, expect, it } from 'vitest'
import {
  computeCapacity,
  describeCapacity,
  summarizeCapacityByRep,
} from '@/lib/execution/capacity'

describe('computeCapacity', () => {
  it('sums allocated units × effective minutes and adds non-overlapping tasks', () => {
    const plan = computeCapacity({
      availableMinutes: 480,
      activities: [
        { key: 'connection_request', units: 30, effortMinutes: 1 },
        { key: 'application', units: 5, effortMinutes: 20 },
      ],
      taskMinutes: 60,
    })
    expect(plan).toMatchObject({ expectedUnits: 35, activityMinutes: 130, taskMinutes: 60, plannedMinutes: 190, availableMinutes: 480 })
    expect(plan.utilization).toBeCloseTo(190 / 480)
    expect(plan.band).toBe('available')
  })

  it('bands at the product thresholds', () => {
    const base = { availableMinutes: 100, activities: [{ key: 'x', units: 1, effortMinutes: 0 }] }
    expect(computeCapacity({ ...base, taskMinutes: 79 }).band).toBe('available') // 79%
    expect(computeCapacity({ ...base, taskMinutes: 80 }).band).toBe('near_capacity')
    expect(computeCapacity({ ...base, taskMinutes: 100 }).band).toBe('near_capacity')
    expect(computeCapacity({ ...base, taskMinutes: 101 }).band).toBe('overloaded')
  })

  it('reports overload minutes without reducing the plan', () => {
    const plan = computeCapacity({ availableMinutes: 100, activities: [{ key: 'x', units: 10, effortMinutes: 20 }] })
    expect(plan.plannedMinutes).toBe(200)
    expect(plan.overloadMinutes).toBe(100)
    expect(plan.band).toBe('overloaded')
    expect(describeCapacity(plan)).toContain('Overloaded by 100 minutes')
  })

  it('handles zero available capacity explicitly', () => {
    const plan = computeCapacity({ availableMinutes: 0, activities: [{ key: 'x', units: 1, effortMinutes: 5 }] })
    expect(plan.band).toBe('no_capacity')
    expect(plan.utilization).toBe(Number.POSITIVE_INFINITY)
  })

  it('ignores negative and NaN inputs rather than understating load', () => {
    const plan = computeCapacity({ availableMinutes: 100, activities: [{ key: 'x', units: -5, effortMinutes: -3 }, { key: 'y', units: Number.NaN, effortMinutes: Number.POSITIVE_INFINITY }] })
    expect(plan.expectedUnits).toBe(0)
    expect(plan.activityMinutes).toBe(0)
  })

  it('supports organization threshold overrides', () => {
    const plan = computeCapacity({ availableMinutes: 100, activities: [{ key: 'x', units: 1, effortMinutes: 85 }], thresholds: { near: 0.9, over: 1.1 } })
    expect(plan.band).toBe('available')
  })

  it('summarizes each rep independently', () => {
    const rows = summarizeCapacityByRep([
      { repId: 'a', activities: [{ key: 'x', units: 10, effortMinutes: 10 }] },
      { repId: 'b', activities: [{ key: 'x', units: 100, effortMinutes: 10 }] },
    ], 100)
    expect(rows.map((row) => row.band)).toEqual(['near_capacity', 'overloaded'])
  })
})
