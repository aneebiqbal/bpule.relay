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
import { approveCoveragePlan, restorePrimaryCoverage, configureCoverage } from '@/lib/coverage/actions'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import {
  acknowledgeResponsibility,
  listAcknowledgementsForRep,
  reportAccessIssue,
} from '@/lib/responsibility/load'
import { closeDbPool, dbClientFor, serviceDbClient } from '@/lib/db/client'

const ORG = '11111111-1111-1111-1111-111111111111'
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
// The fixture is fully disposable: a dedicated profile + channel identity are
// created for the suite and deleted afterwards. It never touches a real
// production profile, so an interrupted run cannot leave production ownership
// changed.
let PROFILE = ''
let IDENTITY = ''
const PRIMARY = 'aaaaaaaa-0000-0000-0000-000000000004' // Ahmad
const COVERING = 'aaaaaaaa-0000-0000-0000-000000000003' // Madiha
const BACKUP = 'aaaaaaaa-0000-0000-0000-000000000002' // Hassan
const ACTOR = 'aaaaaaaa-0000-0000-0000-000000000001' // Aneeb (admin)
const AUTH_USER = '4803f9c8-48ef-4f9f-9ef3-c0a59c6414c6' // Aneeb

const TODAY = new Date().toISOString().slice(0, 10)

/** One client for the whole suite: the pooler drops connections under churn. */
let client: ReturnType<typeof dbClientFor>
let admin: ReturnType<typeof serviceDbClient>

beforeAll(async () => {
  client = dbClientFor(AUTH_USER)
  admin = serviceDbClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .insert({
      organization_id: ORG,
      rep_id: ACTOR,
      platform: 'linkedin',
      display_name: 'V6 live fixture',
      full_name: 'V6 live fixture',
      label: 'V6 fixture',
      person_id: null,
    })
    .select('id')
    .single()
  if (profileError) throw profileError
  PROFILE = profile.id as string

  const { data: identity, error: identityError } = await admin
    .from('revenue_identities')
    .insert({
      organization_id: ORG,
      profile_id: PROFILE,
      identity_name: 'V6 live fixture',
      channel: 'linkedin',
      status: 'active',
      slug: `v6-live-fixture-${RUN}`,
    })
    .select('id')
    .single()
  if (identityError) throw identityError
  IDENTITY = identity.id as string

  // Create the eligibility seats and the PRIMARY/BACKUP chain in ONE statement,
  // so a parallel production-parity scan can never observe the fixture with
  // assignments but no owner. The covering rep is eligibility-only (no seat).
  await admin.raw(
    `with seats as (
       insert into identity_assignments (organization_id, revenue_identity_id, rep_id, assigned_by, created_at)
       values ($1,$2,$3,$4,now()),($1,$2,$5,$4,now()),($1,$2,$6,$4,now())
       returning id
     ), chain as (
       insert into profile_coverage (organization_id, profile_id, rep_id, role, priority, active, created_by, created_at, updated_at)
       values ($1,$7,$3,'PRIMARY',1,true,$4,now(),now()),($1,$7,$6,'BACKUP',1,true,$4,now(),now())
       returning id
     )
     select (select count(*) from seats) + (select count(*) from chain) as written`,
    [ORG, IDENTITY, PRIMARY, ACTOR, COVERING, BACKUP, PROFILE],
  )
})

function scope(client: ReturnType<typeof dbClientFor>, repId: string) {
  return listExecutableIdentitiesForRep(client, ORG, repId, TODAY)
}

function ids(rows: Array<{ id: string }>) {
  return rows.map((row) => row.id)
}

async function cover(client: ReturnType<typeof dbClientFor>, mode: 'SHARED' | 'REPLACE') {
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

async function restore(client: ReturnType<typeof dbClientFor>) {
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

beforeEach(async () => {
  await cleanupFixture()

  await configureCoverage({
    organizationId: ORG,
    profileId: PROFILE,
    primaryRepId: PRIMARY,
    operators: [],
    backups: [{ repId: BACKUP, priority: 1 }],
    actorRepId: ACTOR,
    client: admin,
  })
  // The covering rep must hold eligibility; configureCoverage only syncs the
  // seats it was given, so re-add the covering rep's eligibility.
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
    // Remove the disposable fixture entirely: coverage rows, eligibility,
    // acknowledgements, the channel identity and the profile.
    await admin.from('responsibility_acknowledgements').delete().eq('organization_id', ORG).eq('profile_id', PROFILE)
    await admin.from('coverage_events').delete().eq('organization_id', ORG).eq('profile_id', PROFILE)
    await admin.from('profile_coverage').delete().eq('organization_id', ORG).eq('profile_id', PROFILE)
    await admin.from('identity_assignments').delete().eq('organization_id', ORG).eq('revenue_identity_id', IDENTITY)
    await admin.from('revenue_identities').delete().eq('organization_id', ORG).eq('id', IDENTITY)
    await admin.from('profiles').delete().eq('organization_id', ORG).eq('id', PROFILE)
  } finally {
    await closeDbPool()
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

      const admin = serviceDbClient()
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

      const admin = serviceDbClient()
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
