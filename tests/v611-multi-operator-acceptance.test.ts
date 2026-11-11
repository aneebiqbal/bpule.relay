/**
 * V6.1.1 — multi-operator profile acceptance, live against the real database.
 *
 * Fixture: Fizza · Upwork. Hassan is the permanent PRIMARY owner, Ahmad is an
 * active OPERATOR, Madiha is a BACKUP. The channel's plan is ONE requirement
 * (Applications 10 · Proposals 2) shared by every operator.
 *
 *   Hassan completes 4, Ahmad completes 3 → profile progress 7/10,
 *   Hassan contribution 4, Ahmad contribution 3, remaining 3.
 *
 * Then Hassan is marked unavailable: Ahmad stays executable, ownership stays
 * with Hassan, the plan stays 10, progress stays 7. Then Ahmad is removed: he
 * loses execution, ownership and history are untouched.
 *
 * The suite restores the fixture exactly and removes every row it created.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeNeonPool, neonServiceDbClient } from '@/lib/db/neon'
import { addOperatorResponsibility, removeOperatorResponsibility } from '@/lib/profiles/assignment'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import { loadRepOperatingPlan } from '@/lib/operations/rep-operating-plan'
import { loadRepCoverage } from '@/lib/coverage/load'
import { setRepAvailability } from '@/lib/coverage/actions'

const ORG = '11111111-1111-1111-1111-111111111111'
const PROFILE = '6e92e611-dd09-464e-8b07-b82ef009e813' // Fizza · Upwork
const IDENTITY = '034fec42-6deb-4458-a2e4-539f29dd0d09'
const HASSAN = 'aaaaaaaa-0000-0000-0000-000000000002'
const AHMAD = 'aaaaaaaa-0000-0000-0000-000000000004'
const MADIHA = 'aaaaaaaa-0000-0000-0000-000000000003'
const ACTOR = 'aaaaaaaa-0000-0000-0000-000000000001' // Aneeb (admin)
const TODAY = new Date().toISOString().slice(0, 10)

/** Live acceptance needs the real database; CI has no credentials. */
const liveDb = Boolean(process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL)
const describeLive = liveDb ? describe : describe.skip

let client: ReturnType<typeof neonServiceDbClient>

interface CoverageSnapshot {
  id: string
  rep_id: string
  role: string
  priority: number
  created_by: string | null
}

let originalCoverage: CoverageSnapshot[] = []
let originalAvailability: { state: string; source: string; note: string | null } | null = null
let originalAccountability: Array<{ rep_id: string; activity_type: string; completed_count: number; target_count: number }> = []
const createdSourceEventIds: string[] = []

/** The Neon client returns the function row; unwrap the single json column. */
function rpcRecorded(result: { data: unknown }): boolean {
  const rows = result.data as Array<Record<string, unknown>> | null
  const first = rows?.[0]
  const payload = (first?.record_activity_event ?? first) as { recorded?: boolean } | undefined
  return payload?.recorded === true
}

beforeAll(() => {
  client = neonServiceDbClient()
})

afterAll(async () => { await closeNeonPool() })

async function snapshot() {
  const { data: coverage } = await client.raw<CoverageSnapshot>(
    `select id, rep_id, role, priority, created_by from profile_coverage
     where organization_id = $1 and profile_id = $2 and active order by priority`,
    [ORG, PROFILE],
  )
  originalCoverage = coverage ?? []

  const { data: availability } = await client.raw<{ state: string; source: string; note: string | null }>(
    `select state, source, note from rep_availability
     where organization_id = $1 and rep_id = $2 and business_date = $3 limit 1`,
    [ORG, HASSAN, TODAY],
  )
  originalAvailability = availability?.[0] ?? null

  const { data: accountability } = await client.raw<{ rep_id: string; activity_type: string; completed_count: number; target_count: number }>(
    `select rep_id, activity_type, completed_count, target_count from daily_accountability
     where organization_id = $1 and revenue_identity_id = $2 and target_date = $3
       and rep_id in ($4, $5)`,
    [ORG, IDENTITY, TODAY, HASSAN, AHMAD],
  )
  originalAccountability = accountability ?? []
}

/** Remove every row the fixture created and put the original chain back. */
async function restore() {
  // End the operator seat and any eligibility the fixture added.
  await removeOperatorResponsibility(client, {
    orgId: ORG, identityId: IDENTITY, repId: AHMAD, actorRepId: ACTOR,
  }).catch(() => null)

  // Remove fixture completion rows, then restore the originals.
  await client.raw(
    `delete from daily_accountability where organization_id = $1 and revenue_identity_id = $2
       and target_date = $3 and rep_id in ($4, $5)`,
    [ORG, IDENTITY, TODAY, HASSAN, AHMAD],
  )
  for (const row of originalAccountability) {
    await client.raw(
      `insert into daily_accountability
         (organization_id, rep_id, revenue_identity_id, activity_type, target_date, target_count, completed_count, status, closed, source_event_ids)
       values ($1, $2, $3, $4, $5, $6, $7, 'on_track', false, '{}'::text[])`,
      [ORG, row.rep_id, IDENTITY, row.activity_type, TODAY, row.target_count, row.completed_count],
    )
  }

  // Restore the exact original coverage chain.
  await client.raw(
    `update profile_coverage set active = false, updated_at = now()
     where organization_id = $1 and profile_id = $2 and active`,
    [ORG, PROFILE],
  )
  for (const row of originalCoverage) {
    await client.raw(
      `insert into profile_coverage (id, organization_id, profile_id, rep_id, role, priority, active, created_by, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, true, $7, now(), now())
       on conflict (id) do update set active = true, updated_at = now()`,
      [row.id, ORG, PROFILE, row.rep_id, row.role, row.priority, row.created_by],
    )
  }

  // Restore availability.
  if (originalAvailability) {
    await client.raw(
      `insert into rep_availability (organization_id, rep_id, business_date, state, source, note)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (organization_id, rep_id, business_date)
       do update set state = excluded.state, source = excluded.source, note = excluded.note, updated_at = now()`,
      [ORG, HASSAN, TODAY, originalAvailability.state, originalAvailability.source, originalAvailability.note],
    )
  } else {
    await client.raw(
      `delete from rep_availability where organization_id = $1 and rep_id = $2 and business_date = $3`,
      [ORG, HASSAN, TODAY],
    )
  }

  // Drop the operator acknowledgement the fixture seeded.
  await client.raw(
    `delete from responsibility_acknowledgements
     where organization_id = $1 and profile_id = $2 and rep_id = $3 and subject = 'OPERATOR'`,
    [ORG, PROFILE, AHMAD],
  )
  await client.raw(
    `delete from notifications where organization_id = $1 and (dedupe_key like $2 or dedupe_key like $3)`,
    [ORG, `%${PROFILE}%`, `%${IDENTITY}%`],
  )
}

function ids(rows: Array<{ id: string }>) {
  return rows.map((row) => row.id)
}

describeLive('MULTI_OPERATOR_ACCEPTANCE', () => {
  it('one profile, one primary, two operators, one shared plan', async () => {
    await snapshot()
    try {
      // 1. Add Ahmad as an active operator. Ownership must not move.
      await addOperatorResponsibility(client, {
        orgId: ORG, identityId: IDENTITY, repId: AHMAD, actorRepId: ACTOR,
      })

      const { data: chain } = await client.raw<{ rep_id: string; role: string }>(
        `select rep_id, role from profile_coverage
         where organization_id = $1 and profile_id = $2 and active order by priority`,
        [ORG, PROFILE],
      )
      const primary = (chain ?? []).filter((row) => row.role === 'PRIMARY')
      expect(primary).toHaveLength(1)
      expect(primary[0]?.rep_id).toBe(HASSAN)

      // Ahmad executes the same identity; Madiha (backup only) does not.
      expect(ids(await listExecutableIdentitiesForRep(client, ORG, AHMAD, TODAY))).toContain(IDENTITY)
      expect(ids(await listExecutableIdentitiesForRep(client, ORG, HASSAN, TODAY))).toContain(IDENTITY)
      expect(ids(await listExecutableIdentitiesForRep(client, ORG, MADIHA, TODAY))).not.toContain(IDENTITY)

      // The plan is unchanged: one requirement, not one per operator.
      const { data: plans } = await client.raw<{ activity_type: string; target_count: number }>(
        `select activity_type, target_count from daily_target_plans
         where organization_id = $1 and revenue_identity_id = $2 and active order by activity_type`,
        [ORG, IDENTITY],
      )
      expect(plans).toEqual([
        { activity_type: 'application', target_count: 10 },
        { activity_type: 'proposal', target_count: 2 },
      ])

      // 2. Hassan completes 4, Ahmad completes 3.
      for (let i = 0; i < 4; i += 1) {
        createdSourceEventIds.push(`acceptance:hassan:${Date.now()}:${i}`)
        const result = await client.rpc('record_activity_event', {
          p_rep_id: HASSAN,
          p_identity_id: IDENTITY,
          p_activity_type: 'application',
          p_org_id: ORG,
          p_source_event_id: createdSourceEventIds[createdSourceEventIds.length - 1],
          p_date: TODAY,
        })
        expect(result.error).toBeNull()
        expect(rpcRecorded(result)).toBe(true)
      }
      for (let i = 0; i < 3; i += 1) {
        createdSourceEventIds.push(`acceptance:ahmad:${Date.now()}:${i}`)
        const result = await client.rpc('record_activity_event', {
          p_rep_id: AHMAD,
          p_identity_id: IDENTITY,
          p_activity_type: 'application',
          p_org_id: ORG,
          p_source_event_id: createdSourceEventIds[createdSourceEventIds.length - 1],
          p_date: TODAY,
        })
        expect(result.error).toBeNull()
        expect(rpcRecorded(result)).toBe(true)
      }

      // 3. Profile progress is the SUM of contributions.
      const { data: contributions } = await client.raw<{ rep_id: string; completed: number }>(
        `select rep_id, sum(completed_count)::int as completed from daily_accountability
         where organization_id = $1 and revenue_identity_id = $2 and target_date = $3
         group by rep_id order by rep_id`,
        [ORG, IDENTITY, TODAY],
      )
      const byRep = new Map((contributions ?? []).map((row) => [row.rep_id, row.completed]))
      expect(byRep.get(HASSAN)).toBe(4)
      expect(byRep.get(AHMAD)).toBe(3)
      expect((byRep.get(HASSAN) ?? 0) + (byRep.get(AHMAD) ?? 0)).toBe(7)

      // 4. Rep Home: Ahmad sees the shared progress and his own contribution.
      const ahmadPlan = await loadRepOperatingPlan(client, { orgId: ORG, repId: AHMAD, repName: 'Ahmad' })
      const fiza = ahmadPlan.responsibilities.find((row) => row.identityId === IDENTITY)
      expect(fiza).toBeTruthy()
      expect(fiza?.role).toBe('operator')
      expect(fiza?.profileCompleted).toBe(7)
      expect(fiza?.completed).toBe(3)
      const applicationLane = fiza?.targets.find((row) => row.activityType === 'application')
      expect(applicationLane?.targetCount).toBe(10)
      expect(applicationLane?.profileCompletedCount).toBe(7)
      expect(applicationLane?.completedCount).toBe(3)
      expect(Math.max(0, (applicationLane?.targetCount ?? 0) - (applicationLane?.profileCompletedCount ?? 0))).toBe(3)

      // Hassan sees the same profile as PRIMARY.
      const hassanPlan = await loadRepOperatingPlan(client, { orgId: ORG, repId: HASSAN, repName: 'Hassan' })
      const fizaForHassan = hassanPlan.responsibilities.find((row) => row.identityId === IDENTITY)
      expect(fizaForHassan?.role).toBe('primary')
      expect(fizaForHassan?.profileCompleted).toBe(7)

      // Rep coverage: Ahmad's own list carries Fizza as an operator seat.
      const ahmadCoverage = await loadRepCoverage(ORG, AHMAD, { date: TODAY, client })
      // The marker is keyed by person, matching the grouped Rep Home card.
      expect(ahmadCoverage.operatorProfileIds).toContain('fec8abf0-7fb5-4999-87ea-fee805cc8c12')
      // Profiles are grouped by person, so match on the channel identity.
      expect(ahmadCoverage.own.some((row) => row.identityIds.includes(IDENTITY))).toBe(true)

      // 5. Hassan becomes unavailable. Nothing about ownership or the plan moves.
      await setRepAvailability({
        organizationId: ORG,
        repId: HASSAN,
        businessDate: TODAY,
        state: 'UNAVAILABLE',
        source: 'ADMIN',
        note: 'V6.1.1 acceptance fixture',
        actorRepId: ACTOR,
        client,
      })

      const { data: availability } = await client.raw<{ state: string }>(
        `select state from rep_availability where organization_id = $1 and rep_id = $2 and business_date = $3`,
        [ORG, HASSAN, TODAY],
      )
      expect(availability?.[0]?.state).toBe('UNAVAILABLE')

      expect(ids(await listExecutableIdentitiesForRep(client, ORG, AHMAD, TODAY))).toContain(IDENTITY)
      const { data: chainAfterLeave } = await client.raw<{ rep_id: string; role: string }>(
        `select rep_id, role from profile_coverage
         where organization_id = $1 and profile_id = $2 and active and role = 'PRIMARY'`,
        [ORG, PROFILE],
      )
      expect(chainAfterLeave?.[0]?.rep_id).toBe(HASSAN)

      const { data: plansAfterLeave } = await client.raw<{ target_count: number }>(
        `select target_count from daily_target_plans
         where organization_id = $1 and revenue_identity_id = $2 and active and activity_type = 'application'`,
        [ORG, IDENTITY],
      )
      expect(plansAfterLeave?.[0]?.target_count).toBe(10)

      const { data: progressAfterLeave } = await client.raw<{ total: number }>(
        `select sum(completed_count)::int as total from daily_accountability
         where organization_id = $1 and revenue_identity_id = $2 and target_date = $3`,
        [ORG, IDENTITY, TODAY],
      )
      expect(progressAfterLeave?.[0]?.total).toBe(7)

      // 6. Remove Ahmad. Execution stops; ownership, plan and history stay.
      await removeOperatorResponsibility(client, {
        orgId: ORG, identityId: IDENTITY, repId: AHMAD, actorRepId: ACTOR,
      })

      expect(ids(await listExecutableIdentitiesForRep(client, ORG, AHMAD, TODAY))).not.toContain(IDENTITY)
      const { data: chainAfterRemove } = await client.raw<{ rep_id: string; role: string }>(
        `select rep_id, role from profile_coverage
         where organization_id = $1 and profile_id = $2 and active and role = 'PRIMARY'`,
        [ORG, PROFILE],
      )
      expect(chainAfterRemove?.[0]?.rep_id).toBe(HASSAN)

      const { data: progressAfterRemove } = await client.raw<{ total: number }>(
        `select sum(completed_count)::int as total from daily_accountability
         where organization_id = $1 and revenue_identity_id = $2 and target_date = $3`,
        [ORG, IDENTITY, TODAY],
      )
      expect(progressAfterRemove?.[0]?.total).toBe(7)

      // The historical contribution survives the removal.
      const { data: ahmadHistory } = await client.raw<{ completed: number }>(
        `select sum(completed_count)::int as completed from daily_accountability
         where organization_id = $1 and revenue_identity_id = $2 and target_date = $3 and rep_id = $4`,
        [ORG, IDENTITY, TODAY, AHMAD],
      )
      expect(ahmadHistory?.[0]?.completed).toBe(3)
    } finally {
      await restore()
    }
  }, 180_000)
})
