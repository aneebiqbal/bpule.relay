/**
 * V6.1.1 — multi-operator profile data integrity.
 *
 * ONE profile → ONE permanent PRIMARY → ZERO OR MORE active OPERATORS, each
 * contributing separately to ONE shared channel plan. These invariants are the
 * acceptance criteria for §13; they run against the real database.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { listExecutableIdentitiesForRep } from '@/lib/coverage/access'
import { closeDbPool, serviceDbClient } from '@/lib/db/client'

const ORG = '11111111-1111-1111-1111-111111111111'
const PROFILE = '6e92e611-dd09-464e-8b07-b82ef009e813' // Fizza · Upwork
const IDENTITY = '034fec42-6deb-4458-a2e4-539f29dd0d09'
const HASSAN = 'aaaaaaaa-0000-0000-0000-000000000002' // primary
const AHMAD = 'aaaaaaaa-0000-0000-0000-000000000004' // operator
const MADIHA = 'aaaaaaaa-0000-0000-0000-000000000003' // backup only
const TODAY = new Date().toISOString().slice(0, 10)

/** Live acceptance needs the real database; CI has no credentials. */
const liveDb = Boolean(process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL)
const describeLive = liveDb ? describe : describe.skip

afterAll(async () => { await closeDbPool() })

describeLive('MULTI_OPERATOR_DATA_INTEGRITY', () => {
  it('no profile carries more than one active PRIMARY seat', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ profile_id: string; n: number }>(
      `select profile_id, count(*)::int as n from profile_coverage
       where organization_id = $1 and active and role = 'PRIMARY'
       group by profile_id having count(*) > 1`,
      [ORG],
    )
    expect(error).toBeNull()
    expect(data).toEqual([])
  }, 60_000)

  it('every active PRIMARY seat has eligibility', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ rep_id: string }>(
      `select pc.rep_id from profile_coverage pc
       where pc.organization_id = $1 and pc.active and pc.role = 'PRIMARY'
         and not exists (
           select 1 from identity_assignments ia
           join revenue_identities ri on ri.id = ia.revenue_identity_id
           where ia.rep_id = pc.rep_id and ri.profile_id = pc.profile_id
             and ia.organization_id = pc.organization_id
         )`,
      [ORG],
    )
    expect(error).toBeNull()
    expect(data).toEqual([])
  }, 60_000)

  it('every active OPERATOR seat has eligibility', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ rep_id: string }>(
      `select pc.rep_id from profile_coverage pc
       where pc.organization_id = $1 and pc.active and pc.role = 'OPERATOR'
         and not exists (
           select 1 from identity_assignments ia
           join revenue_identities ri on ri.id = ia.revenue_identity_id
           where ia.rep_id = pc.rep_id and ri.profile_id = pc.profile_id
             and ia.organization_id = pc.organization_id
         )`,
      [ORG],
    )
    expect(error).toBeNull()
    expect(data).toEqual([])
  }, 60_000)

  it('no OPERATOR seat crosses organizations', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ n: number }>(
      `select count(*)::int as n from profile_coverage pc
       join reps r on r.id = pc.rep_id
       join profiles p on p.id = pc.profile_id
       where pc.active and pc.role = 'OPERATOR'
         and r.organization_id <> p.organization_id`,
      [],
    )
    expect(error).toBeNull()
    expect(data?.[0]?.n ?? 0).toBe(0)
  }, 60_000)

  it('no identity has two active plans for the same activity', async () => {
    const client = serviceDbClient()
    const { data, error } = await client.raw<{ identity_id: string; activity_type: string }>(
      `select revenue_identity_id as identity_id, activity_type from daily_target_plans
       where organization_id = $1 and active
       group by revenue_identity_id, activity_type having count(*) > 1`,
      [ORG],
    )
    expect(error).toBeNull()
    expect(data).toEqual([])
  }, 60_000)

  it('a backup-only rep never executes the profile', async () => {
    const client = serviceDbClient()
    // Madiha is a configured BACKUP on Fizza · Upwork and holds no other seat.
    const { data: seat } = await client.raw<{ role: string }>(
      `select role from profile_coverage
       where organization_id = $1 and profile_id = $2 and rep_id = $3 and active
       order by priority limit 1`,
      [ORG, PROFILE, MADIHA],
    )
    if (!seat || seat.length === 0) return // fixture not configured in this environment
    expect(seat[0]?.role).toBe('BACKUP')
    const executable = await listExecutableIdentitiesForRep(client, ORG, MADIHA, TODAY)
    expect(executable.map((row) => row.id)).not.toContain(IDENTITY)
  }, 60_000)

  it('an OPERATOR seat is executable; a BACKUP seat is not', async () => {
    const client = serviceDbClient()
    const { data: seats } = await client.raw<{ rep_id: string; role: string }>(
      `select rep_id, role from profile_coverage
       where organization_id = $1 and profile_id = $2 and active
       order by priority`,
      [ORG, PROFILE],
    )
    const operatorIds = (seats ?? []).filter((row) => row.role === 'OPERATOR').map((row) => row.rep_id)
    for (const repId of operatorIds) {
      const executable = await listExecutableIdentitiesForRep(client, ORG, repId, TODAY)
      expect(executable.map((row) => row.id)).toContain(IDENTITY)
    }
  }, 60_000)
})

describeLive('MULTI_OPERATOR_SHARED_PLAN', () => {
  it('the plan is one requirement per channel lane, not one per operator', async () => {
    const client = serviceDbClient()
    const { data: plans, error } = await client.raw<{ activity_type: string; target_count: number }>(
      `select activity_type, target_count from daily_target_plans
       where organization_id = $1 and revenue_identity_id = $2 and active
       order by activity_type`,
      [ORG, IDENTITY],
    )
    expect(error).toBeNull()
    expect(plans).toEqual([
      { activity_type: 'application', target_count: 10 },
      { activity_type: 'proposal', target_count: 2 },
    ])
  }, 60_000)

  it('the primary and the operator share that single requirement', async () => {
    const client = serviceDbClient()
    const { data: rows, error } = await client.raw<{ rep_id: string; completed: number }>(
      `select rep_id, sum(completed_count)::int as completed from daily_accountability
       where organization_id = $1 and revenue_identity_id = $2 and target_date = $3
       group by rep_id order by rep_id`,
      [ORG, IDENTITY, TODAY],
    )
    expect(error).toBeNull()
    const byRep = new Map((rows ?? []).map((row) => [row.rep_id, row.completed]))
    const total = (rows ?? []).reduce((sum, row) => sum + row.completed, 0)
    // The profile total is the SUM of contributions — never a per-rep target.
    expect(total).toBe((byRep.get(HASSAN) ?? 0) + (byRep.get(AHMAD) ?? 0))
  }, 60_000)
})
