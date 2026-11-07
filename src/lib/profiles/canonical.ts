import { createServerSupabase } from '@/lib/supabase/server'
import type { DbClient } from '@/lib/db/types'
import type { RevenueIdentityChannel } from '@/lib/domain/types'
import { normalizeChannel } from '@/lib/profiles/assigned-profiles'
import { normalizeExternalUrl, profileNeedsReview } from '@/lib/profiles/display'

export { normalizeExternalUrl, profileNeedsReview } from '@/lib/profiles/display'

/**
 * THE canonical profile-assignment read model.
 *
 * One authority for "who may work which profile, and who owns it". Every
 * surface — Admin Profile Management, Team → Profiles, Rep Home, the profile
 * switcher, the coverage engine, the LinkedIn selector, the Upwork selector,
 * the Admin dashboard and Rep 360 — must read this module. When Admin says a
 * profile is assigned to a rep, every surface agrees.
 *
 * Eligibility is still `identity_assignments` grouped by
 * `revenue_identities.profile_id`; channel capability is still
 * `revenue_identities.channel`. This module adds the missing ownership layer:
 * primary and backups, derived deterministically when the explicit
 * `profile_coverage` table predates the data or is empty.
 *
 * Primary derivation is never a guess. The order is:
 *   1. an active `profile_coverage` PRIMARY row (explicit)
 *   2. the legacy `profile_assignments` owner (earliest row wins)
 *   3. `profiles.rep_id`, when that rep is actually assigned
 *   4. the single assigned rep
 *   5. otherwise AMBIGUOUS — surfaced for Admin review, never picked at random
 */

export type PrimarySource =
  | 'coverage'
  | 'legacy_assignment'
  | 'profile_owner'
  | 'single_assignment'
  | 'ambiguous'

export type BackupSource = 'coverage' | 'derived'

export interface CanonicalAssignedRep {
  repId: string
  repName: string
  channels: RevenueIdentityChannel[]
  /** Earliest `identity_assignments.created_at` for this rep on this profile. */
  assignedAt: string | null
}

export interface CanonicalBackup {
  repId: string
  repName: string
  priority: number
  source: BackupSource
}

export type CoverageState = 'EXPLICIT' | 'DERIVED' | 'AMBIGUOUS' | 'UNASSIGNED'

export interface CanonicalProfileAssignment {
  profileId: string
  profileName: string
  channels: RevenueIdentityChannel[]
  identityIds: string[]
  assignedReps: CanonicalAssignedRep[]
  primaryRepId: string | null
  primaryRepName: string | null
  primarySource: PrimarySource
  /** Why the primary is who it is — surfaced to Admin. */
  primaryReason: string
  backups: CanonicalBackup[]
  coverageState: CoverageState
  needsReview: boolean
  reviewReasons: string[]
}

export interface CanonicalAssignmentSet {
  businessDate: string
  profiles: CanonicalProfileAssignment[]
  /** Profiles whose primary could not be derived without a human decision. */
  ambiguous: CanonicalProfileAssignment[]
  /** Profiles with no assignment at all. */
  unassigned: CanonicalProfileAssignment[]
}

/** Deterministic primary derivation. Pure — safe to unit test. */
export function derivePrimary(input: {
  profileId: string
  profileName: string
  assignedReps: CanonicalAssignedRep[]
  coveragePrimaryRepId: string | null
  legacyOwnerRepId: string | null
  legacyAssignmentTimes: Array<{ repId: string; createdAt: string | null }>
  profileOwnerRepId: string | null
}): { repId: string | null; source: PrimarySource; reason: string } {
  if (input.coveragePrimaryRepId) {
    return { repId: input.coveragePrimaryRepId, source: 'coverage', reason: 'Explicit primary coverage' }
  }

  // Legacy profile_assignments: the earliest row is the owner of record.
  if (input.legacyOwnerRepId) {
    const times = input.legacyAssignmentTimes
      .filter((row) => row.repId === input.legacyOwnerRepId)
      .map((row) => row.createdAt)
      .filter((value): value is string => Boolean(value))
      .sort()
    const assigned = input.assignedReps.find((rep) => rep.repId === input.legacyOwnerRepId)
    if (assigned) {
      return {
        repId: input.legacyOwnerRepId,
        source: 'legacy_assignment',
        reason: `Legacy assignment${times[0] ? ` from ${times[0].slice(0, 10)}` : ''}`,
      }
    }
  }

  if (input.profileOwnerRepId && input.assignedReps.some((rep) => rep.repId === input.profileOwnerRepId)) {
    return {
      repId: input.profileOwnerRepId,
      source: 'profile_owner',
      reason: 'Profile owner is assigned to this profile',
    }
  }

  if (input.assignedReps.length === 1) {
    return {
      repId: input.assignedReps[0].repId,
      source: 'single_assignment',
      reason: 'Only one rep is assigned',
    }
  }

  return {
    repId: null,
    source: 'ambiguous',
    reason: input.assignedReps.length === 0
      ? 'No rep is assigned to this profile'
      : `${input.assignedReps.length} reps are assigned and no owner of record exists`,
  }
}

interface Facts {
  profiles: Array<{
    id: string
    name: string
    platform: string
    ownerRepId: string | null
    profileUrl: string | null
  }>
  identities: Array<{ id: string; profileId: string | null; channel: RevenueIdentityChannel }>
  assignments: Array<{ repId: string; identityId: string; createdAt: string | null }>
  coverage: Array<{ profileId: string; repId: string; role: 'PRIMARY' | 'BACKUP'; priority: number }>
  legacy: Array<{ profileId: string; repId: string; createdAt: string | null }>
  reps: Map<string, string>
}

async function loadFacts(client: DbClient, orgId: string): Promise<Facts> {
  const [profilesRes, identitiesRes, assignmentsRes, coverageRes, legacyRes, repsRes] = await Promise.all([
    client.from('profiles').select('id, display_name, full_name, label, platform, rep_id, profile_url').eq('organization_id', orgId).limit(5000),
    client.from('revenue_identities').select('id, profile_id, channel').eq('organization_id', orgId).eq('status', 'active').limit(5000),
    client.from('identity_assignments').select('rep_id, revenue_identity_id, created_at').eq('organization_id', orgId).limit(5000),
    client.from('profile_coverage').select('profile_id, rep_id, role, priority').eq('organization_id', orgId).eq('active', true).limit(5000),
    client.from('profile_assignments').select('profile_id, rep_id, created_at').limit(5000),
    client.from('reps').select('id, name').eq('organization_id', orgId).limit(2000),
  ])

  if (profilesRes.error) throw profilesRes.error
  if (identitiesRes.error) throw identitiesRes.error
  if (assignmentsRes.error) throw assignmentsRes.error

  const profiles = (profilesRes.data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.display_name as string) ?? (row.full_name as string) ?? (row.label as string) ?? '',
    platform: (row.platform as string) ?? 'other',
    ownerRepId: (row.rep_id as string | null) ?? null,
    profileUrl: (row.profile_url as string | null) ?? null,
  }))

  const identities = (identitiesRes.data ?? []).map((row) => ({
    id: row.id as string,
    profileId: (row.profile_id as string | null) ?? null,
    channel: normalizeChannel(row.channel as string),
  }))

  const assignments = (assignmentsRes.data ?? []).map((row) => ({
    repId: row.rep_id as string,
    identityId: row.revenue_identity_id as string,
    createdAt: (row.created_at as string | null) ?? null,
  }))

  const coverage = (coverageRes.data ?? []).map((row) => ({
    profileId: row.profile_id as string,
    repId: row.rep_id as string,
    role: row.role as 'PRIMARY' | 'BACKUP',
    priority: (row.priority as number) ?? 1,
  }))

  // profile_assignments has no organization_id; scope through profiles.
  const orgProfileIds = new Set(profiles.map((profile) => profile.id))
  const legacy = (legacyRes.data ?? [])
    .filter((row) => orgProfileIds.has(row.profile_id as string))
    .map((row) => ({
      profileId: row.profile_id as string,
      repId: row.rep_id as string,
      createdAt: (row.created_at as string | null) ?? null,
    }))

  const reps = new Map((repsRes.data ?? []).map((row) => [row.id as string, (row.name as string) ?? 'Unknown']))

  return { profiles, identities, assignments, coverage, legacy, reps }
}

/**
 * Build the canonical assignment set for an organization. One row per
 * `profiles` row that has at least one active identity (assigned or not).
 */
export async function loadCanonicalProfileAssignments(
  orgId: string,
  options: { client?: DbClient } = {},
): Promise<CanonicalAssignmentSet> {
  const client = options.client ?? (await createServerSupabase())
  const facts = await loadFacts(client, orgId)

  const identitiesByProfile = new Map<string, typeof facts.identities>()
  for (const identity of facts.identities) {
    if (!identity.profileId) continue
    const list = identitiesByProfile.get(identity.profileId) ?? []
    list.push(identity)
    identitiesByProfile.set(identity.profileId, list)
  }

  const assignmentByProfile = new Map<string, CanonicalAssignedRep[]>()
  for (const identity of facts.identities) {
    if (!identity.profileId) continue
    for (const assignment of facts.assignments) {
      if (assignment.identityId !== identity.id) continue
      const list = assignmentByProfile.get(identity.profileId) ?? []
      let entry = list.find((rep) => rep.repId === assignment.repId)
      if (!entry) {
        entry = {
          repId: assignment.repId,
          repName: facts.reps.get(assignment.repId) ?? 'Unknown',
          channels: [],
          assignedAt: assignment.createdAt,
        }
        list.push(entry)
      }
      if (!entry.channels.includes(identity.channel)) entry.channels.push(identity.channel)
      if (assignment.createdAt && (!entry.assignedAt || assignment.createdAt < entry.assignedAt)) {
        entry.assignedAt = assignment.createdAt
      }
      assignmentByProfile.set(identity.profileId, list)
    }
  }

  const profiles: CanonicalProfileAssignment[] = []

  for (const profile of facts.profiles) {
    const identities = identitiesByProfile.get(profile.id) ?? []
    if (identities.length === 0) continue

    const assignedReps = (assignmentByProfile.get(profile.id) ?? [])
      .slice()
      .sort((a, b) => (a.assignedAt ?? '').localeCompare(b.assignedAt ?? '') || a.repName.localeCompare(b.repName))

    const coveragePrimary = facts.coverage.find(
      (row) => row.profileId === profile.id && row.role === 'PRIMARY',
    ) ?? null
    const coverageBackups = facts.coverage
      .filter((row) => row.profileId === profile.id && row.role === 'BACKUP')
      .sort((a, b) => a.priority - b.priority)

    const legacyRows = facts.legacy
      .filter((row) => row.profileId === profile.id)
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
    const legacyOwnerRepId = legacyRows[0]?.repId ?? null

    const primary = derivePrimary({
      profileId: profile.id,
      profileName: profile.name,
      assignedReps,
      coveragePrimaryRepId: coveragePrimary?.repId ?? null,
      legacyOwnerRepId,
      legacyAssignmentTimes: legacyRows.map((row) => ({ repId: row.repId, createdAt: row.createdAt })),
      profileOwnerRepId: profile.ownerRepId,
    })

    const explicitBackups: CanonicalBackup[] = coverageBackups.map((row) => ({
      repId: row.repId,
      repName: facts.reps.get(row.repId) ?? 'Unknown',
      priority: row.priority,
      source: 'coverage',
    }))

    const primaryRepId = primary.repId
    const derivedBackups: CanonicalBackup[] = primaryRepId
      ? assignedReps
          .filter((rep) => rep.repId !== primaryRepId)
          .map((rep, index) => ({
            repId: rep.repId,
            repName: rep.repName,
            priority: index + 2,
            source: 'derived' as const,
          }))
      : []

    const backups = explicitBackups.length > 0 ? explicitBackups : derivedBackups

    const reviewReasons: string[] = []
    if (profileNeedsReview(profile.name)) reviewReasons.push('Profile has no display name')
    if (assignedReps.length === 0) reviewReasons.push('No rep is assigned')
    if (primary.source === 'ambiguous') reviewReasons.push(primary.reason)
    if (normalizeExternalUrl(profile.profileUrl) === null) reviewReasons.push('No profile URL')

    profiles.push({
      profileId: profile.id,
      profileName: profile.name || 'Unnamed profile',
      channels: [...new Set(identities.map((identity) => identity.channel))].sort(),
      identityIds: identities.map((identity) => identity.id),
      assignedReps,
      primaryRepId,
      primaryRepName: primaryRepId ? facts.reps.get(primaryRepId) ?? 'Unknown' : null,
      primarySource: primary.source,
      primaryReason: primary.reason,
      backups,
      coverageState: assignedReps.length === 0
        ? 'UNASSIGNED'
        : primary.source === 'ambiguous'
          ? 'AMBIGUOUS'
          : primary.source === 'coverage'
            ? 'EXPLICIT'
            : 'DERIVED',
      needsReview: reviewReasons.length > 0,
      reviewReasons,
    })
  }

  profiles.sort((a, b) => a.profileName.localeCompare(b.profileName))

  return {
    businessDate: new Date().toISOString().slice(0, 10),
    ambiguous: profiles.filter((profile) => profile.coverageState === 'AMBIGUOUS'),
    unassigned: profiles.filter((profile) => profile.coverageState === 'UNASSIGNED'),
    profiles,
  }
}

/** Profiles where this rep is the canonical primary owner. */
export function getPrimaryProfilesForRep(
  set: CanonicalAssignmentSet,
  repId: string,
): CanonicalProfileAssignment[] {
  return set.profiles.filter((profile) => profile.primaryRepId === repId)
}

/** Profiles where this rep is a configured backup — eligibility, never ownership. */
export function getBackupEligibleProfilesForRep(
  set: CanonicalAssignmentSet,
  repId: string,
): CanonicalProfileAssignment[] {
  return set.profiles.filter((profile) => profile.backups.some((backup) => backup.repId === repId))
}

/**
 * Profiles a rep may work today: their primary plus active temporary coverage.
 * Backup eligibility alone never grants a daily working profile.
 */
export function getExecutableProfilesForRep(
  set: CanonicalAssignmentSet,
  repId: string,
  activeCoverageProfileIds: ReadonlySet<string> = new Set(),
): CanonicalProfileAssignment[] {
  return set.profiles.filter(
    (profile) => profile.primaryRepId === repId || activeCoverageProfileIds.has(profile.profileId),
  )
}

/**
 * Profiles a rep may work: their primary plus active temporary coverage.
 * Backup eligibility is not ownership and never appears here.
 */
export function getProfilesForRep(
  set: CanonicalAssignmentSet,
  repId: string,
): CanonicalProfileAssignment[] {
  return getPrimaryProfilesForRep(set, repId)
}

/** Profiles a rep may work on a specific channel. */
export function getProfilesForRepByChannel(
  set: CanonicalAssignmentSet,
  repId: string,
  channel: RevenueIdentityChannel,
): CanonicalProfileAssignment[] {
  return getProfilesForRep(set, repId).filter((profile) => profile.channels.includes(channel))
}

export interface BackfillProposal {
  profileId: string
  profileName: string
  primaryRepId: string
  primaryRepName: string
  primaryReason: string
  backups: CanonicalBackup[]
  assignedRepIds: string[]
}

export interface BackfillReport {
  businessDate: string
  proposals: BackfillProposal[]
  ambiguous: Array<{ profileId: string; profileName: string; assignedRepIds: string[]; reason: string }>
  unassigned: Array<{ profileId: string; profileName: string }>
  applied: number
}

/**
 * Deterministic backfill of `profile_coverage` from existing assignment truth.
 *
 * Only profiles with an unambiguous primary are proposed. Ambiguous profiles
 * are returned for Admin review and never written.
 */
export async function backfillProfileCoverage(
  orgId: string,
  options: { dryRun?: boolean; client?: DbClient } = {},
): Promise<BackfillReport> {
  const client = options.client ?? (await createServerSupabase())
  const set = await loadCanonicalProfileAssignments(orgId, { client })

  const proposals: BackfillProposal[] = []
  const ambiguous: BackfillReport['ambiguous'] = []
  const unassigned: BackfillReport['unassigned'] = []

  for (const profile of set.profiles) {
    if (profile.coverageState === 'UNASSIGNED') {
      unassigned.push({ profileId: profile.profileId, profileName: profile.profileName })
      continue
    }
    if (profile.primarySource === 'ambiguous') {
      ambiguous.push({
        profileId: profile.profileId,
        profileName: profile.profileName,
        assignedRepIds: profile.assignedReps.map((rep) => rep.repId),
        reason: profile.reviewReasons.find((reason) => reason.includes('reps are assigned')) ?? 'Ambiguous ownership',
      })
      continue
    }
    if (profile.primarySource === 'coverage') continue

    proposals.push({
      profileId: profile.profileId,
      profileName: profile.profileName,
      primaryRepId: profile.primaryRepId!,
      primaryRepName: profile.primaryRepName ?? 'Unknown',
      primaryReason: profile.primaryReason,
      backups: profile.backups,
      assignedRepIds: profile.assignedReps.map((rep) => rep.repId),
    })
  }

  if (options.dryRun || proposals.length === 0) {
    return { businessDate: set.businessDate, proposals, ambiguous, unassigned, applied: 0 }
  }

  let applied = 0
  for (const proposal of proposals) {
    const now = new Date().toISOString()
    const { error: deactivateError } = await client
      .from('profile_coverage')
      .update({ active: false, updated_at: now })
      .eq('organization_id', orgId)
      .eq('profile_id', proposal.profileId)
    if (deactivateError) continue

    const rows = [
      { role: 'PRIMARY' as const, repId: proposal.primaryRepId, priority: 1 },
      ...proposal.backups.map((backup, index) => ({
        role: 'BACKUP' as const,
        repId: backup.repId,
        priority: index + 2,
      })),
    ]

    const { error: insertError } = await client.from('profile_coverage').insert(
      rows.map((row) => ({
        organization_id: orgId,
        profile_id: proposal.profileId,
        rep_id: row.repId,
        role: row.role,
        priority: row.priority,
        active: true,
      })),
    )
    if (insertError) continue

    await client.from('coverage_events').insert({
      organization_id: orgId,
      profile_id: proposal.profileId,
      event_type: 'BACKUP_CONFIGURED',
      primary_rep_id: proposal.primaryRepId,
      reason: `Backfilled from existing assignments: ${proposal.primaryReason}`,
      actor_rep_id: proposal.primaryRepId,
    })
    applied += 1
  }

  return { businessDate: set.businessDate, proposals, ambiguous, unassigned, applied }
}
