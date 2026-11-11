import type { DbClient } from '@/lib/db/types'
import type { Profile, RevenueIdentityChannel } from '@/lib/domain/types'
import { normalizeChannel } from '@/lib/profiles/channel'

/**
 * Temporary coverage → execution access.
 *
 * `identity_assignments` is the eligibility authority. A rep who is actively
 * covering a profile must also be able to open that profile's workspace,
 * generate from it, and see its actionable work.
 *
 * This module is the SINGLE read that decides who may execute which identity
 * today. Every sender selector, target view, Inbox queue, Leads queue, Daily
 * Actions surface and Rep Home must read `listExecutableIdentitiesForRep` —
 * never `identity_assignments`, never `profiles.rep_id`.
 *
 * Expired or revoked coverage is never returned.
 */

/** How a temporary coverage executes. Distinct from the org policy enum. */
export type CoverageExecutionMode = 'SHARED' | 'REPLACE'

export const COVERAGE_EXECUTION_MODES: readonly CoverageExecutionMode[] = ['SHARED', 'REPLACE']

export function isCoverageExecutionMode(value: unknown): value is CoverageExecutionMode {
  return value === 'SHARED' || value === 'REPLACE'
}

export interface CoveredIdentity {
  revenueIdentityId: string
  profileId: string
  channel: RevenueIdentityChannel
  coverageAssignmentId: string
  primaryRepId: string
  effectiveFrom: string
  effectiveUntil: string | null
  mode: CoverageExecutionMode | null
}

/** A temporary coverage row, as the execution authority sees it. */
export interface CoverageAssignmentRow {
  id: string
  profile_id: string
  primary_rep_id: string
  covering_rep_id: string
  effective_from: string
  effective_until: string | null
  status: string
  revoked_at: string | null
  coverage_mode: string | null
  created_at: string
}

const COVERAGE_COLUMNS =
  'id, profile_id, primary_rep_id, covering_rep_id, effective_from, effective_until, status, revoked_at, coverage_mode, created_at'

/**
 * The ONE coverage window rule. No consumer carries its own expiry logic.
 * `status` / `revokedAt` are optional so older callers that only pass the
 * window still work.
 */
export function isCoverageActiveOn(
  row: {
    effectiveFrom: string
    effectiveUntil: string | null
    status?: string | null
    revokedAt?: string | null
  },
  businessDate: string,
): boolean {
  if (row.status != null && row.status !== 'ACTIVE') return false
  if (row.revokedAt) return false
  if (row.effectiveFrom > businessDate) return false
  return row.effectiveUntil == null || row.effectiveUntil >= businessDate
}

/**
 * Every ACTIVE, in-window coverage row for a set of profiles — including rows
 * where the rep is the PRIMARY being replaced. Needed so REPLACE can exclude
 * the primary.
 */
export async function listActiveCoverageForProfiles(
  client: DbClient,
  orgId: string,
  profileIds: string[],
  businessDate: string,
): Promise<CoverageAssignmentRow[]> {
  if (profileIds.length === 0) return []
  const { data, error } = await client
    .from('coverage_assignments')
    .select(COVERAGE_COLUMNS)
    .eq('organization_id', orgId)
    .eq('status', 'ACTIVE')
    .in('profile_id', profileIds)
    .limit(500)
  if (error) throw error
  return ((data ?? []) as CoverageAssignmentRow[]).filter((row) =>
    isCoverageActiveOn(
      {
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until,
        status: row.status,
        revokedAt: row.revoked_at,
      },
      businessDate,
    ),
  )
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
    .select(COVERAGE_COLUMNS)
    .eq('organization_id', orgId)
    .eq('covering_rep_id', repId)
    .limit(200)
  if (error) throw error

  const active = ((coverage ?? []) as CoverageAssignmentRow[]).filter((row) =>
    isCoverageActiveOn(
      {
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until,
        status: row.status,
        revokedAt: row.revoked_at,
      },
      businessDate,
    ),
  )
  if (active.length === 0) return []

  const profileIds = [...new Set(active.map((row) => row.profile_id))]
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
    (identitiesByProfile.get(row.profile_id) ?? []).map((identity) => ({
      revenueIdentityId: identity.id,
      profileId: row.profile_id,
      channel: normalizeChannel(identity.channel),
      coverageAssignmentId: row.id,
      primaryRepId: row.primary_rep_id,
      effectiveFrom: row.effective_from,
      effectiveUntil: row.effective_until,
      mode: isCoverageExecutionMode(row.coverage_mode) ? row.coverage_mode : null,
    })),
  )
}

export interface ExecutableIdentityScope {
  executableIdentities: Array<{ id: string; profileId?: string | null }>
  coveredIdentityIds: string[]
}

/** One executable responsibility: an active channel identity and why it is executable. */
export interface ExecutableIdentity {
  id: string
  profileId: string | null
  assignmentId: string | null
  assignedBy: string | null
  assignedAt: string | null
  /**
   * `primary` owns the profile of record, `operator` is an active contributor
   * who shares the same channel plan, `coverage` is temporary cover. Backups
   * never appear here.
   */
  access: 'primary' | 'operator' | 'coverage'
  coverageMode: CoverageExecutionMode | null
  coverageAssignmentId: string | null
  coveragePrimaryRepId: string | null
  coverageEffectiveUntil: string | null
}

/**
 * THE canonical execution scope for any rep.
 *
 *   EXECUTABLE(rep, identity, now) =
 *       PRIMARY ownership of the identity's profile
 *       UNLESS that profile has an active REPLACE coverage
 *       OR   the rep is an active OPERATOR on that profile
 *       OR   the rep is an active covering operator (SHARED or REPLACE)
 *
 * Backups never execute. Archived identities never execute. Expired or revoked
 * coverage never executes. Ownership is never rewritten by coverage, and an
 * operator seat never moves ownership.
 */
export async function listExecutableIdentitiesForRep(
  client: DbClient,
  orgId: string,
  repId: string,
  businessDate: string,
): Promise<ExecutableIdentity[]> {
  const [{ data: assignments, error }, { data: ownershipRows, error: ownershipError }, covered] =
    await Promise.all([
      client
        .from('identity_assignments')
        .select('id, revenue_identity_id, assigned_by, created_at')
        .eq('organization_id', orgId)
        .eq('rep_id', repId)
        .limit(500),
      client
        .from('profile_coverage')
        .select('profile_id, role')
        .eq('organization_id', orgId)
        .eq('rep_id', repId)
        .in('role', ['PRIMARY', 'OPERATOR'])
        .eq('active', true)
        .limit(200),
      listActiveCoveredIdentities(client, orgId, repId, businessDate),
    ])
  if (error) throw error
  if (ownershipError) throw ownershipError

  const primaryProfileIds = new Set<string>()
  const operatorProfileIds = new Set<string>()
  for (const row of (ownershipRows ?? []) as Array<{ profile_id: string; role: string }>) {
    if (row.role === 'OPERATOR') operatorProfileIds.add(row.profile_id)
    else primaryProfileIds.add(row.profile_id)
  }
  const coveredProfileIds = [...new Set(covered.map((row) => row.profileId))]

  // Load every active coverage row touching the rep's own profiles, so a
  // REPLACE coverage taken by someone else can exclude the primary.
  const activeForProfiles = await listActiveCoverageForProfiles(
    client,
    orgId,
    [...new Set([...primaryProfileIds, ...operatorProfileIds, ...coveredProfileIds])],
    businessDate,
  )

  // REPLACE wins defensively if a conflict ever reaches the read path. It
  // excludes the PRIMARY only — an OPERATOR is an ongoing contributor, not the
  // owner being replaced, so their seat survives.
  const replacedProfileIds = new Set<string>()
  for (const row of activeForProfiles) {
    if (row.coverage_mode === 'REPLACE') replacedProfileIds.add(row.profile_id)
  }

  const coveredById = new Map(covered.map((row) => [row.revenueIdentityId, row]))
  const assignmentByIdentity = new Map(
    (assignments ?? []).map((row) => [row.revenue_identity_id as string, row]),
  )

  const ids = [
    ...new Set([
      ...(assignments ?? []).map((row) => row.revenue_identity_id as string).filter(Boolean),
      ...covered.map((row) => row.revenueIdentityId),
    ]),
  ]
  if (ids.length === 0) return []

  const { data: identityRows, error: identityError } = await client
    .from('revenue_identities')
    .select('id, profile_id, status')
    .eq('organization_id', orgId)
    .in('id', ids)
    .limit(500)
  if (identityError) throw identityError

  const out: ExecutableIdentity[] = []
  const seen = new Set<string>()
  for (const row of (identityRows ?? []) as Array<{ id: string; profile_id: string | null; status: string }>) {
    if (row.status !== 'active') continue
    const isCovered = coveredById.has(row.id)
    const isPrimary = Boolean(
      row.profile_id && primaryProfileIds.has(row.profile_id) && !replacedProfileIds.has(row.profile_id),
    )
    const isOperator = Boolean(row.profile_id && operatorProfileIds.has(row.profile_id))
    if (!isCovered && !isPrimary && !isOperator) continue
    if (seen.has(row.id)) continue
    seen.add(row.id)
    const assignment = assignmentByIdentity.get(row.id)
    const coverage = coveredById.get(row.id)
    out.push({
      id: row.id,
      profileId: row.profile_id ?? null,
      assignmentId: assignment?.id ?? coverage?.coverageAssignmentId ?? null,
      assignedBy: (assignment?.assigned_by as string | null | undefined) ?? null,
      assignedAt: (assignment?.created_at as string | null | undefined) ?? coverage?.effectiveFrom ?? null,
      access: isCovered ? 'coverage' : isOperator ? 'operator' : 'primary',
      coverageMode: coverage?.mode ?? null,
      coverageAssignmentId: coverage?.coverageAssignmentId ?? null,
      coveragePrimaryRepId: coverage?.primaryRepId ?? null,
      coverageEffectiveUntil: coverage?.effectiveUntil ?? null,
    })
  }
  return out
}

/**
 * Thin scope view over `listExecutableIdentitiesForRep`, for callers that only
 * need the identity ids (Inbox queue, Manager/Admin team views).
 */
export async function listExecutableIdentityScope(
  client: DbClient,
  orgId: string,
  repId: string,
  businessDate: string,
): Promise<ExecutableIdentityScope> {
  const rows = await listExecutableIdentitiesForRep(client, orgId, repId, businessDate)
  return {
    executableIdentities: rows.map((row) => ({ id: row.id, profileId: row.profileId })),
    coveredIdentityIds: rows.filter((row) => row.access === 'coverage').map((row) => row.id),
  }
}

/** Profiles a rep may work today, derived from the canonical executable scope. */
export async function listWorkableProfiles(
  client: DbClient,
  orgId: string,
  repId: string,
  businessDate: string,
  owned: Profile[],
): Promise<Profile[]> {
  const executable = await listExecutableIdentitiesForRep(client, orgId, repId, businessDate)
  const profileIds = [
    ...new Set(executable.map((row) => row.profileId).filter((id): id is string => Boolean(id))),
  ]
  if (profileIds.length === 0) return []

  const byId = new Map(owned.map((profile) => [profile.id, profile]))
  const missing = profileIds.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('organization_id', orgId)
      .in('id', missing)
      .limit(200)
    if (error) throw error
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      byId.set(row.id as string, mapProfileRow(row))
    }
  }
  return profileIds.map((id) => byId.get(id)).filter((profile): profile is Profile => Boolean(profile))
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
