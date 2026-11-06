import type { TeamLivePayload } from '@/lib/admin/team-live'
import { createServerSupabase } from '@/lib/supabase/server'
import type { DbClient } from '@/lib/db/types'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { loadCanonicalProfileAssignments } from '@/lib/profiles/canonical'

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

export type CoverageState = 'EXPLICIT' | 'DERIVED' | 'AMBIGUOUS' | 'UNASSIGNED'

export interface TeamProfileDirectoryRow extends TeamProfileRow {
  assignmentCount: number
  primaryRepId: string | null
  primaryRepName: string | null
  backups: string[]
  coverageState: CoverageState
  needsReview: boolean
  reviewReasons: string[]
}

/**
 * Full profile directory for the admin control surface.
 *
 * Ownership, backups and coverage state come from the ONE canonical assignment
 * service (`loadCanonicalProfileAssignments`), so Admin Profile Management
 * cannot disagree with Rep Home, the switcher, the selectors or the coverage
 * engine. `loadTeamLive` still supplies today's target completion.
 *
 * One profile row per `profiles` row — assigned, unassigned, or an orphan with
 * no channel identity at all (surfaced for review, never silently dropped).
 */
export async function loadTeamProfileDirectory(orgId: string): Promise<{
  rows: TeamProfileDirectoryRow[]
  businessDate: string
  timezone: string
}> {
  const supabase = await createServerSupabase()
  const [canonical, live] = await Promise.all([
    loadCanonicalProfileAssignments(orgId, { client: supabase }),
    loadTeamLive(orgId),
  ])
  const canonicalByProfile = new Map(canonical.profiles.map((profile) => [profile.profileId, profile]))

  const assignedRows = buildTeamProfiles(live)
  const assignedKeys = new Set(assignedRows.map((row) => row.profileId))
  const assignedIdentityIds = new Set(
    live.people.flatMap((person) => person.identities.map((identity) => identity.id)),
  )

  const identityRes = await supabase
    .from('revenue_identities')
    .select('id, identity_name, channel, profile_id')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .limit(2000)

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
      profile.display_name ?? profile.full_name ?? profile.label ?? 'Unnamed profile',
    ]),
  )

  const emptyOwnership = {
    primaryRepId: null,
    primaryRepName: null,
    backups: [] as string[],
    coverageState: 'UNASSIGNED' as CoverageState,
    needsReview: true,
    reviewReasons: ['No rep is assigned'],
  }

  const unassignedRows: TeamProfileDirectoryRow[] = []
  const byProfile = new Map<string, TeamProfileDirectoryRow>()
  for (const identity of unassignedIdentities) {
    const key = identity.profile_id ?? `identity:${identity.id}`
    if (assignedKeys.has(key)) continue
    let row = byProfile.get(key)
    if (!row) {
      const canonical = identity.profile_id ? canonicalByProfile.get(identity.profile_id) : undefined
      row = {
        profileId: key,
        profileName: identity.profile_id
          ? (profileNameById.get(identity.profile_id) ?? 'Unnamed profile')
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
        primaryRepId: canonical?.primaryRepId ?? emptyOwnership.primaryRepId,
        primaryRepName: canonical?.primaryRepName ?? emptyOwnership.primaryRepName,
        backups: canonical?.backups.map((backup) => backup.repName) ?? emptyOwnership.backups,
        coverageState: canonical?.coverageState ?? emptyOwnership.coverageState,
        needsReview: canonical?.needsReview ?? true,
        reviewReasons: canonical?.reviewReasons ?? emptyOwnership.reviewReasons,
      }
      byProfile.set(key, row)
      unassignedRows.push(row)
    }
    if (!row.channels.includes(identity.channel)) row.channels.push(identity.channel)
  }

  const assignedDirectory: TeamProfileDirectoryRow[] = assignedRows.map((row) => {
    const canonical = canonicalByProfile.get(row.profileId)
    return {
      ...row,
      assignmentCount: row.assignedReps.length,
      primaryRepId: canonical?.primaryRepId ?? null,
      primaryRepName: canonical?.primaryRepName ?? null,
      backups: canonical?.backups.map((backup) => backup.repName) ?? [],
      coverageState: canonical?.coverageState ?? (row.assignedReps.length === 0 ? 'UNASSIGNED' : 'AMBIGUOUS'),
      needsReview: canonical?.needsReview ?? false,
      reviewReasons: canonical?.reviewReasons ?? [],
    }
  })

  // Orphan profiles: a `profiles` row with no active identity at all. They are
  // surfaced for review, never silently dropped.
  const coveredProfileIds = new Set(
    [...assignedDirectory, ...unassignedRows].map((row) => row.profileId),
  )
  const orphanRes = await supabase
    .from('profiles')
    .select('id, display_name, full_name, label')
    .eq('organization_id', orgId)
    .limit(2000)
  const orphanRows: TeamProfileDirectoryRow[] = (orphanRes.data ?? [])
    .filter((profile) => !coveredProfileIds.has(profile.id))
    .map((profile) => ({
      profileId: profile.id,
      profileName: profile.display_name ?? profile.full_name ?? profile.label ?? 'Unnamed profile',
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
      primaryRepId: null,
      primaryRepName: null,
      backups: [],
      coverageState: 'UNASSIGNED',
      needsReview: true,
      reviewReasons: ['Profile has no channel identity'],
    }))

  const rows = [...assignedDirectory, ...unassignedRows, ...orphanRows].sort((a, b) =>
    a.profileName.localeCompare(b.profileName),
  )

  const policy = await loadOperatingPolicy(orgId)
  return { rows, businessDate: live.date, timezone: policy.timezone }
}
