import type { TeamLivePayload } from '@/lib/admin/team-live'

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
