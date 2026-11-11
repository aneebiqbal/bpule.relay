import type { TeamLivePayload } from '@/lib/admin/team-live'
import { createServerSupabase } from '@/lib/supabase/server'
import { loadTeamLive } from '@/lib/admin/load-team-live'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { loadCanonicalProfileAssignments, type CanonicalProfileAssignment } from '@/lib/profiles/canonical'

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

export function buildTeamProfiles(
  payload: TeamLivePayload,
  personKeyByProfile?: Map<string, string>,
): TeamProfileRow[] {
  const byProfile = new Map<string, TeamProfileRow>()
  const statusRankById = new Map<string, number>()

  for (const person of payload.people) {
    for (const identity of person.identities) {
      // One row per PERSON: duplicate/orphan profiles point at their canonical
      // profile via person_id, so a two-channel person renders once.
      const profileKey = identity.profileId ?? `${person.repId}:${identity.id}`
      const key = (identity.personKey ?? (identity.profileId && personKeyByProfile?.get(identity.profileId))) || profileKey
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
      // The canonical sender account carries the person's real name; a
      // channel account's label must not win once the rows are grouped.
      if (identity.profileId && identity.personKey != null && identity.personKey === identity.profileId) {
        row.profileName = identity.profileName ?? identity.name
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

type DirectoryIdentity = { id: string; profile_id: string | null; channel: string; identity_name: string }

/**
 * Per-channel execution for one person. The channels are children of the
 * person, so the directory shows them inside one row — never as duplicates.
 */
function buildChannelDetails(
  personKey: string,
  identitiesByPerson: Map<string, DirectoryIdentity[]>,
  canonicalByProfile: Map<string, CanonicalProfileAssignment>,
  goalsByIdentity: Map<string, { completed: number; target: number }>,
): TeamProfileChannelDetail[] {
  return (identitiesByPerson.get(personKey) ?? []).map((identity) => {
    const canonical = identity.profile_id ? canonicalByProfile.get(identity.profile_id) : undefined
    const goal = goalsByIdentity.get(identity.id)
    return {
      identityId: identity.id,
      profileId: identity.profile_id,
      channel: identity.channel,
      identityName: identity.identity_name,
      primaryRepName: canonical?.primaryRepName ?? null,
      operatorRepIds: canonical?.operators.map((operator) => operator.repId) ?? [],
      backupRepIds: canonical?.backups.map((backup) => backup.repId) ?? [],
      operators: canonical?.operators.map((operator) => operator.repName) ?? [],
      backups: canonical?.backups.map((backup) => backup.repName) ?? [],
      completed: goal?.completed ?? 0,
      target: goal?.target ?? 0,
    }
  })
}

export interface TeamProfileChannelDetail {
  identityId: string
  profileId: string | null
  channel: string
  identityName: string
  primaryRepName: string | null
  operators: string[]
  backups: string[]
  /** Rep ids behind the seats, for the Manage people dialog. */
  operatorRepIds: string[]
  backupRepIds: string[]
  completed: number
  target: number
}

export interface TeamProfileDirectoryRow extends TeamProfileRow {
  assignmentCount: number
  primaryRepId: string | null
  primaryRepName: string | null
  operators: string[]
  backups: string[]
  /** Reps marked unavailable today — assigned, but not current operators. */
  unavailableRepIds: string[]
  /** Reps whose responsibility is not yet acknowledged. */
  pendingAcknowledgementRepIds: string[]
  coverageState: CoverageState
  needsReview: boolean
  reviewReasons: string[]
  /** Per-channel execution — a person's channels are children, not duplicates. */
  channelDetails: TeamProfileChannelDetail[]
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
  const live = await loadTeamLive(orgId)
  const supabase = await createServerSupabase()
  const [canonical, allProfilesRes, availabilityRes, acknowledgementRes] = await Promise.all([
    loadCanonicalProfileAssignments(orgId, { client: supabase }),
    supabase
      .from('profiles')
      .select('id, display_name, full_name, label, person_id')
      .eq('organization_id', orgId)
      .limit(2000),
    supabase
      .from('rep_availability')
      .select('rep_id, state')
      .eq('organization_id', orgId)
      .eq('business_date', live.date)
      .limit(2000),
    supabase
      .from('responsibility_acknowledgements')
      .select('rep_id')
      .eq('organization_id', orgId)
      .is('acknowledged_at', null)
      .in('subject', ['PRIMARY', 'OPERATOR'])
      .limit(2000),
  ])
  const canonicalByProfile = new Map(canonical.profiles.map((profile) => [profile.profileId, profile]))

  // Assigned but not currently working: on leave, offline or explicitly unavailable.
  const unavailableRepIds = new Set(
    ((availabilityRes.data ?? []) as Array<{ rep_id: string; state: string }>)
      .filter((row) => row.state !== 'AVAILABLE' && row.state !== 'WORKING')
      .map((row) => row.rep_id),
  )
  const pendingAcknowledgementRepIds = new Set(
    ((acknowledgementRes.data ?? []) as Array<{ rep_id: string }>).map((row) => row.rep_id),
  )

  // Person grouping: a duplicate/orphan profile renders under its canonical
  // person, so the directory is one row per human, never one per channel.
  const allProfiles = (allProfilesRes.data ?? []) as Array<{
    id: string
    display_name: string | null
    full_name: string | null
    label: string | null
    person_id: string | null
  }>
  const personKeyByProfile = new Map<string, string>()
  const canonicalNameById = new Map<string, string>()
  for (const profile of allProfiles) {
    const key = profile.person_id ?? profile.id
    personKeyByProfile.set(profile.id, key)
    // The canonical profile's own name wins — never a channel child's label,
    // which may be "Fizza, LinkedIn" or "Fizza Upwork".
    const isCanonical = profile.person_id === null
    if (isCanonical || !canonicalNameById.has(key)) {
      canonicalNameById.set(key, profile.display_name ?? profile.full_name ?? profile.label ?? 'Unnamed profile')
    }
  }

  const assignedRows = buildTeamProfiles(live, personKeyByProfile)
    .map((row) => ({ ...row, profileName: canonicalNameById.get(row.profileId) ?? row.profileName }))
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

  const identities = (identityRes.data ?? []) as DirectoryIdentity[]
  const unassignedIdentities = identities.filter(
    (identity) => !assignedIdentityIds.has(identity.id),
  )
  const profileNameById = canonicalNameById

  // Per-channel execution: group the person's identities under their person key
  // and attach the canonical ownership plus today's goal for each channel.
  const identitiesByPerson = new Map<string, DirectoryIdentity[]>()
  for (const identity of identities) {
    if (!identity.profile_id) continue
    const key = personKeyByProfile.get(identity.profile_id)
    if (!key) continue
    const list = identitiesByPerson.get(key) ?? []
    list.push(identity)
    identitiesByPerson.set(key, list)
  }
  const goalsByIdentity = new Map<string, { completed: number; target: number }>()
  for (const person of live.people) {
    for (const goal of person.goals) {
      const entry = goalsByIdentity.get(goal.identityId) ?? { completed: 0, target: 0 }
      entry.completed += goal.completed
      entry.target += goal.target
      goalsByIdentity.set(goal.identityId, entry)
    }
  }
  const channelDetailsFor = (personKey: string) =>
    buildChannelDetails(personKey, identitiesByPerson, canonicalByProfile, goalsByIdentity)

  const emptyOwnership = {
    primaryRepId: null,
    primaryRepName: null,
    operators: [] as string[],
    backups: [] as string[],
    unavailableRepIds: [] as string[],
    pendingAcknowledgementRepIds: [] as string[],
    coverageState: 'UNASSIGNED' as CoverageState,
    needsReview: true,
    reviewReasons: ['No rep is assigned'],
  }

  const unassignedRows: TeamProfileDirectoryRow[] = []
  const byProfile = new Map<string, TeamProfileDirectoryRow>()
  for (const identity of unassignedIdentities) {
    const profileKey = identity.profile_id ?? `identity:${identity.id}`
    const key = (identity.profile_id && personKeyByProfile.get(identity.profile_id)) || profileKey
    if (assignedKeys.has(key)) continue
    let row = byProfile.get(key)
    if (!row) {
      const canonical = identity.profile_id ? canonicalByProfile.get(key) : undefined
      row = {
        profileId: key,
        profileName: profileNameById.get(key) ?? identity.identity_name,
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
        operators: canonical?.operators.map((operator) => operator.repName) ?? emptyOwnership.operators,
        backups: canonical?.backups.map((backup) => backup.repName) ?? emptyOwnership.backups,
        unavailableRepIds: [...unavailableRepIds],
        pendingAcknowledgementRepIds: [...pendingAcknowledgementRepIds],
        coverageState: canonical?.coverageState ?? emptyOwnership.coverageState,
        needsReview: canonical?.needsReview ?? true,
        reviewReasons: canonical?.reviewReasons ?? emptyOwnership.reviewReasons,
        channelDetails: channelDetailsFor(key),
      }
      byProfile.set(key, row)
      unassignedRows.push(row)
    }
    if (!row.channels.includes(identity.channel)) row.channels.push(identity.channel)
    row.channelDetails = channelDetailsFor(key)
  }

  const assignedDirectory: TeamProfileDirectoryRow[] = assignedRows.map((row) => {
    const canonical = canonicalByProfile.get(row.profileId)
    return {
      ...row,
      assignmentCount: row.assignedReps.length,
      primaryRepId: canonical?.primaryRepId ?? null,
      primaryRepName: canonical?.primaryRepName ?? null,
      operators: canonical?.operators.map((operator) => operator.repName) ?? [],
      backups: canonical?.backups.map((backup) => backup.repName) ?? [],
      unavailableRepIds: [...unavailableRepIds],
      pendingAcknowledgementRepIds: [...pendingAcknowledgementRepIds],
      coverageState: canonical?.coverageState ?? (row.assignedReps.length === 0 ? 'UNASSIGNED' : 'AMBIGUOUS'),
      needsReview: canonical?.needsReview ?? false,
      reviewReasons: canonical?.reviewReasons ?? [],
      channelDetails: channelDetailsFor(row.profileId),
    }
  })

  // Orphan profiles: a `profiles` row with no active identity at all. They are
  // surfaced for review, never silently dropped.
  const coveredProfileIds = new Set(
    [...assignedDirectory, ...unassignedRows].map((row) => row.profileId),
  )
  const orphanRows: TeamProfileDirectoryRow[] = allProfiles
    .filter((profile) => !coveredProfileIds.has(personKeyByProfile.get(profile.id) ?? profile.id))
    .map((profile) => {
      const key = personKeyByProfile.get(profile.id) ?? profile.id
      return {
      profileId: key,
      profileName: canonicalNameById.get(key) ?? 'Unnamed profile',
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
      operators: [],
      backups: [],
      unavailableRepIds: [...unavailableRepIds],
      pendingAcknowledgementRepIds: [...pendingAcknowledgementRepIds],
      coverageState: 'UNASSIGNED',
      needsReview: true,
      reviewReasons: ['Profile has no channel identity'],
      channelDetails: [],
      }
    })

  const rows = [...assignedDirectory, ...unassignedRows, ...orphanRows].sort((a, b) =>
    a.profileName.localeCompare(b.profileName),
  )

  const policy = await loadOperatingPolicy(orgId)
  return { rows, businessDate: live.date, timezone: policy.timezone }
}
