/**
 * V6 live coverage acceptance — SHARED / REPLACE / RESTORE against the real
 * database, through the canonical execution authority.
 *
 * Drives the same server functions the API uses (approveCoveragePlan,
 * restorePrimaryCoverage) as the runtime `relay_app` client, then asserts the
 * canonical scope. The fixture is disposable: a cover for one profile, switched
 * to REPLACE, then restored. The service client removes the fixture rows so the
 * suite leaves nothing behind.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeNeonPool, neonDbClient, neonServiceDbClient } from '@/lib/db/neon'
import { approveCoveragePlan, restorePrimaryCoverage, configureCoverage } from '@/lib/coverage/actions'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import {
  acknowledgeResponsibility,
  listAcknowledgementsForRep,
  reportAccessIssue,
} from '@/lib/responsibility/load'

const ORG = '11111111-1111-1111-1111-111111111111'
// Aneeb · LinkedIn. This profile is used because its PRIMARY is the same rep
// the assertions below name, and Hassan/Madiha both hold eligibility on it.
// (The fixture previously used Zaira · Upwork, whose live PRIMARY changed, so
// the suite was red on production data it no longer described.)
const PROFILE = '87c10cd5-58e3-4742-910d-4de549d522c7' // Aneeb · LinkedIn
const IDENTITY = 'e57519a5-bc62-4bfe-b29d-2be809e8d9af' // Aneeb · LinkedIn
const PRIMARY = 'aaaaaaaa-0000-0000-0000-000000000004' // Ahmad
const COVERING = 'aaaaaaaa-0000-0000-0000-000000000003' // Madiha
const BACKUP = 'aaaaaaaa-0000-0000-0000-000000000002' // Hassan
const ACTOR = 'aaaaaaaa-0000-0000-0000-000000000001' // Aneeb (admin)
const AUTH_USER = '4803f9c8-48ef-4f9f-9ef3-c0a59c6414c6' // Aneeb

const TODAY = new Date().toISOString().slice(0, 10)

/** One client for the whole suite: the pooler drops connections under churn. */
let client: ReturnType<typeof neonDbClient>
let admin: ReturnType<typeof neonServiceDbClient>
beforeAll(() => {
  client = neonDbClient(AUTH_USER)
  admin = neonServiceDbClient()
})

function scope(client: ReturnType<typeof neonDbClient>, repId: string) {
  return listExecutableIdentitiesForRep(client, ORG, repId, TODAY)
}

function ids(rows: Array<{ id: string }>) {
  return rows.map((row) => row.id)
}

async function cover(client: ReturnType<typeof neonDbClient>, mode: 'SHARED' | 'REPLACE') {
  return approveCoveragePlan({
    organizationId: ORG,
    items: [
      {
        profileId: PROFILE,
        primaryRepId: PRIMARY,
        coveringRepId: COVERING,
        kind: 'COVER',
        reason: 'V6 live acceptance (disposable fixture)',
        businessDate: TODAY,
        mode,
      },
    ],
    actorRepId: ACTOR,
    actorName: 'bpulse',
    client,
  })
}

async function restore(client: ReturnType<typeof neonDbClient>) {
  return restorePrimaryCoverage({
    organizationId: ORG,
    profileId: PROFILE,
    actorRepId: ACTOR,
    actorName: 'bpulse',
    reason: 'V6 live acceptance cleanup',
    businessDate: TODAY,
    client,
  })
}

/** Remove every coverage row the fixture created. relay_app cannot delete coverage. */
async function cleanupFixture() {
  // End any coverage an interrupted run left active, so a mode conflict from a
  // previous test can never cascade into the next one.
  await admin
    .from('coverage_assignments')
    .update({ status: 'COMPLETED', effective_until: TODAY, updated_at: new Date().toISOString() })
    .eq('organization_id', ORG)
    .eq('profile_id', PROFILE)
    .eq('status', 'ACTIVE')
  // `ca_one_active_profile_idx` allows a single ACTIVE row per profile, so an
  // interrupted run must not leave one behind to block the next activation.
  await admin
    .from('coverage_assignments')
    .delete()
    .eq('organization_id', ORG)
    .eq('profile_id', PROFILE)
    .eq('status', 'ACTIVE')
  const { data } = await admin
    .from('coverage_assignments')
    .select('id')
    .eq('organization_id', ORG)
    .eq('profile_id', PROFILE)
    .eq('primary_rep_id', PRIMARY)
    .eq('covering_rep_id', COVERING)
  const ids = (data ?? []).map((row) => row.id as string)
  if (ids.length > 0) {
    await admin.from('coverage_events').delete().in('assignment_id', ids)
    await admin.from('responsibility_acknowledgements').delete().in('coverage_assignment_id', ids)
    await admin.from('coverage_assignments').delete().in('id', ids)
  }
  await admin.from('notifications').delete().like('dedupe_key', `%${PROFILE}%`)
}

/**
 * The fixture needs a known owner on Zaira · Upwork. Production ownership moves
 * as Admin works, so the suite takes the seat over and puts the original back.
 */
let originalPrimary: {
  id: string
  rep_id: string
  role: string
  priority: number
  created_by: string | null
} | null = null
let originalReadiness: Array<{ rep_id: string }> = []
let captured = false

beforeAll(() => {
  client = neonDbClient(AUTH_USER)
  admin = neonServiceDbClient()
})

beforeEach(async () => {
  // Capture production ownership and readiness once, BEFORE the fixture mutates
  // anything, so the suite can put them back exactly at the end.
  if (!captured) {
    captured = true
    const { data: current } = await admin
      .from('profile_coverage')
      .select('id, rep_id, role, priority, created_by')
      .eq('organization_id', ORG)
      .eq('profile_id', PROFILE)
      .eq('role', 'PRIMARY')
      .eq('active', true)
      .maybeSingle()
    originalPrimary = (current as typeof originalPrimary) ?? null
    const { data: readiness } = await admin
      .from('profile_readiness')
      .select('rep_id')
      .eq('organization_id', ORG)
      .eq('profile_id', PROFILE)
      .in('rep_id', [PRIMARY, COVERING, BACKUP])
    originalReadiness = (readiness as Array<{ rep_id: string }>) ?? []
  }

  await cleanupFixture()

  // Readiness is a per-device confirmation: cleared per run so the
  // acknowledgement assertion is about this run, restored once at the end.
  await admin
    .from('profile_readiness')
    .delete()
    .eq('organization_id', ORG)
    .eq('profile_id', PROFILE)
    .in('rep_id', [PRIMARY, COVERING, BACKUP])

  await configureCoverage({
    organizationId: ORG,
    profileId: PROFILE,
    primaryRepId: PRIMARY,
    operators: [],
    backups: [{ repId: BACKUP, priority: 1 }],
    actorRepId: ACTOR,
    client: admin,
  })
  // The covering rep must hold eligibility; the fixture never removes it.
  await admin
    .from('identity_assignments')
    .upsert(
      {
        organization_id: ORG,
        revenue_identity_id: IDENTITY,
        rep_id: COVERING,
        assigned_by: ACTOR,
      },
      { onConflict: 'revenue_identity_id,rep_id' },
    )
})

afterAll(async () => {
  try {
    await cleanupFixture()
    await admin
      .from('profile_coverage')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('organization_id', ORG)
      .eq('profile_id', PROFILE)
      .eq('active', true)
    if (originalPrimary) {
      await admin.from('profile_coverage').upsert(
        {
          id: originalPrimary.id,
          organization_id: ORG,
          profile_id: PROFILE,
          rep_id: originalPrimary.rep_id,
          role: originalPrimary.role,
          priority: originalPrimary.priority,
          active: true,
          created_by: originalPrimary.created_by,
        },
        { onConflict: 'id' },
      )
    }
    for (const row of originalReadiness) {
      await admin.from('profile_readiness').upsert(
        {
          organization_id: ORG,
          profile_id: PROFILE,
          rep_id: row.rep_id,
          acknowledged_by: row.rep_id,
        },
        { onConflict: 'organization_id,profile_id,rep_id' },
      )
    }
  } finally {
    await closeNeonPool()
  }
})

describe('V6 live coverage acceptance', () => {
  it('SHARED keeps the primary executing, adds the covering rep, hides the backup', async () => {
    try {
      const result = await cover(client, 'SHARED')
      expect(result.results?.[0]?.error ?? null).toBeNull()

      const primary = ids(await scope(client, PRIMARY))
      const covering = ids(await scope(client, COVERING))
      const backup = ids(await scope(client, BACKUP))

      expect(primary).toContain(IDENTITY)
      expect(covering).toContain(IDENTITY)
      expect(backup).not.toContain(IDENTITY)
    } finally {
      await restore(client)
      await cleanupFixture()
    }
  }, 120_000)

  it('REPLACE excludes the primary, keeps the covering rep, never changes ownership', async () => {
    try {
      const result = await cover(client, 'REPLACE')
      expect(result.ok).toBe(true)

      const primary = ids(await scope(client, PRIMARY))
      const covering = ids(await scope(client, COVERING))
      const backup = ids(await scope(client, BACKUP))

      expect(primary).not.toContain(IDENTITY)
      expect(covering).toContain(IDENTITY)
      expect(backup).not.toContain(IDENTITY)
    } finally {
      await restore(client)
      await cleanupFixture()
    }
  }, 120_000)

  it('RESTORE returns execution to the primary and removes the covering rep', async () => {
    try {
      await cover(client, 'REPLACE')
      const restored = await restore(client)
      expect(restored.ok).toBe(true)

      const primary = ids(await scope(client, PRIMARY))
      const covering = ids(await scope(client, COVERING))

      expect(primary).toContain(IDENTITY)
      expect(covering).not.toContain(IDENTITY)
    } finally {
      await restore(client)
      await cleanupFixture()
    }
  }, 120_000)
})

describe('V6 acknowledgement and readiness separation', () => {
  it('acknowledging coverage clears the banner but leaves readiness unconfirmed', async () => {
    try {
      await cover(client, 'SHARED')
      const now = new Date().toISOString()

      const admin = neonServiceDbClient()
      const { data: assignments } = await admin
        .from('coverage_assignments')
        .select('id, coverage_mode')
        .eq('organization_id', ORG)
        .eq('profile_id', PROFILE)
      const modeByAssignment = new Map(
        (assignments ?? []).map((row) => [
          row.id as string,
          row.coverage_mode === 'SHARED' || row.coverage_mode === 'REPLACE'
            ? row.coverage_mode
            : null,
        ]),
      )

      const pending = await listAcknowledgementsForRep(client, ORG, COVERING, now, { modeByAssignment })
      const ack = pending.find((row) => row.profileId === PROFILE && row.subject === 'COVERAGE')
      expect(ack).toBeTruthy()
      expect(ack?.subject).toBe('COVERAGE')
      expect(ack?.mode).toBe('SHARED')
      expect(ack?.acknowledgedAt).toBeNull()

      const result = await acknowledgeResponsibility({
        client,
        orgId: ORG,
        repId: COVERING,
        acknowledgementId: ack!.id,
      })
      expect(result.ok).toBe(true)

      const after = await listAcknowledgementsForRep(client, ORG, COVERING, now)
      expect(after.find((row) => row.id === ack!.id)).toBeUndefined()

      // Readiness is a separate authority: the acknowledgement wrote none.
      const { data: readiness } = await admin
        .from('profile_readiness')
        .select('profile_id')
        .eq('organization_id', ORG)
        .eq('profile_id', PROFILE)
        .eq('rep_id', COVERING)
        .limit(1)
      expect(readiness ?? []).toHaveLength(0)
    } finally {
      await restore(client)
      await cleanupFixture()
    }
  }, 120_000)

  it('an access issue changes neither ownership, acknowledgement nor coverage mode', async () => {
    try {
      await cover(client, 'SHARED')
      const now = new Date().toISOString()

      const pending = await listAcknowledgementsForRep(client, ORG, COVERING, now)
      const ack = pending.find((row) => row.profileId === PROFILE && row.subject === 'COVERAGE')
      expect(ack).toBeTruthy()

      const result = await reportAccessIssue({
        client,
        orgId: ORG,
        repId: COVERING,
        acknowledgementId: ack!.id,
        issue: 'CREDENTIALS_MISSING',
        note: 'disposable fixture',
      })
      expect(result.ok).toBe(true)

      const admin = neonServiceDbClient()
      const { data: rows } = await admin
        .from('responsibility_acknowledgements')
        .select('acknowledged_at, access_issue, coverage_assignment_id')
        .eq('id', ack!.id)
        .limit(1)
      expect(rows?.[0]?.access_issue).toBe('CREDENTIALS_MISSING')
      expect(rows?.[0]?.acknowledged_at).toBeNull()

      // Ownership and mode are untouched.
      const { data: coverage } = await admin
        .from('coverage_assignments')
        .select('primary_rep_id, coverage_mode, status')
        .eq('id', ack!.coverageAssignmentId)
        .limit(1)
      expect(coverage?.[0]?.primary_rep_id).toBe(PRIMARY)
      expect(coverage?.[0]?.coverage_mode).toBe('SHARED')
      expect(coverage?.[0]?.status).toBe('ACTIVE')
    } finally {
      await restore(client)
      await cleanupFixture()
    }
  }, 120_000)
})
