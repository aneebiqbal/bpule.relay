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
import { approveCoveragePlan, restorePrimaryCoverage } from '@/lib/coverage/actions'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import {
  acknowledgeResponsibility,
  listAcknowledgementsForRep,
  reportAccessIssue,
} from '@/lib/responsibility/load'

const ORG = '11111111-1111-1111-1111-111111111111'
const PROFILE = '37ee6e21-17ec-4041-a5cc-1cfafe60ffd3' // Zaira
const IDENTITY = 'ab50b6a7-0b85-44c2-b8c9-52816f8adf93' // Zaira · Upwork
const PRIMARY = 'aaaaaaaa-0000-0000-0000-000000000004' // Ahmad
const COVERING = 'aaaaaaaa-0000-0000-0000-000000000002' // Hassan
const BACKUP = 'aaaaaaaa-0000-0000-0000-000000000003' // Madiha
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

/** Remove every row the fixture created. relay_app cannot delete coverage. */
async function cleanupFixture() {
  // End any coverage an interrupted run left active, so a mode conflict from a
  // previous test can never cascade into the next one.
  await admin
    .from('coverage_assignments')
    .update({ status: 'COMPLETED', effective_until: TODAY, updated_at: new Date().toISOString() })
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

afterAll(async () => { await closeNeonPool() })
beforeEach(async () => { await cleanupFixture() })

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
