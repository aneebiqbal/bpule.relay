import type { DbClient } from '@/lib/db/types'

/**
 * Read-only reconciliation scan for legacy assignment drift.
 *
 * Classifies, it never repairs: every finding names the exact records and the
 * canonical state that should replace it. Repairs go through an explicit,
 * audited admin approval — nothing here rewrites an assignment.
 *
 * The two unambiguous classes are:
 *   eligibility_without_seat — an `identity_assignments` row with no active
 *                               profile_coverage seat (grants nothing, but
 *                               surfaces in direct-read pages)
 *   seat_without_eligibility — an active seat with no eligibility row (the
 *                               operator can execute but the assignment is
 *                               incomplete)
 */

export type ReconcileKind =
  | 'eligibility_without_seat'
  | 'seat_without_eligibility'
  | 'multiple_active_primaries'
  | 'active_plan_without_primary'
  | 'seat_on_archived_identity'
  | 'seat_on_archived_profile'
  | 'orphaned_eligibility'
  | 'orphaned_seat'

export interface ReconcileFinding {
  kind: ReconcileKind
  profileId: string | null
  identityId: string | null
  repId: string
  detail: string
  /** Canonical state proposed for this record; never applied here. */
  proposed?: {
    primaryRepId?: string | null
    removeEligibilityRepIds?: string[]
    addEligibilityRepIds?: string[]
  }
}

export interface ReconcileReport {
  scannedProfiles: number
  scannedSeats: number
  scannedEligibility: number
  findings: ReconcileFinding[]
  counts: Record<ReconcileKind, number>
}

export const RECONCILE_KINDS: ReconcileKind[] = [
  'eligibility_without_seat',
  'seat_without_eligibility',
  'multiple_active_primaries',
  'active_plan_without_primary',
  'seat_on_archived_identity',
  'seat_on_archived_profile',
  'orphaned_eligibility',
  'orphaned_seat',
]

export async function scanAssignmentDrift(client: DbClient, orgId: string): Promise<ReconcileReport> {  const [seatsRes, eligibilityRes, identityRes, profileRes, planRes, primaryHistoryRes] = await Promise.all([
    client.from('profile_coverage').select('profile_id, rep_id, role, active').eq('organization_id', orgId).limit(5000),
    client.from('identity_assignments').select('revenue_identity_id, rep_id').eq('organization_id', orgId).limit(5000),
    client.from('revenue_identities').select('id, profile_id, status').eq('organization_id', orgId).limit(5000),
    client.from('profiles').select('id, archived_at').eq('organization_id', orgId).limit(5000),
    client.from('daily_target_plans').select('revenue_identity_id').eq('organization_id', orgId).eq('active', true).limit(5000),
    // Every PRIMARY seat ever recorded, so a repair can name the last known owner.
    client.from('profile_coverage').select('profile_id, rep_id').eq('organization_id', orgId).eq('role', 'PRIMARY').limit(5000),
  ])

  const seats = (seatsRes.data ?? []) as Array<{ profile_id: string; rep_id: string; role: string; active: boolean }>
  const eligibility = (eligibilityRes.data ?? []) as Array<{ revenue_identity_id: string; rep_id: string }>
  const identities = (identityRes.data ?? []) as Array<{ id: string; profile_id: string | null; status: string }>
  const profiles = (profileRes.data ?? []) as Array<{ id: string; archived_at: string | null }>

  const identityById = new Map(identities.map((row) => [row.id, row]))
  const profileById = new Map(profiles.map((row) => [row.id, row]))
  const activeSeats = seats.filter((seat) => seat.active)
  const seatKeys = new Set(activeSeats.map((seat) => `${seat.profile_id}:${seat.rep_id}`))

  // Profile → its active identities.
  const identitiesByProfile = new Map<string, string[]>()
  for (const identity of identities) {
    if (!identity.profile_id) continue
    const list = identitiesByProfile.get(identity.profile_id) ?? []
    list.push(identity.id)
    identitiesByProfile.set(identity.profile_id, list)
  }

  const findings: ReconcileFinding[] = []
  const counts = Object.fromEntries(RECONCILE_KINDS.map((kind) => [kind, 0])) as Record<ReconcileKind, number>
  const push = (finding: ReconcileFinding) => {
    findings.push(finding)
    counts[finding.kind] += 1
  }

  // Multiple active primaries per profile.
  const primaries = new Map<string, number>()
  for (const seat of activeSeats) {
    if (seat.role !== 'PRIMARY') continue
    primaries.set(seat.profile_id, (primaries.get(seat.profile_id) ?? 0) + 1)
  }
  for (const [profileId, count] of primaries) {
    if (count > 1) {
      push({
        kind: 'multiple_active_primaries',
        profileId,
        identityId: null,
        repId: '',
        detail: `${count} active PRIMARY seats`,
      })
    }
  }

  // An active plan with no active PRIMARY. The proposal names the last known
  // owner when history has one; it is reported, never applied.
  const activePrimaryByProfile = new Map<string, string>()
  for (const [profileId, count] of primaries) {
    if (count === 1) {
      const seat = activeSeats.find((row) => row.profile_id === profileId && row.role === 'PRIMARY')
      if (seat) activePrimaryByProfile.set(profileId, seat.rep_id)
    }
  }
  const lastKnownPrimary = new Map<string, string>()
  for (const row of (primaryHistoryRes.data ?? []) as Array<{ profile_id: string; rep_id: string }>) {
    lastKnownPrimary.set(row.profile_id, row.rep_id)
  }
  const seenPlanGap = new Set<string>()
  for (const plan of (planRes.data ?? []) as Array<{ revenue_identity_id: string }>) {
    const identity = identityById.get(plan.revenue_identity_id)
    if (!identity?.profile_id) continue
    const profileId = identity.profile_id
    if (activePrimaryByProfile.has(profileId)) continue
    const dedupeKey = `${profileId}:${plan.revenue_identity_id}`
    if (seenPlanGap.has(dedupeKey)) continue
    seenPlanGap.add(dedupeKey)
    const proposed = lastKnownPrimary.get(profileId) ?? null
    push({
      kind: 'active_plan_without_primary',
      profileId,
      identityId: plan.revenue_identity_id,
      repId: proposed ?? '',
      detail: proposed
        ? 'active plan but no active PRIMARY; the last known owner is available'
        : 'active plan but no active PRIMARY and no historical owner',
      proposed: { primaryRepId: proposed },
    })
  }

  for (const seat of activeSeats) {
    const profile = seat.profile_id ? profileById.get(seat.profile_id) : undefined
    if (seat.profile_id && !profile) {
      push({ kind: 'orphaned_seat', profileId: seat.profile_id, identityId: null, repId: seat.rep_id, detail: 'seat references a missing profile' })
      continue
    }
    if (profile?.archived_at) {
      push({ kind: 'seat_on_archived_profile', profileId: seat.profile_id, identityId: null, repId: seat.rep_id, detail: 'active seat on an archived profile' })
    }
    const profileIdentities = seat.profile_id ? (identitiesByProfile.get(seat.profile_id) ?? []) : []
    const activeIdentities = profileIdentities.filter((id) => identityById.get(id)?.status === 'active')
    if (profileIdentities.length > 0 && activeIdentities.length === 0) {
      push({ kind: 'seat_on_archived_identity', profileId: seat.profile_id, identityId: null, repId: seat.rep_id, detail: 'seat has no active channel identity' })
    }
    // Seat without eligibility on at least one of the profile's identities.
    const missing = profileIdentities.filter((id) => !eligibility.some((row) => row.revenue_identity_id === id && row.rep_id === seat.rep_id))
    if (profileIdentities.length > 0 && missing.length > 0) {
      push({ kind: 'seat_without_eligibility', profileId: seat.profile_id, identityId: missing[0], repId: seat.rep_id, detail: `no eligibility row on ${missing.length} channel(s)` })
    }
  }

  for (const row of eligibility) {
    const identity = identityById.get(row.revenue_identity_id)
    if (!identity) {
      push({ kind: 'orphaned_eligibility', profileId: null, identityId: row.revenue_identity_id, repId: row.rep_id, detail: 'eligibility references a missing channel' })
      continue
    }
    if (!identity.profile_id) continue
    if (!seatKeys.has(`${identity.profile_id}:${row.rep_id}`)) {
      push({ kind: 'eligibility_without_seat', profileId: identity.profile_id, identityId: row.revenue_identity_id, repId: row.rep_id, detail: 'eligibility with no active seat' })
    }
  }

  return {
    scannedProfiles: profiles.length,
    scannedSeats: seats.length,
    scannedEligibility: eligibility.length,
    findings,
    counts,
  }
}

/** Identity of a finding, used to match an approval against a fresh scan. */
function findingKey(finding: Pick<ReconcileFinding, 'kind' | 'profileId' | 'identityId' | 'repId'>): string {
  return [finding.kind, finding.profileId ?? '', finding.identityId ?? '', finding.repId].join('|')
}

/** The only classes that are unambiguous enough to repair without a human. */
const REPAIRABLE: ReconcileKind[] = ['eligibility_without_seat', 'seat_without_eligibility']

export interface RepairResult {
  applied: string[]
  skipped: string[]
  report: ReconcileReport
}

/**
 * Apply explicitly approved findings.
 *
 * The organisation is re-scanned first and only findings that still match are
 * repaired, so an approval made against a stale scan cannot rewrite an
 * assignment that changed in the meantime.
 */
export async function repairAssignmentDrift(
  client: DbClient,
  orgId: string,
  requested: Array<Partial<ReconcileFinding>>,
  actorRepId: string,
): Promise<RepairResult> {
  const fresh = await scanAssignmentDrift(client, orgId)
  const freshByKey = new Map(fresh.findings.map((finding) => [findingKey(finding), finding]))
  const applied: string[] = []
  const skipped: string[] = []

  for (const row of requested) {
    if (!row || typeof row.kind !== 'string' || !REPAIRABLE.includes(row.kind as ReconcileKind) || !row.repId) {
      skipped.push('non-repairable')
      continue
    }
    const match = freshByKey.get(findingKey({
      kind: row.kind as ReconcileKind,
      profileId: row.profileId ?? null,
      identityId: row.identityId ?? null,
      repId: row.repId,
    }))
    if (!match) {
      skipped.push('no longer present')
      continue
    }

    if (match.kind === 'eligibility_without_seat') {
      const { error } = await client
        .from('identity_assignments')
        .delete()
        .eq('organization_id', orgId)
        .eq('revenue_identity_id', match.identityId)
        .eq('rep_id', match.repId)
      if (error) {
        skipped.push(error.message)
        continue
      }
    } else {
      const { error } = await client
        .from('identity_assignments')
        .upsert(
          {
            organization_id: orgId,
            revenue_identity_id: match.identityId,
            rep_id: match.repId,
            assigned_by: actorRepId,
          },
          { onConflict: 'revenue_identity_id,rep_id' },
        )
      if (error) {
        skipped.push(error.message)
        continue
      }
    }

    await client.from('accountability_audit_log').insert({
      organization_id: orgId,
      rep_id: actorRepId,
      revenue_identity_id: match.identityId,
      event_type: 'assignment_reconciled',
      detail: { kind: match.kind, profile_id: match.profileId, rep_id: match.repId },
    })
    applied.push(match.kind)
  }

  return { applied, skipped, report: await scanAssignmentDrift(client, orgId) }
}
