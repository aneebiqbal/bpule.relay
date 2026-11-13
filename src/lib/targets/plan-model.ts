/**
 * The canonical daily-plan model (V6.1).
 *
 * A plan belongs to a CHANNEL IDENTITY, never to an operator. Operators
 * contribute toward it; `daily_accountability` already records who did what.
 *
 *   requirement  = sum(target_count) over unique targetable identity/activity lanes
 *   contribution = daily_accountability.completed_count per rep
 *   completed    = sum(contribution)          ← the profile total
 *   remaining    = requirement - completed
 *
 * Shared operators therefore share ONE requirement. REPLACE does not reset it.
 */

export interface PlanLane {
  identityId: string
  activityType: string
  targetCount: number
  targetable: boolean
}

export interface RepContribution {
  repId: string
  completedCount: number
}

/** One operator's expected share of a shared lane. Never a second requirement. */
export interface RepAllocation {
  repId: string
  targetCount: number
}

export interface LaneProgress {
  activityType: string
  targetCount: number
  completedCount: number
  remaining: number
  targetable: boolean
  /** Empty when the lane is SHARED. */
  allocations: RepAllocation[]
}

export interface ProfilePlanProgress {
  identityId: string
  /** Sum of targetable lanes only. Tracked-only lanes are not a requirement. */
  target: number
  completed: number
  remaining: number
  lanes: LaneProgress[]
  contributions: RepContribution[]
  /** Aggregated expected share per operator across targetable lanes. */
  allocations: RepAllocation[]
  /** True when any targetable lane carries an allocation. */
  allocated: boolean
  /** True when there is no targetable lane at all. */
  hasPlan: boolean
}

/** One requirement per lane — shared operators never duplicate it. */
export function planRequirement(lanes: PlanLane[]): number {
  return lanes.filter((lane) => lane.targetable).reduce((sum, lane) => sum + lane.targetCount, 0)
}

/** The profile total is the sum of every operator's contribution. */
export function profileCompleted(contributions: RepContribution[]): number {
  return contributions.reduce((sum, row) => sum + row.completedCount, 0)
}

export function computeProfileProgress(input: {
  identityId: string
  lanes: PlanLane[]
  contributions: RepContribution[]
  /** Completed per lane; falls back to 0 when a lane has no completion row. */
  completedByLane?: Record<string, number>
  /** Expected share per lane; empty/undefined means a SHARED lane. */
  allocationsByLane?: Record<string, RepAllocation[]>
}): ProfilePlanProgress {
  const completedByLane = input.completedByLane ?? {}
  const allocationsByLane = input.allocationsByLane ?? {}
  const lanes: LaneProgress[] = input.lanes.map((lane) => {
    const completed = Math.max(0, completedByLane[lane.activityType] ?? 0)
    return {
      activityType: lane.activityType,
      targetCount: lane.targetCount,
      completedCount: completed,
      remaining: Math.max(0, lane.targetCount - completed),
      targetable: lane.targetable,
      allocations: allocationsByLane[lane.activityType] ?? [],
    }
  })

  const target = planRequirement(input.lanes)
  const completed = profileCompleted(input.contributions)

  // Aggregate the per-operator share across targetable lanes. A rep with no
  // allocation simply does not appear — SHARED lanes stay unallocated.
  const allocationByRep = new Map<string, number>()
  for (const lane of lanes) {
    if (!lane.targetable) continue
    for (const row of lane.allocations) {
      allocationByRep.set(row.repId, (allocationByRep.get(row.repId) ?? 0) + row.targetCount)
    }
  }

  return {
    identityId: input.identityId,
    target,
    completed,
    remaining: Math.max(0, target - completed),
    lanes,
    contributions: input.contributions,
    allocations: [...allocationByRep.entries()]
      .map(([repId, targetCount]) => ({ repId, targetCount }))
      .sort((a, b) => a.repId.localeCompare(b.repId)),
    allocated: allocationByRep.size > 0,
    hasPlan: input.lanes.some((lane) => lane.targetable),
  }
}

/**
 * The ONE validation for an ALLOCATED plan: the sum of operator shares on a lane
 * may never exceed the shared requirement. Returns the offending lanes.
 */
export function findOverAllocatedLanes(input: {
  lanes: PlanLane[]
  allocationsByLane: Record<string, RepAllocation[]>
}): Array<{ activityType: string; allocated: number; targetCount: number }> {
  const problems: Array<{ activityType: string; allocated: number; targetCount: number }> = []
  for (const lane of input.lanes) {
    if (!lane.targetable) continue
    const allocated = (input.allocationsByLane[lane.activityType] ?? []).reduce(
      (sum, row) => sum + row.targetCount,
      0,
    )
    if (allocated > lane.targetCount) {
      problems.push({ activityType: lane.activityType, allocated, targetCount: lane.targetCount })
    }
  }
  return problems
}

/**
 * The whole team's requirement. Each lane is counted once, regardless of how
 * many operators work it.
 */
export function computeTeamPlanTotal(lanes: PlanLane[]): number {
  const seen = new Set<string>()
  let total = 0
  for (const lane of lanes) {
    if (!lane.targetable) continue
    const key = `${lane.identityId}:${lane.activityType}`
    if (seen.has(key)) continue
    seen.add(key)
    total += lane.targetCount
  }
  return total
}

/**
 * A rep's PERSONAL requirement: solo lanes count fully. Lanes on identities the
 * rep shares with another operator are excluded here and reported separately as
 * a shared requirement, so a shared plan is never double-claimed as personal.
 */
export function computeRepPlanTotal(
  lanes: PlanLane[],
  sharedIdentityIds: ReadonlySet<string>,
): number {
  return lanes
    .filter((lane) => lane.targetable && !sharedIdentityIds.has(lane.identityId))
    .reduce((sum, lane) => sum + lane.targetCount, 0)
}

/** Identities where more than one rep has contributed (or is an active operator). */
export function findSharedIdentities(
  identityIds: readonly string[],
  contributorsByIdentity: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const shared = new Set<string>()
  for (const identityId of identityIds) {
    const reps = contributorsByIdentity.get(identityId) ?? []
    if (reps.length > 1) shared.add(identityId)
  }
  return shared
}
