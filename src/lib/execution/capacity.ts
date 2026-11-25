/**
 * Capacity engine — estimated effort in minutes, never a productivity score.
 *
 *   planned effort = Σ(allocated units × effective estimated minutes per activity)
 *                    + independently estimated non-overlapping task minutes
 *
 * Utilization compares that plan to configured available work minutes. It never
 * changes credited activity units and never reduces a requirement or allocation.
 */

export interface CapacityActivityUnit {
  key: string
  units: number
  /** Effective estimate from the canonical definition; 0 when unknown. */
  effortMinutes: number
}

export interface CapacityThresholds {
  /** At or above this fraction: near planned capacity. Default 0.8. */
  near: number
  /** Above this fraction: overloaded. Default 1.0. */
  over: number
}

export const DEFAULT_CAPACITY_THRESHOLDS: CapacityThresholds = { near: 0.8, over: 1 }

export type CapacityBand = 'available' | 'near_capacity' | 'overloaded' | 'no_capacity'

export interface CapacityInput {
  availableMinutes: number
  activities: CapacityActivityUnit[]
  /** Separately estimated task minutes. Must not overlap activity units. */
  taskMinutes?: number
  thresholds?: CapacityThresholds
}

export interface CapacityPlan {
  expectedUnits: number
  activityMinutes: number
  taskMinutes: number
  plannedMinutes: number
  availableMinutes: number
  /** planned / available; Infinity when nothing is available. */
  utilization: number
  band: CapacityBand
  /** planned - available, clamped at 0 for under-capacity. */
  overloadMinutes: number
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function computeCapacity(input: CapacityInput): CapacityPlan {
  const thresholds = input.thresholds ?? DEFAULT_CAPACITY_THRESHOLDS
  const expectedUnits = input.activities.reduce((sum, row) => sum + nonNegative(row.units), 0)
  const activityMinutes = input.activities.reduce(
    (sum, row) => sum + nonNegative(row.units) * nonNegative(row.effortMinutes),
    0,
  )
  const taskMinutes = nonNegative(input.taskMinutes ?? 0)
  const plannedMinutes = Math.round(activityMinutes + taskMinutes)
  const availableMinutes = Math.round(nonNegative(input.availableMinutes))
  const utilization = availableMinutes > 0 ? plannedMinutes / availableMinutes : Number.POSITIVE_INFINITY

  let band: CapacityBand = 'no_capacity'
  if (availableMinutes > 0) {
    if (utilization > thresholds.over) band = 'overloaded'
    else if (utilization >= thresholds.near) band = 'near_capacity'
    else band = 'available'
  }

  return {
    expectedUnits: Math.round(expectedUnits),
    activityMinutes: Math.round(activityMinutes),
    taskMinutes,
    plannedMinutes,
    availableMinutes,
    utilization,
    band,
    overloadMinutes: availableMinutes > 0 ? Math.max(0, plannedMinutes - availableMinutes) : plannedMinutes,
  }
}

export interface RepCapacityRow {
  repId: string
  activities: CapacityActivityUnit[]
  taskMinutes?: number
}

export interface RepCapacitySummary extends CapacityPlan {
  repId: string
}

/** One summary per rep, each against the same organization available-minutes budget. */
export function summarizeCapacityByRep(
  rows: RepCapacityRow[],
  availableMinutes: number,
  thresholds: CapacityThresholds = DEFAULT_CAPACITY_THRESHOLDS,
): RepCapacitySummary[] {
  return rows.map((row) => ({
    repId: row.repId,
    ...computeCapacity({ availableMinutes, activities: row.activities, taskMinutes: row.taskMinutes, thresholds }),
  }))
}

/** Actionable rebalance text. Never mutates the plan. */
export function describeCapacity(plan: CapacityPlan): string {
  switch (plan.band) {
    case 'no_capacity':
      return 'No available work minutes configured.'
    case 'available':
      return `Capacity available (${Math.round(plan.utilization * 100)}% planned).`
    case 'near_capacity':
      return `Near planned capacity (${Math.round(plan.utilization * 100)}%).`
    case 'overloaded':
      return `Overloaded by ${plan.overloadMinutes} minutes (${Math.round(plan.utilization * 100)}%).`
  }
}
