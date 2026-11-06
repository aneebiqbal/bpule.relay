import type { DbClient } from '@/lib/db/types'
import type { Profile, RevenueIdentityChannel } from '@/lib/domain/types'
import { normalizeChannel } from '@/lib/profiles/assigned-profiles'

/**
 * Temporary coverage → execution access.
 *
 * `identity_assignments` is the eligibility authority, but a rep who is
 * actively covering a profile must also be able to open that profile's
 * workspace, generate from it, and see its actionable work. This module is the
 * single read that turns an approved `coverage_assignments` row into the
 * identities and profiles the covering rep may work today.
 *
 * Expired coverage is never returned: once `effective_until` passes, the
 * covering rep loses access and the engine recommends new coverage.
 */

export interface CoveredIdentity {
  revenueIdentityId: string
  profileId: string
  channel: RevenueIdentityChannel
  coverageAssignmentId: string
  primaryRepId: string
  effectiveFrom: string
  effectiveUntil: string | null
}

/** True when the assignment is active on `businessDate` (expiry inclusive). */
export function isCoverageActiveOn(
  row: { effectiveFrom: string; effectiveUntil: string | null },
  businessDate: string,
): boolean {
  if (row.effectiveFrom > businessDate) return false
  return row.effectiveUntil == null || row.effectiveUntil >= businessDate
}

/** Active temporary coverage for one rep on one business date. */
export async function listActiveCoveredIdentities(
  client: DbClient,
  orgId: string,
  repId: string,
  businessDate: string,
): Promise<CoveredIdentity[]> {
  const { data: coverage, error } = await client
    .from('coverage_assignments')
    .select('id, profile_id, primary_rep_id, effective_from, effective_until')
    .eq('organization_id', orgId)
    .eq('covering_rep_id', repId)
    .eq('status', 'ACTIVE')
    .limit(200)
  if (error) throw error

  const active = (coverage ?? []).filter((row) =>
    isCoverageActiveOn(
      { effectiveFrom: row.effective_from as string, effectiveUntil: (row.effective_until as string | null) ?? null },
      businessDate,
    ),
  )
  if (active.length === 0) return []

  const profileIds = [...new Set(active.map((row) => row.profile_id as string))]
  const { data: identities, error: identityError } = await client
    .from('revenue_identities')
    .select('id, profile_id, channel')
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .in('profile_id', profileIds)
    .limit(500)
  if (identityError) throw identityError

  const identitiesByProfile = new Map<string, Array<{ id: string; channel: string }>>()
  for (const identity of (identities ?? []) as Array<{ id: string; profile_id: string | null; channel: string }>) {
    if (!identity.profile_id) continue
    const list = identitiesByProfile.get(identity.profile_id) ?? []
    list.push({ id: identity.id, channel: identity.channel })
    identitiesByProfile.set(identity.profile_id, list)
  }

  return active.flatMap((row) =>
    (identitiesByProfile.get(row.profile_id as string) ?? []).map((identity) => ({
      revenueIdentityId: identity.id,
      profileId: row.profile_id as string,
      channel: normalizeChannel(identity.channel),
      coverageAssignmentId: row.id as string,
      primaryRepId: row.primary_rep_id as string,
      effectiveFrom: row.effective_from as string,
      effectiveUntil: (row.effective_until as string | null) ?? null,
    })),
  )
}

/** Profiles a rep may work today: their own plus every actively covered one. */
export async function listWorkableProfiles(
  client: DbClient,
  orgId: string,
  repId: string,
  businessDate: string,
  owned: Profile[],
): Promise<Profile[]> {
  const covered = await listActiveCoveredIdentities(client, orgId, repId, businessDate)
  const coveredProfileIds = [...new Set(covered.map((row) => row.profileId))]
  if (coveredProfileIds.length === 0) return owned

  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('organization_id', orgId)
    .in('id', coveredProfileIds)
    .limit(200)
  if (error) throw error

  const byId = new Map(owned.map((profile) => [profile.id, profile]))
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = row.id as string
    if (!byId.has(id)) {
      // Reuse the store's mapper shape without importing the store (avoid a cycle).
      byId.set(id, mapProfileRow(row))
    }
  }
  return [...byId.values()]
}

/** Minimal profile mapper for rows the store did not already provide. */
function mapProfileRow(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    repId: (row.rep_id as string) ?? '',
    organizationId: (row.organization_id as string) ?? '',
    platform: (row.platform as Profile['platform']) ?? 'linkedin',
    label: (row.label as string) ?? null,
    profileUrl: (row.profile_url as string) ?? null,
    headline: (row.headline as string) ?? null,
    cvPath: (row.cv_path as string) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    fullName: (row.full_name as string) ?? null,
    displayName: (row.display_name as string) ?? null,
    currentRole: (row.current_role as string) ?? null,
    company: (row.company as string) ?? null,
    location: (row.location as string) ?? null,
    bio: (row.bio as string) ?? null,
    professionalSummary: (row.professional_summary as string) ?? null,
    seniority: (row.seniority as string) ?? null,
    yearsExperience: row.years_experience != null ? Number(row.years_experience) : null,
    primarySkills: Array.isArray(row.primary_skills) ? (row.primary_skills as string[]) : [],
    secondarySkills: Array.isArray(row.secondary_skills) ? (row.secondary_skills as string[]) : [],
    technologies: Array.isArray(row.technologies) ? (row.technologies as string[]) : [],
    industries: Array.isArray(row.industries) ? (row.industries as string[]) : [],
    serviceCapabilities: Array.isArray(row.service_capabilities) ? (row.service_capabilities as string[]) : [],
    specialties: Array.isArray(row.specialties) ? (row.specialties as string[]) : [],
    positioning: (row.positioning as string) ?? null,
    differentiators: Array.isArray(row.differentiators) ? (row.differentiators as string[]) : [],
    languages: Array.isArray(row.languages) ? (row.languages as string[]) : [],
    profileConfidence: row.profile_confidence != null ? Number(row.profile_confidence) : null,
    readiness: (row.readiness as string) ?? 'incomplete',
    archivedAt: (row.archived_at as string) ?? null,
  }
}
