import type { Profile, RevenueIdentityChannel } from '@/lib/domain/types'
import { getAuthorizedIdentities, type AuthorizedIdentity } from '@/lib/auth/workspace'
import { createScoutStore } from '@/lib/store'

/**
 * The canonical "profiles assigned to this rep" read model.
 *
 * A Profile is a `profiles` row (the sender account). A profile supports a
 * channel when at least one active `revenue_identities` row points at it with
 * that channel — `profiles.platform` is single-valued and cannot express
 * "LinkedIn and Upwork", so it is never used as the capability authority.
 *
 * Assignment is rep-based (`identity_assignments.rep_id`). This module is the
 * single source every surface reads: rep home, the workspace switcher, the
 * Upwork proposal flow and the LinkedIn prospect flow.
 */

export interface AssignedProfile {
  profile: Profile
  channels: RevenueIdentityChannel[]
  assignedIdentityIds: string[]
  assignmentIds: string[]
}

export function assignedProfileName(profile: AssignedProfile): string {
  const p = profile.profile
  return p.displayName ?? p.fullName ?? p.label ?? 'Unnamed profile'
}

/** Group assigned channel identities by the profile they send as. */
export function groupAssignedProfiles(
  identities: AuthorizedIdentity[],
  profiles: Profile[],
): AssignedProfile[] {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  const grouped = new Map<string, AssignedProfile>()

  for (const identity of identities) {
    if (identity.status !== 'active') continue
    if (!identity.profileId) {
      // shortcut: an identity with no linked profile has no sender account to
      // generate proof from; upgrade when orphaned identities become sendable.
      continue
    }
    const profile = byId.get(identity.profileId)
    if (!profile) continue

    let entry = grouped.get(profile.id)
    if (!entry) {
      entry = { profile, channels: [], assignedIdentityIds: [], assignmentIds: [] }
      grouped.set(profile.id, entry)
    }
    const channel = identity.channel as RevenueIdentityChannel
    if (!entry.channels.includes(channel)) entry.channels.push(channel)
    entry.assignedIdentityIds.push(identity.revenueIdentityId)
    entry.assignmentIds.push(identity.assignmentId)
  }

  return [...grouped.values()]
}

export async function listAssignedProfiles(): Promise<AssignedProfile[]> {
  const identities = await getAuthorizedIdentities()
  const profileIds = [
    ...new Set(
      identities
        .map((i) => i.profileId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const store = await createScoutStore()
  const profiles = profileIds.length > 0 ? await store.listProfilesByIds(profileIds) : []
  return groupAssignedProfiles(identities, profiles)
}

export function filterAssignedProfilesByChannel(
  profiles: AssignedProfile[],
  channel: RevenueIdentityChannel,
): AssignedProfile[] {
  return profiles.filter((p) => p.channels.includes(channel))
}
