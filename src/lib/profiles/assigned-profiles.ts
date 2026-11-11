import type { Profile, RevenueIdentityChannel } from '@/lib/domain/types'
import { getAuthorizedIdentities, type AuthorizedIdentity } from '@/lib/auth/workspace'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { createScoutStore } from '@/lib/store'
import { normalizeChannel } from '@/lib/profiles/channel'

export { normalizeChannel } from '@/lib/profiles/channel'

export interface AssignedIdentity {
  id: string
  channel: RevenueIdentityChannel
}

export interface AssignedProfile {
  profile: Profile
  channels: RevenueIdentityChannel[]
  assignedIdentityIds: string[]
  assignmentIds: string[]
  /** The executable identities behind this profile, with their channel. */
  identities: AssignedIdentity[]
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
      entry = { profile, channels: [], assignedIdentityIds: [], assignmentIds: [], identities: [] }
      grouped.set(profile.id, entry)
    }
    const channel = normalizeChannel(identity.channel)
    if (!entry.channels.includes(channel)) entry.channels.push(channel)
    entry.assignedIdentityIds.push(identity.revenueIdentityId)
    entry.assignmentIds.push(identity.assignmentId)
    entry.identities.push({ id: identity.revenueIdentityId, channel })
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

/**
 * The same canonical eligibility, for a rep other than the signed-in user.
 *
 * Admin/owner on-behalf generation needs this: the proposal must be written in
 * the acting rep's profile voice, not the admin's. Callers must have already
 * authorized the admin and validated that `repId` belongs to `orgId`.
 */
export async function listAssignedProfilesForRep(
  orgId: string,
  repId: string,
): Promise<AssignedProfile[]> {
  // The store's own client follows the active provider, so this works under
  // Supabase and Neon alike without building a second client.
  const store = await createScoutStore()
  const client = store.getSupabaseClient()

  // Canonical execution scope: PRIMARY ownership plus active coverage, minus
  // any profile under REPLACE coverage. Backup eligibility is not execution.
  const executable = await listExecutableIdentitiesForRep(
    client,
    orgId,
    repId,
    orgDate(currentInstant(), (await loadOperatingPolicy(orgId)).timezone),
  )
  if (executable.length === 0) return []

  const { data: identityRows, error } = await client
    .from('revenue_identities')
    .select('id, identity_name, title, channel, status, profile_id, profile_url')
    .in('id', executable.map((row) => row.id))
    .limit(500)
  if (error) throw error

  const executableById = new Map(executable.map((row) => [row.id, row]))
  const profileIds = [
    ...new Set(
      (identityRows ?? [])
        .map((row) => row.profile_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const profiles = profileIds.length > 0 ? await store.listProfilesByIds(profileIds) : []

  const identities: AuthorizedIdentity[] = (identityRows ?? []).map((row) => {
    const executableRow = executableById.get(row.id as string)
    return {
      assignmentId: executableRow?.assignmentId ?? `assignment:${row.id as string}`,
      revenueIdentityId: row.id as string,
      identityName: row.identity_name as string,
      title: (row.title as string) ?? null,
      channel: normalizeChannel(row.channel as string),
      profileId: (row.profile_id as string) ?? null,
      personId: (row.profile_id as string) ?? null,
      profileUrl: (row.profile_url as string) ?? null,
      status: row.status === 'archived' ? 'archived' : 'active',
      access: executableRow?.access === 'coverage' ? 'coverage' : 'assigned',
      assignedAt: executableRow?.assignedAt ?? null,
    }
  })

  return groupAssignedProfiles(identities, profiles)
}
