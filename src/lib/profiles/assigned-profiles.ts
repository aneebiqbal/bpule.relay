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

/**
 * Canonical channel for any stored or typed value. Production rows have always
 * been lowercase, but a hand-edited row or an imported identity must not make a
 * profile disappear from a channel surface — every surface compares through
 * this, so `UPWORK` and `upwork` are the same capability.
 */
export function normalizeChannel(value: string | null | undefined): RevenueIdentityChannel {
  if (!value) return 'other'
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (key === 'linkedin' || key === 'linked_in') return 'linkedin'
  if (key === 'upwork' || key === 'up_work') return 'upwork'
  if (key === 'email' || key === 'e_mail') return 'email'
  return 'other'
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
    const channel = normalizeChannel(identity.channel)
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

  const { data: assignments, error } = await client
    .from('identity_assignments')
    .select('id, revenue_identity_id')
    .eq('rep_id', repId)
    .eq('organization_id', orgId)
    .limit(500)
  if (error) throw error

  const identityIds = (assignments ?? [])
    .map((a) => a.revenue_identity_id as string)
    .filter((id): id is string => Boolean(id))
  if (identityIds.length === 0) return []

  const { data: identityRows, error: identityError } = await client
    .from('revenue_identities')
    .select('id, identity_name, title, channel, status, profile_id, profile_url')
    .in('id', identityIds)
    .limit(500)
  if (identityError) throw identityError

  const profileIds = [
    ...new Set(
      (identityRows ?? [])
        .map((row) => row.profile_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const profiles = profileIds.length > 0 ? await store.listProfilesByIds(profileIds) : []

  const identities: AuthorizedIdentity[] = (identityRows ?? []).map((row) => ({
    assignmentId:
      (assignments ?? []).find((a) => a.revenue_identity_id === row.id)?.id as string
      ?? `assignment:${row.id as string}`,
    revenueIdentityId: row.id as string,
    identityName: row.identity_name as string,
    title: (row.title as string) ?? null,
    channel: normalizeChannel(row.channel as string),
    profileId: (row.profile_id as string) ?? null,
    personId: (row.profile_id as string) ?? null,
    profileUrl: (row.profile_url as string) ?? null,
    status: row.status === 'archived' ? 'archived' : 'active',
    access: 'assigned',
  }))

  return groupAssignedProfiles(identities, profiles)
}
