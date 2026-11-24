import type { DbClient } from '@/lib/db/types'
import type { RevenueIdentityChannel } from '@/lib/domain/types'
import { normalizeChannel } from '@/lib/profiles/channel'
import { getAccountabilityLedger, reconcilePopulations } from '@/lib/execution/accountability'
import { loadCanonicalProfileAssignments } from '@/lib/profiles/canonical'
import { defaultTargetsForChannel, type DefaultDailyTarget } from '@/lib/accountability/default-targets'
import { countOverdueAssignedByRep } from '@/lib/tasks/assigned-tasks'
import { loadTeamDay } from '@/lib/rep-day/team'

/**
 * Admin → Work Setup read model.
 *
 * One row per real account/channel. Every number comes from the canonical
 * accountability projection (`getAccountabilityLedger`) and every seat from the
 * canonical assignment read model (`loadCanonicalProfileAssignments`), so the
 * screen cannot disagree with Team Today, Rep Today or the command center.
 *
 * This is the ONE place an admin configures who works what and how much is
 * expected. Other surfaces link here with the account preselected.
 */

export interface WorkSetupLane {
  planId: string
  activityType: string
  targetCount: number
  targetable: boolean
  completed: number
  allocated: number
  allocations: Array<{ repId: string; repName: string; targetCount: number }>
}

export interface WorkSetupRow {
  identityId: string
  identityName: string
  channel: RevenueIdentityChannel
  profileId: string | null
  profileName: string | null
  status: string
  primaryRepId: string | null
  primaryRepName: string | null
  operators: Array<{ repId: string; repName: string }>
  backups: Array<{ repId: string; repName: string }>
  /** Targetable requirement for this account. */
  requirement: number
  /** Requirement plus tracked-only lanes. */
  tracked: number
  allocated: number
  unallocated: number
  completed: number
  remaining: number
  lanes: WorkSetupLane[]
  issues: string[]
  /** Compare-and-set token: POST this back as `expectedRevision`. */
  revision?: string
}

export interface WorkSetupTotals {
  plannedRequirement: number
  allocatedTarget: number
  unallocatedTarget: number
  completedActions: number
  remainingAllocated: number
  remainingOrganization: number
  overdueTasks: number
  activePeople: number
  activeAccounts: number
}

export interface WorkSetupPayload {
  businessDate: string
  timezone: string
  reps: Array<{ id: string; name: string }>
  rows: WorkSetupRow[]
  totals: WorkSetupTotals
  presets: Record<RevenueIdentityChannel, DefaultDailyTarget[]>
}

interface IdentityFact {
  id: string
  identityName: string
  channel: RevenueIdentityChannel
  profileId: string | null
  status: string
}

/**
 * Pure row assembly. Exposed separately so the reconciliation tests can pin
 * the population arithmetic without a database.
 */
export function assembleWorkSetup(input: {
  businessDate: string
  timezone: string
  reps: Array<{ id: string; name: string }>
  identities: IdentityFact[]
  lanes: Array<{
    identityId: string
    planId: string
    activityType: string
    targetCount: number
    targetable: boolean
    completed: number
    allocations: Array<{ repId: string; repName: string; targetCount: number }>
  }>
  profiles: Array<{
    profileId: string
    profileName: string
    identityIds: string[]
    primaryRepId: string | null
    primaryRepName: string | null
    operators: Array<{ repId: string; repName: string }>
    backups: Array<{ repId: string; repName: string }>
  }>
  populations: ReturnType<typeof reconcilePopulations>
  overdueTasks: number
  revisions: Map<string, string>
}): WorkSetupPayload {
  const lanesByIdentity = new Map<string, WorkSetupLane[]>()
  for (const lane of input.lanes) {
    const list = lanesByIdentity.get(lane.identityId) ?? []
    list.push({
      planId: lane.planId,
      activityType: lane.activityType,
      targetCount: lane.targetCount,
      targetable: lane.targetable,
      completed: lane.completed,
      allocated: lane.allocations.reduce((sum, row) => sum + row.targetCount, 0),
      allocations: lane.allocations,
    })
    lanesByIdentity.set(lane.identityId, list)
  }

  const profileByIdentity = new Map<string, (typeof input.profiles)[number]>()
  for (const profile of input.profiles) {
    for (const identityId of profile.identityIds) profileByIdentity.set(identityId, profile)
  }

  const rows: WorkSetupRow[] = input.identities.map((identity) => {
    const profile = profileByIdentity.get(identity.id) ?? null
    const lanes = lanesByIdentity.get(identity.id) ?? []
    const requirement = lanes.filter((lane) => lane.targetable).reduce((sum, lane) => sum + lane.targetCount, 0)
    const tracked = lanes.reduce((sum, lane) => sum + lane.targetCount, 0)
    // `allocated` counts only seated operators, matching the canonical
    // `requirementAssigned` population. An allocation whose rep holds no seat is
    // drift, not a personal expectation, and is surfaced as an issue instead.
    const seated = new Set(
      [profile?.primaryRepId, ...(profile?.operators ?? []).map((seat) => seat.repId)].filter((repId): repId is string => Boolean(repId)),
    )
    const allocated = lanes.reduce(
      (sum, lane) => sum + lane.allocations.filter((row) => seated.has(row.repId)).reduce((inner, row) => inner + row.targetCount, 0),
      0,
    )
    const unseatedAllocation = lanes.reduce(
      (sum, lane) => sum + lane.allocations.filter((row) => !seated.has(row.repId)).reduce((inner, row) => inner + row.targetCount, 0),
      0,
    )
    const completed = lanes.reduce((sum, lane) => sum + lane.completed, 0)

    const issues: string[] = []
    if (identity.status === 'archived') issues.push('archived')
    if (!profile?.primaryRepId) issues.push('unassigned')
    if (requirement === 0) issues.push('missing-target')
    if (allocated > requirement) issues.push('over-allocated')
    if (unseatedAllocation > 0) issues.push('allocation-without-seat')

    return {
      identityId: identity.id,
      identityName: identity.identityName,
      channel: identity.channel,
      profileId: identity.profileId ?? profile?.profileId ?? null,
      profileName: profile?.profileName ?? identity.profileId ?? null,
      status: identity.status,
      primaryRepId: profile?.primaryRepId ?? null,
      primaryRepName: profile?.primaryRepName ?? null,
      operators: profile?.operators ?? [],
      backups: profile?.backups ?? [],
      requirement,
      tracked,
      allocated,
      unallocated: Math.max(0, requirement - allocated),
      completed,
      remaining: Math.max(0, requirement - completed),
      lanes,
      issues,
      revision: input.revisions.get(identity.id),
    }
  })

  rows.sort(
    (a, b) =>
      (a.profileName ?? '').localeCompare(b.profileName ?? '') ||
      a.identityName.localeCompare(b.identityName) ||
      a.channel.localeCompare(b.channel),
  )

  const assignedRepIds = new Set<string>()
  for (const row of rows) {
    if (row.primaryRepId) assignedRepIds.add(row.primaryRepId)
    for (const operator of row.operators) assignedRepIds.add(operator.repId)
  }

  const totals: WorkSetupTotals = {
    plannedRequirement: input.populations.requirement,
    allocatedTarget: input.populations.requirementAssigned,
    unallocatedTarget: input.populations.requirementUnallocated,
    completedActions: input.populations.completed,
    remainingAllocated: Math.max(0, input.populations.requirementAssigned - input.populations.completed),
    remainingOrganization: Math.max(0, input.populations.tracked - input.populations.completed),
    overdueTasks: input.overdueTasks,
    activePeople: assignedRepIds.size,
    activeAccounts: rows.filter((row) => row.status === 'active').length,
  }

  return {
    businessDate: input.businessDate,
    timezone: input.timezone,
    reps: input.reps,
    rows,
    totals,
    presets: {
      linkedin: defaultTargetsForChannel('linkedin'),
      upwork: defaultTargetsForChannel('upwork'),
      email: defaultTargetsForChannel('email'),
      other: defaultTargetsForChannel('other'),
    },
  }
}

/** Server loader. One bounded read set, all canonical. */
export async function loadWorkSetup(
  client: DbClient,
  input: { orgId: string; businessDate?: string; timezone?: string },
): Promise<WorkSetupPayload> {
  const team = await loadTeamDay()
  const businessDate = input.businessDate ?? team.businessDate
  const [ledger, canonical, repRows, identityRows, overdueByRep, revisionRows] = await Promise.all([
    getAccountabilityLedger(client, { orgId: input.orgId, businessDate }),
    loadCanonicalProfileAssignments(input.orgId, { client }),
    client.from('reps').select('id, name').eq('organization_id', input.orgId).order('name').limit(2000),
    client
      .from('revenue_identities')
      .select('id, identity_name, channel, profile_id, status')
      .eq('organization_id', input.orgId)
      .limit(5000),
    countOverdueAssignedByRep(client, input.orgId, null).catch(() => new Map<string, number>()),
    client.raw
      ? client.raw(
          `SELECT ri.id AS identity_id, GREATEST(
             COALESCE((SELECT MAX(pc.updated_at) FROM profile_coverage pc WHERE pc.organization_id = ri.organization_id AND pc.profile_id = ri.profile_id), to_timestamp(0)),
             COALESCE((SELECT MAX(p.updated_at) FROM daily_target_plans p WHERE p.organization_id = ri.organization_id AND p.revenue_identity_id = ri.id), to_timestamp(0)),
             COALESCE((SELECT MAX(a.updated_at) FROM daily_plan_allocations a JOIN daily_target_plans p ON p.id = a.plan_id WHERE p.organization_id = ri.organization_id AND p.revenue_identity_id = ri.id), to_timestamp(0)),
             -- Assignments are deleted and re-inserted, never updated, so created_at is the revision clock.
             COALESCE((SELECT MAX(ia.created_at) FROM identity_assignments ia WHERE ia.organization_id = ri.organization_id AND ia.revenue_identity_id = ri.id), to_timestamp(0))
           )::text AS revision
           FROM revenue_identities ri WHERE ri.organization_id = $1`,
          [input.orgId],
        )
      : Promise.resolve({ data: [], error: null }),
  ])
  if (repRows.error) throw repRows.error
  if (identityRows.error) throw identityRows.error
  if (revisionRows.error) throw revisionRows.error
  const revisions = new Map<string, string>(
    (((revisionRows.data ?? []) as Array<{ identity_id: string; revision: string }>) ?? []).map((row) => [
      row.identity_id,
      row.revision,
    ]),
  )

  const identities: IdentityFact[] = ((identityRows.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    identityName: (row.identity_name as string) || 'Unnamed account',
    channel: normalizeChannel(row.channel as string),
    profileId: (row.profile_id as string | null) ?? null,
    status: (row.status as string) || 'active',
  }))

  const overdueTasks = [...overdueByRep.values()].reduce((sum, value) => sum + value, 0)

  return assembleWorkSetup({
    businessDate,
    timezone: input.timezone ?? team.timezone,
    reps: ((repRows.data ?? []) as Array<{ id: string; name: string }>).map((row) => ({
      id: row.id,
      name: row.name,
    })),
    identities,
    lanes: ledger.rows.map((lane) => ({
      identityId: lane.identityId,
      planId: lane.planId,
      activityType: lane.activityType,
      targetCount: lane.targetCount,
      targetable: lane.targetable,
      completed: lane.completed,
      allocations: lane.allocations,
    })),
    profiles: canonical.profiles.map((profile) => ({
      profileId: profile.profileId,
      profileName: profile.profileName,
      identityIds: profile.identityIds,
      primaryRepId: profile.primaryRepId,
      primaryRepName: profile.primaryRepName,
      operators: profile.operators,
      backups: profile.backups,
    })),
    populations: ledger.populations,
    overdueTasks,
    revisions,
  })
}
