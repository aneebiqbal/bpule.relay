import type { TeamLivePayload } from '@/lib/admin/team-live'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

/**
 * Profile-first view of team execution.
 *
 * One row per `profiles` row (the sender account), aggregating every channel
 * identity assigned to it. This is the inverse of the rep-first Team view and
 * reads the same canonical `loadTeamLive` payload — no second query, no second
 * count.
 */

export interface TeamProfileRow {
  profileId: string
  profileName: string
  channels: string[]
  assignedReps: string[]
  assignedRepIds: string[]
  targetCount: number
  completedCount: number
  remaining: number
  followUps: number
  proposals: number
  status: string | null
}

const STATUS_RANK: Record<string, number> = {
  missed: 3,
  at_risk: 2,
  completed: 1,
  on_track: 0,
}

export function buildTeamProfiles(payload: TeamLivePayload): TeamProfileRow[] {
  const byProfile = new Map<string, TeamProfileRow>()
  const statusRankById = new Map<string, number>()

  for (const person of payload.people) {
    for (const identity of person.identities) {
      // An identity with no linked profile is its own profile row.
      const key = identity.profileId ?? `${person.repId}:${identity.id}`
      let row = byProfile.get(key)
      if (!row) {
        row = {
          profileId: key,
          profileName: identity.profileName ?? identity.name,
          channels: [],
          assignedReps: [],
          assignedRepIds: [],
          targetCount: 0,
          completedCount: 0,
          remaining: 0,
          followUps: 0,
          proposals: 0,
          status: null,
        }
        byProfile.set(key, row)
      }
      if (!row.channels.includes(identity.channel)) row.channels.push(identity.channel)
      if (!row.assignedReps.includes(person.repName)) row.assignedReps.push(person.repName)
      if (!row.assignedRepIds.includes(person.repId)) row.assignedRepIds.push(person.repId)

      for (const goal of person.goals.filter((g) => g.identityId === identity.id)) {
        row.targetCount += goal.target
        row.completedCount += goal.completed
        if (goal.activityType === 'followup') row.followUps += goal.completed
        if (goal.activityType === 'application') row.proposals += goal.completed
        const rank = STATUS_RANK[goal.status ?? ''] ?? -1
        if (rank > (statusRankById.get(key) ?? -1)) {
          statusRankById.set(key, rank)
          row.status = goal.status
        }
      }
    }
  }

  return [...byProfile.values()]
    .map((row) => ({
      ...row,
      remaining: Math.max(0, row.targetCount - row.completedCount),
    }))
    .sort((a, b) => a.profileName.localeCompare(b.profileName))
}

export interface TeamProfileDirectoryRow extends TeamProfileRow {
  assignmentCount: number
}

/**
 * Full profile directory for the admin control surface.
 *
 * `loadTeamLive` only carries identities that are assigned to a rep, so the
 * unassigned complement is added here from the same canonical tables. One
 * profile row per `profiles` row, assigned or not.
 */
export async function loadTeamProfileDirectory(orgId: string): Promise<{
  rows: TeamProfileDirectoryRow[]
  businessDate: string
  timezone: string
}> {
  const supabase = await createServerSupabase()
  const live = await loadTeamLive(orgId)
  const identityRes = await supabase
    .from('revenue_identities')
    .select('id, identity_name, channel, profile_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .limit(2000)

  const assignedRows = buildTeamProfiles(live)
  const assignedKeys = new Set(assignedRows.map((row) => row.profileId))
  const assignedIdentityIds = new Set(
    live.people.flatMap((person) => person.identities.map((identity) => identity.id)),
  )

  const unassignedIdentities = (identityRes.data ?? []).filter(
    (identity) => !assignedIdentityIds.has(identity.id),
  )
  const profileIds = [
    ...new Set(
      unassignedIdentities
        .map((identity) => identity.profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const profileRows = profileIds.length > 0
    ? (await supabase.from('profiles').select('id, display_name, full_name, label').in('id', profileIds).limit(2000)).data ?? []
    : []
  const profileNameById = new Map(
    profileRows.map((profile) => [
      profile.id,
      profile.display_name ?? profile.full_name ?? profile.label ?? 'Unnamed',
    ]),
  )

  const unassignedRows: TeamProfileDirectoryRow[] = []
  const byProfile = new Map<string, TeamProfileDirectoryRow>()
  for (const identity of unassignedIdentities) {
    const key = identity.profile_id ?? `identity:${identity.id}`
    if (assignedKeys.has(key)) continue
    let row = byProfile.get(key)
    if (!row) {
      row = {
        profileId: key,
        profileName: identity.profile_id
          ? (profileNameById.get(identity.profile_id) ?? 'Unnamed')
          : identity.identity_name,
        channels: [],
        assignedReps: [],
        assignedRepIds: [],
        targetCount: 0,
        completedCount: 0,
        remaining: 0,
        followUps: 0,
        proposals: 0,
        status: null,
        assignmentCount: 0,
      }
      byProfile.set(key, row)
      unassignedRows.push(row)
    }
    if (!row.channels.includes(identity.channel)) row.channels.push(identity.channel)
  }

  const rows = [
    ...assignedRows.map((row) => ({ ...row, assignmentCount: row.assignedReps.length })),
    ...unassignedRows,
  ].sort((a, b) => a.profileName.localeCompare(b.profileName))

  const policy = await loadOperatingPolicy(orgId)
  return { rows, businessDate: live.date, timezone: policy.timezone }
}
