import type { DbClient } from '@/lib/db/types'
import { personNameFromProfile } from '@/lib/profiles/person-name'
import { activityLabel } from '@/lib/responsibility/activity-registry'
import {
  computeProfileProgress,
  type PlanLane,
  type ProfilePlanProgress,
  type RepContribution,
} from './plan-model'

/**
 * The ONE canonical plan/accountability projection (V6.1).
 *
 * Every surface reads this. It never reads `daily_targets` — the plan belongs to
 * the channel, and `daily_accountability` already records who contributed.
 *
 * Batched: two queries for the whole org, then in-memory grouping. No per-profile
 * or per-rep round trip.
 */

export interface PlanProgressQuery {
  orgId: string
  businessDate: string
  /** Restrict to one identity. */
  identityId?: string
  /** Restrict to one rep's contribution. */
  repId?: string
}

export interface IdentityPlanProgress extends ProfilePlanProgress {
  identityId: string
  identityName: string
  channel: string
  personId: string | null
  personName: string
  /** True when more than one rep contributed today. */
  shared: boolean
  pace: 'on_track' | 'behind' | 'at_risk' | 'complete' | 'no_plan'
  expectedByNow: number
}

interface PlanRow {
  id: string
  revenue_identity_id: string
  activity_type: string
  target_count: number
  targetable: boolean
  effective_from: string
  effective_until: string | null
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
}

/** The §5 applicability rule, in one place. */
export function isPlanEffectiveOn(
  row: { effectiveFrom: string; effectiveUntil: string | null; active: boolean },
  day: string,
): boolean {
  if (!row.active) return false
  if (row.effectiveFrom > day) return false
  return row.effectiveUntil == null || row.effectiveUntil >= day
}

export async function loadDailyPlanProgress(
  client: DbClient,
  query: PlanProgressQuery,
): Promise<IdentityPlanProgress[]> {
  const [planRes, accountabilityRes] = await Promise.all([
    client
      .from('daily_target_plans')
      .select('id, revenue_identity_id, activity_type, target_count, targetable, effective_from, effective_until, active')
      .eq('organization_id', query.orgId)
      .eq('active', true)
      .limit(2000),
    client
      .from('daily_accountability')
      .select('revenue_identity_id, activity_type, rep_id, completed_count')
      .eq('organization_id', query.orgId)
      .eq('target_date', query.businessDate)
      .limit(5000),
  ])

  const plans = ((planRes.data ?? []) as Array<PlanRow & { active: boolean }>).filter((row) =>
    isPlanEffectiveOn(
      {
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until,
        active: row.active,
      },
      query.businessDate,
    ),
  )

  const accountability = (accountabilityRes.data ?? []) as AccountabilityRow[]
  const identityIds = [...new Set(plans.map((row) => row.revenue_identity_id))]

  if (identityIds.length === 0) return []

  const { data: identityRows } = await client
    .from('revenue_identities')
    .select('id, identity_name, channel, profile_id')
    .eq('organization_id', query.orgId)
    .in('id', identityIds)
    .limit(500)

  const identities = (identityRows ?? []) as IdentityRow[]
  const profileIds = [
    ...new Set(identities.map((row) => row.profile_id).filter((id): id is string => Boolean(id))),
  ]
  const personNameById = new Map<string, string>()
  if (profileIds.length > 0) {
    const { data: profileRows } = await client
      .from('profiles')
      .select('id, display_name, full_name, label')
      .eq('organization_id', query.orgId)
      .in('id', profileIds)
      .limit(200)
    for (const row of (profileRows ?? []) as Array<{
      id: string
      display_name: string | null
      full_name: string | null
      label: string | null
    }>) {
      personNameById.set(row.id, personNameFromProfile(row))
    }
  }

  const repIds = [...new Set(accountability.map((row) => row.rep_id))]
  const repNameById = new Map<string, string>()
  if (repIds.length > 0) {
    const { data: repRows } = await client
      .from('reps')
      .select('id, name')
      .eq('organization_id', query.orgId)
      .in('id', repIds)
      .limit(200)
    for (const row of (repRows ?? []) as Array<{ id: string; name: string }>) {
      repNameById.set(row.id, row.name)
    }
  }

  const completedByLane = new Map<string, number>()
  const contributionsByLane = new Map<string, RepContribution[]>()
  for (const row of accountability) {
    if (query.repId && row.rep_id !== query.repId) continue
    const laneKey = `${row.revenue_identity_id}:${row.activity_type}`
    completedByLane.set(laneKey, (completedByLane.get(laneKey) ?? 0) + row.completed_count)
    const list = contributionsByLane.get(row.revenue_identity_id) ?? []
    const existing = list.find((entry) => entry.repId === row.rep_id)
    if (existing) existing.completedCount += row.completed_count
    else list.push({ repId: row.rep_id, completedCount: row.completed_count })
    contributionsByLane.set(row.revenue_identity_id, list)
  }

  const out: IdentityPlanProgress[] = []
  for (const identity of identities) {
    if (query.identityId && identity.id !== query.identityId) continue
    const lanes: PlanLane[] = plans
      .filter((row) => row.revenue_identity_id === identity.id)
      .map((row) => ({
        identityId: identity.id,
        activityType: row.activity_type,
        targetCount: row.target_count,
        targetable: row.targetable,
      }))

    const progress = computeProfileProgress({
      identityId: identity.id,
      lanes,
      contributions: contributionsByLane.get(identity.id) ?? [],
      completedByLane:
        lanes.reduce<Record<string, number>>((acc, lane) => {
          acc[lane.activityType] =
            completedByLane.get(`${identity.id}:${lane.activityType}`) ?? 0
          return acc
        }, {}),
    })

    const contributionTotal = progress.contributions.reduce(
      (sum, row) => sum + row.completedCount,
      0,
    )

    out.push({
      ...progress,
      identityId: identity.id,
      identityName: identity.identity_name,
      channel: identity.channel,
      personId: identity.profile_id,
      personName: identity.profile_id
        ? (personNameById.get(identity.profile_id) ?? 'Profile')
        : 'Profile',
      shared: progress.contributions.filter((row) => row.completedCount > 0).length > 1,
      pace: progress.hasPlan
        ? contributionTotal >= progress.target
          ? 'complete'
          : 'on_track'
        : 'no_plan',
      expectedByNow: Math.round(progress.target * 0.5),
      lanes: progress.lanes.map((lane) => ({
        ...lane,
        label: activityLabel(lane.activityType),
      })),
    })
  }

  return out.sort((a, b) => a.personName.localeCompare(b.personName))
}

/** Team total: each unique targetable lane counts exactly once. */
export function computeTeamPlanTotalFromProgress(progress: IdentityPlanProgress[]): number {
  return progress.reduce((sum, row) => sum + row.target, 0)
}
