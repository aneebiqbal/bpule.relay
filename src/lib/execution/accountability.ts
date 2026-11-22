import type { DbClient } from '@/lib/db/types'
import { isPlanEffectiveOn } from '@/lib/targets/load-plan-progress'
import { countOverdueAssignedByRep } from '@/lib/tasks/assigned-tasks'

/**
 * The ONE daily accountability projection.
 *
 * Every target number in Relay — Admin Command Center, Team Command Center,
 * Rep Today, the target editor — is derived here so two surfaces cannot disagree.
 *
 * Contract (see docs/RELAY_ACCOUNTING_CONTRACT.md):
 *
 *   tracked     = sum(target_count) over every unique active lane
 *   requirement = sum(target_count) over unique TARGETABLE lanes
 *   assigned    = sum over lanes of the personal expectation:
 *                   solo lane            → the lane target
 *                   allocated lane       → the rep's allocation
 *                   shared unallocated   → 0 (reported in `unallocated`)
 *   unallocated = tracked - assigned  (the shared requirement nobody owns)
 *   completed   = sum over lanes of the lane's completed_count (each lane once)
 *   remaining   = max(0, tracked - completed)
 *
 * A lane belongs to a channel identity, never to an operator. Operators
 * contribute toward it; `daily_accountability` records who did what.
 */

export interface AccountabilityAllocation {
  repId: string
  targetCount: number
}

export interface AccountabilityLane {
  planId: string
  identityId: string
  identityName: string
  channel: string
  profileId: string | null
  activityType: string
  targetCount: number
  targetable: boolean
  effectiveFrom: string
  effectiveUntil: string | null
  /** Active PRIMARY + OPERATOR seats on the identity's profile. */
  seats: string[]
  allocations: AccountabilityAllocation[]
  /** Per-operator completed_count on this lane today. */
  contributions: Array<{ repId: string; completedCount: number }>
  /** Sum of every operator's completed_count on this lane today. */
  completed: number
  remaining: number
  /** True when more than one seat works the lane. */
  shared: boolean
  /** True when the lane carries at least one allocation. */
  allocated: boolean
}

export interface RepDailySummary {
  repId: string
  repName: string
  /** This rep's personal expectation: solo lanes + explicit allocations. */
  assigned: number
  /** This rep's completed contribution today. */
  completed: number
  remaining: number
  /** Lanes this rep works that nobody has an explicit allocation on. */
  sharedTarget: number
  lanes: Array<{ identityId: string; activityType: string; targetCount: number; completed: number; allocation: number | null }>
}

export interface OrganizationDailySummary {
  organizationId: string
  businessDate: string
  timezone: string
  /** Sum of every unique lane target (targetable and tracked-only). */
  tracked: number
  /** Sum of unique targetable lanes — the organization's real requirement. */
  requirement: number
  /** Sum of personal expectations (solo lanes + allocations). */
  assigned: number
  /** Allocation units whose rep holds no active seat on the lane. */
  unseatedAllocationUnits: number
  /** tracked - assigned. Shared work nobody has an explicit share of. */
  unallocated: number
  /** Sum of lane completions, each lane counted once. */
  completed: number
  remaining: number
  reps: RepDailySummary[]
  lanes: AccountabilityLane[]
}

interface PlanRow {
  id: string
  revenue_identity_id: string
  activity_type: string
  target_count: number
  targetable: boolean
  effective_from: string
  effective_until: string | null
  active: boolean
}

interface SeatRow {
  profile_id: string
  rep_id: string
  role: string
}

interface AllocationRow {
  plan_id: string
  rep_id: string
  target_count: number
}

interface AccountabilityRow {
  revenue_identity_id: string
  activity_type: string
  rep_id: string
  completed_count: number
}

interface IdentityRow {
  id: string
  identity_name: string
  channel: string
  profile_id: string | null
  status: string
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  return /does not exist|schema cache/i.test(String(error.message ?? ''))
}

/**
 * Load the raw accountability facts for one organization and business date.
 * Public so a reconciliation command can inspect the same rows the summary uses.
 */
export async function loadAccountabilityLanes(
  client: DbClient,
  input: { orgId: string; businessDate: string },
): Promise<AccountabilityLane[]> {
  const [plansRes, seatsRes, allocationsRes, accountabilityRes, identitiesRes] = await Promise.all([
    client
      .from('daily_target_plans')
      .select('id, revenue_identity_id, activity_type, target_count, targetable, effective_from, effective_until, active')
      .eq('organization_id', input.orgId)
      .eq('active', true)
      .limit(2000),
    client
      .from('profile_coverage')
      .select('profile_id, rep_id, role')
      .eq('organization_id', input.orgId)
      .eq('active', true)
      .in('role', ['PRIMARY', 'OPERATOR'])
      .limit(2000),
    client
      .from('daily_plan_allocations')
      .select('plan_id, rep_id, target_count')
      .eq('organization_id', input.orgId)
      .eq('active', true)
      .limit(2000),
    client
      .from('daily_accountability')
      .select('revenue_identity_id, activity_type, rep_id, completed_count')
      .eq('organization_id', input.orgId)
      .eq('target_date', input.businessDate)
      .limit(5000),
    client
      .from('revenue_identities')
      .select('id, identity_name, channel, profile_id, status')
      .eq('organization_id', input.orgId)
      .limit(2000),
  ])
  if (plansRes.error) throw plansRes.error
  if (seatsRes.error) throw seatsRes.error
  if (allocationsRes.error && !isMissingRelation(allocationsRes.error)) throw allocationsRes.error
  if (accountabilityRes.error) throw accountabilityRes.error
  if (identitiesRes.error) throw identitiesRes.error

  const plans = ((plansRes.data ?? []) as PlanRow[]).filter((row) =>
    isPlanEffectiveOn(
      { effectiveFrom: row.effective_from, effectiveUntil: row.effective_until, active: row.active },
      input.businessDate,
    ),
  )
  if (plans.length === 0) return []

  const identities = (identitiesRes.data ?? []) as IdentityRow[]
  const identityById = new Map(identities.map((row) => [row.id, row]))

  const seatsByProfile = new Map<string, string[]>()
  for (const seat of (seatsRes.data ?? []) as SeatRow[]) {
    const list = seatsByProfile.get(seat.profile_id) ?? []
    if (!list.includes(seat.rep_id)) list.push(seat.rep_id)
    seatsByProfile.set(seat.profile_id, list)
  }

  const allocationsByPlan = new Map<string, AccountabilityAllocation[]>()
  for (const row of (allocationsRes.data ?? []) as AllocationRow[]) {
    const list = allocationsByPlan.get(row.plan_id) ?? []
    const existing = list.find((entry) => entry.repId === row.rep_id)
    if (existing) existing.targetCount += row.target_count
    else list.push({ repId: row.rep_id, targetCount: row.target_count })
    allocationsByPlan.set(row.plan_id, list)
  }

  const completedByLane = new Map<string, number>()
  const contributionsByLane = new Map<string, Array<{ repId: string; completedCount: number }>>()
  for (const row of (accountabilityRes.data ?? []) as AccountabilityRow[]) {
    const key = `${row.revenue_identity_id}:${row.activity_type}`
    completedByLane.set(key, (completedByLane.get(key) ?? 0) + (row.completed_count ?? 0))
    const list = contributionsByLane.get(key) ?? []
    const existing = list.find((entry) => entry.repId === row.rep_id)
    if (existing) existing.completedCount += row.completed_count ?? 0
    else list.push({ repId: row.rep_id, completedCount: row.completed_count ?? 0 })
    contributionsByLane.set(key, list)
  }

  return plans.map((plan) => {
    const identity = identityById.get(plan.revenue_identity_id)
    const profileId = identity?.profile_id ?? null
    const seats = profileId ? (seatsByProfile.get(profileId) ?? []) : []
    const allocations = allocationsByPlan.get(plan.id) ?? []
    const contributions = contributionsByLane.get(`${plan.revenue_identity_id}:${plan.activity_type}`) ?? []
    const completed = completedByLane.get(`${plan.revenue_identity_id}:${plan.activity_type}`) ?? 0
    return {
      planId: plan.id,
      identityId: plan.revenue_identity_id,
      identityName: identity?.identity_name ?? 'Unnamed channel',
      channel: identity?.channel ?? 'other',
      profileId,
      activityType: plan.activity_type,
      targetCount: plan.target_count,
      targetable: plan.targetable,
      effectiveFrom: plan.effective_from,
      effectiveUntil: plan.effective_until,
      seats,
      allocations,
      contributions,
      completed,
      remaining: Math.max(0, plan.target_count - completed),
      shared: seats.length > 1,
      allocated: allocations.length > 0,
    }
  })
}

/** The personal expectation for one seat on one lane. */
export function lanePersonalTarget(lane: Pick<AccountabilityLane, 'targetCount' | 'seats' | 'allocations'>, repId: string): number {
  const allocation = lane.allocations.find((row) => row.repId === repId)
  if (allocation) return allocation.targetCount
  if (lane.seats.length > 1) return 0
  return lane.seats.includes(repId) ? lane.targetCount : 0
}

/**
 * The canonical organization summary. Every surface reads this; none rebuilds it.
 */
export async function getOrganizationDailySummary(
  client: DbClient,
  input: { orgId: string; businessDate: string; timezone?: string },
): Promise<OrganizationDailySummary> {
  const [lanes, repsRes] = await Promise.all([
    loadAccountabilityLanes(client, input),
    client.from('reps').select('id, name').eq('organization_id', input.orgId).limit(500),
  ])
  if (repsRes.error) throw repsRes.error
  const repNameById = new Map((repsRes.data ?? []).map((row) => [row.id as string, row.name as string]))

  const repsById = new Map<string, RepDailySummary>()
  const ensureRep = (repId: string): RepDailySummary => {
    let row = repsById.get(repId)
    if (!row) {
      row = { repId, repName: repNameById.get(repId) ?? 'Unknown', assigned: 0, completed: 0, remaining: 0, sharedTarget: 0, lanes: [] }
      repsById.set(repId, row)
    }
    return row
  }

  let tracked = 0
  let requirement = 0
  let assigned = 0
  let unseatedAllocationUnits = 0
  let completed = 0
  for (const lane of lanes) {
    tracked += lane.targetCount
    if (lane.targetable) requirement += lane.targetCount
    completed += lane.completed
    for (const repId of lane.seats) {
      const rep = ensureRep(repId)
      const personal = lanePersonalTarget(lane, repId)
      const allocation = lane.allocations.find((row) => row.repId === repId)?.targetCount ?? null
      const contribution = lane.contributions.find((row) => row.repId === repId)?.completedCount ?? 0
      rep.assigned += personal
      rep.completed += contribution
      rep.sharedTarget += lane.shared && allocation === null ? lane.targetCount : 0
      rep.lanes.push({
        identityId: lane.identityId,
        activityType: lane.activityType,
        targetCount: lane.targetCount,
        completed: contribution,
        allocation,
      })
    }
    // A lane with no seat at all is unowned; it still counts toward `tracked`.
    assigned += lane.seats.length === 1
      ? lane.targetCount
      : lane.allocations.reduce((sum, row) => sum + row.targetCount, 0)
    unseatedAllocationUnits += lane.allocations
      .filter((row) => !lane.seats.includes(row.repId))
      .reduce((sum, row) => sum + row.targetCount, 0)
  }

  for (const rep of repsById.values()) {
    rep.remaining = Math.max(0, rep.assigned - rep.completed)
  }

  return {
    organizationId: input.orgId,
    businessDate: input.businessDate,
    timezone: input.timezone ?? 'UTC',
    tracked,
    requirement,
    assigned,
    unseatedAllocationUnits,
    unallocated: Math.max(0, tracked - assigned),
    completed,
    remaining: Math.max(0, tracked - completed),
    reps: [...repsById.values()].sort((a, b) => a.repName.localeCompare(b.repName)),
    lanes: lanes.sort((a, b) => a.identityName.localeCompare(b.identityName) || a.activityType.localeCompare(b.activityType)),
  }
}

/** One rep's canonical day. */
export async function getRepDailySummary(
  client: DbClient,
  input: { orgId: string; repId: string; businessDate: string },
): Promise<RepDailySummary | null> {
  const summary = await getOrganizationDailySummary(client, input)
  return summary.reps.find((row) => row.repId === input.repId) ?? null
}

/** One channel's canonical day. */
export async function getProfileDailySummary(
  client: DbClient,
  input: { orgId: string; identityId: string; businessDate: string },
): Promise<AccountabilityLane[]> {
  const lanes = await loadAccountabilityLanes(client, input)
  return lanes.filter((lane) => lane.identityId === input.identityId)
}

/** Every explicit allocation in the organization, for the reconciliation report. */
export async function getAssignmentAllocations(
  client: DbClient,
  input: { orgId: string; businessDate: string },
): Promise<Array<{ identityId: string; identityName: string; activityType: string; repId: string; targetCount: number }>> {
  const lanes = await loadAccountabilityLanes(client, input)
  return lanes.flatMap((lane) =>
    lane.allocations.map((row) => ({
      identityId: lane.identityId,
      identityName: lane.identityName,
      activityType: lane.activityType,
      repId: row.repId,
      targetCount: row.targetCount,
    })),
  )
}

/** Completed units per rep / channel / activity — the activity-credit truth. */
export async function getActivityCredits(
  client: DbClient,
  input: { orgId: string; businessDate: string },
): Promise<Array<{ repId: string; identityId: string; activityType: string; completedCount: number }>> {
  const { data, error } = await client
    .from('daily_accountability')
    .select('rep_id, revenue_identity_id, activity_type, completed_count')
    .eq('organization_id', input.orgId)
    .eq('target_date', input.businessDate)
    .limit(5000)
  if (error) throw error
  return (data ?? []).map((row) => ({
    repId: row.rep_id as string,
    identityId: row.revenue_identity_id as string,
    activityType: row.activity_type as string,
    completedCount: (row.completed_count as number) ?? 0,
  }))
}

/** Overdue assigned work — delegated to the canonical task service. */
export async function getOverdueWork(
  client: DbClient,
  input: { orgId: string; repIds?: string[]; now?: Date },
): Promise<Map<string, number>> {
  return countOverdueAssignedByRep(client, input.orgId, input.repIds ?? null, input.now ?? new Date())
}

export interface AttendanceRow {
  repId: string
  businessDate: string
  checkInAt: string | null
  closedAt: string | null
  state: string | null
}

/** Check-in / close truth for a business date. Progress and attendance are separate. */
export async function getAttendanceSummary(
  client: DbClient,
  input: { orgId: string; businessDate: string },
): Promise<AttendanceRow[]> {
  const { data, error } = await client
    .from('rep_day')
    .select('rep_id, business_date, check_in_at, closed_at, state')
    .eq('organization_id', input.orgId)
    .eq('business_date', input.businessDate)
    .limit(500)
  if (error && !isMissingRelation(error)) throw error
  return (data ?? []).map((row) => ({
    repId: row.rep_id as string,
    businessDate: row.business_date as string,
    checkInAt: (row.check_in_at as string | null) ?? null,
    closedAt: (row.closed_at as string | null) ?? null,
    state: (row.state as string | null) ?? null,
  }))
}
