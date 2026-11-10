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

export interface LaneProgress {
  activityType: string
  targetCount: number
  completedCount: number
  remaining: number
  targetable: boolean
}

export interface ProfilePlanProgress {
  identityId: string
  /** Sum of targetable lanes only. Tracked-only lanes are not a requirement. */
  target: number
  completed: number
  remaining: number
  lanes: LaneProgress[]
  contributions: RepContribution[]
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
}): ProfilePlanProgress {
  const completedByLane = input.completedByLane ?? {}
  const lanes: LaneProgress[] = input.lanes.map((lane) => {
    const completed = Math.max(0, completedByLane[lane.activityType] ?? 0)
    return {
      activityType: lane.activityType,
      targetCount: lane.targetCount,
      completedCount: completed,
      remaining: Math.max(0, lane.targetCount - completed),
      targetable: lane.targetable,
    }
  })

  const target = planRequirement(input.lanes)
  const completed = profileCompleted(input.contributions)

  return {
    identityId: input.identityId,
    target,
    completed,
    remaining: Math.max(0, target - completed),
    lanes,
    contributions: input.contributions,
    hasPlan: input.lanes.some((lane) => lane.targetable),
  }
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
