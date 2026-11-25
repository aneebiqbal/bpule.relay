/**
 * Adversarial RLS check for the Phase 2–4 tables, executed as the REAL database
 * roles with the real runtime identity setting (`app.current_user_id`).
 *
 *   RELAY_STAGING_DATABASE_URL=postgres://mac@127.0.0.1:5433/relay_staging_local \
 *     node scripts/qa/rls-new-tables-staging.mjs
 */
import pg from 'pg'

const URL = process.env.RELAY_STAGING_DATABASE_URL ?? 'postgres://mac@127.0.0.1:5433/relay_staging_local'
if (/aivencloud|relay_prod/i.test(URL)) {
  console.error('refusing a non-local target')
  process.exit(2)
}

const ORG_A = '0a000000-4000-8000-0000-000000000001'
const ORG_B = '0b000000-4000-8000-0000-000000000001'
const ADMIN_A = '0a000000-4000-8000-0000-000000000002'
const MEMBER_A = '0a000000-4000-8000-0000-000000000004'
const OWNER_B = '0b000000-4000-8000-0000-000000000011'

const db = new pg.Client({ connectionString: URL })
await db.connect()

const results = []
async function scenario(name, fn) {
  try {
    await db.query('begin')
    await db.query('reset role')
    await fn()
    await db.query('commit')
    results.push({ name, ok: true })
    console.log(`ok   ${name}`)
  } catch (error) {
    await db.query('rollback').catch(() => {})
    const message = error instanceof Error ? error.message : String(error)
    results.push({ name, ok: false, message })
    console.log(`FAIL ${name} — ${message.slice(0, 160)}`)
  }
}

/** Run `sql` as the authenticated role bound to one rep, expecting success. */
async function asRep(repId, sql, params = []) {
  // Staging runs the postgres provider: the app connects as relay_app and
  // carries identity in app.current_user_id.
  await db.query(`set role relay_app`)
  await db.query(`select set_config('app.current_user_id', $1, true)`, [repId])
  return db.query(sql, params)
}

/** Run and require failure (the policy denial we want). */
async function expectDenied(label, repId, sql, params = []) {
  try {
    await asRep(repId, sql, params)
    throw new Error('expected denial but the statement succeeded')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/expected denial/.test(message)) throw error
    return message
  }
}

// Fixtures: one custom channel per org plus one sync request per org.
const channelA = '1c000000-4000-8000-0000-000000000001'
const channelB = '1c000000-4000-8000-0000-000000000002'
const activityA = '1c000000-4000-8000-0000-000000000011'
const activityB = '1c000000-4000-8000-0000-000000000012'
const syncA = '1c000000-4000-8000-0000-000000000021'
const syncB = '1c000000-4000-8000-0000-000000000022'
const handoffA = '1c000000-4000-8000-0000-000000000031'
const handoffB = '1c000000-4000-8000-0000-000000000032'

try {
  await db.query(
    `insert into execution_channels (id, organization_id, slug, name, template)
     values ($1, $2, 'rls-a', 'RLS A', 'custom'), ($3, $4, 'rls-b', 'RLS B', 'custom')
     on conflict (id) do nothing`,
    [channelA, ORG_A, channelB, ORG_B],
  )
  await db.query(
    `insert into execution_activity_definitions (id, channel_id, organization_id, key, label)
     values ($1, $2, $3, 'intro_sent', 'Intro A'), ($4, $5, $6, 'intro_sent', 'Intro B')
     on conflict (id) do nothing`,
    [activityA, channelA, ORG_A, activityB, channelB, ORG_B],
  )
  // Sync requests need reps; use the fixture reps so FKs hold.
  await db.query(
    `insert into job_sync_requests (id, organization_id, requested_by, status)
     values ($1, $2, $3, 'succeeded'), ($4, $5, $6, 'succeeded') on conflict (id) do nothing`,
    [syncA, ORG_A, ADMIN_A, syncB, ORG_B, OWNER_B],
  )
  await db.query(
    `insert into responsibility_handoffs (id, organization_id, from_rep_id, to_rep_id)
     values ($1, $2, $3, $3), ($4, $5, $6, $6) on conflict (id) do nothing`,
    [handoffA, ORG_A, ADMIN_A, handoffB, ORG_B, OWNER_B],
  )

  // 1. Member of A sees built-ins plus A's custom channel, never B's custom.
  await scenario('org scoping: member A sees only its own custom channel', async () => {
    const rows = await asRep(MEMBER_A, `select id from execution_channels where organization_id is not null`)
    const ids = rows.rows.map((row) => row.id)
    if (!ids.includes(channelA)) throw new Error('missing own channel')
    if (ids.includes(channelB)) throw new Error('leaked org B channel')
  })

  // 2. Member of A sees A's definitions, not B's.
  await scenario('org scoping: definitions are channel-scoped', async () => {
    const rows = await asRep(MEMBER_A, `select id from execution_activity_definitions`)
    const ids = rows.rows.map((row) => row.id)
    if (!ids.includes(activityA)) throw new Error('missing own definition')
    if (ids.includes(activityB)) throw new Error('leaked org B definition')
  })

  // 3. Cross-org sync request is invisible.
  await scenario('job_sync_requests are org-scoped', async () => {
    const rows = await asRep(MEMBER_A, `select id from job_sync_requests`)
    const ids = rows.rows.map((row) => row.id)
    if (ids.includes(syncB)) throw new Error('leaked org B sync request')
    if (!ids.includes(syncA)) throw new Error('missing own sync request')
  })

  // 4. Cross-org handoff is invisible.
  await scenario('responsibility_handoffs are org-scoped', async () => {
    const rows = await asRep(MEMBER_A, `select id from responsibility_handoffs`)
    const ids = rows.rows.map((row) => row.id)
    if (ids.includes(handoffB)) throw new Error('leaked org B handoff')
  })

  // 5. Member cannot create a channel (insert policy requires org admin).
  await scenario('member insert on execution_channels denied', async () => {
    await expectDenied(
      'member insert',
      MEMBER_A,
      `insert into execution_channels (organization_id, slug, name, template) values ($1, 'nope', 'Nope', 'custom')`,
      [ORG_A],
    )
  })

  // 6. Member cannot mutate an allocation: RLS silently matches zero rows,
  //    which is the correct denial shape for UPDATE/DELETE policies.
  await scenario('member cannot update allocations', async () => {
    const plan = await db.query(`select id from daily_target_plans where organization_id = $1 limit 1`, [ORG_A])
    if (!plan.rows[0]) throw new Error('no plan fixture')
    const result = await asRep(MEMBER_A, `update daily_plan_allocations set target_count = 999 where plan_id = $1 returning id`, [plan.rows[0].id])
    if (result.rows.length !== 0) throw new Error(`member changed ${result.rows.length} allocation row(s)`)
  })

  // 7. Admin can create a channel (authorized role succeeds).
  await scenario('org admin insert on execution_channels allowed', async () => {
    await asRep(ADMIN_A, `insert into execution_channels (organization_id, slug, name, template) values ($1, 'admin-made', 'Admin Made', 'custom')`, [ORG_A])
    await db.query(`delete from execution_channels where organization_id = $1 and slug = 'admin-made'`, [ORG_A])
  })

  // 8. Service role retains worker access after RLS.
  await scenario('service role retains table privileges', async () => {
    await db.query(`set role relay_service`)
    const check = await db.query(`select has_table_privilege('relay_service','execution_channels','INSERT') as v, has_table_privilege('relay_service','retention_runs','INSERT') as r`)
    if (!check.rows[0].v || !check.rows[0].r) throw new Error('service role lost privileges')
  })
} finally {
  await db.query(`reset role`)
  await db.query(`delete from responsibility_handoffs where id = any($1)`, [[handoffA, handoffB]])
  await db.query(`delete from job_sync_requests where id = any($1)`, [[syncA, syncB]])
  await db.query(`delete from execution_activity_definitions where id = any($1)`, [[activityA, activityB]])
  await db.query(`delete from execution_channels where id = any($1)`, [[channelA, channelB]])
  await db.end()
}

const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} RLS scenarios passed`)
process.exit(failed.length ? 1 : 0)
