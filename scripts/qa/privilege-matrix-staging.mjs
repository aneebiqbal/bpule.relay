/**
 * Least-privilege matrix + SECURITY DEFINER audit on disposable PostgreSQL,
 * executed through the real app role (relay_app) and identity GUC.
 *
 *   RELAY_STAGING_DATABASE_URL=postgres://mac@127.0.0.1:5433/relay_staging_local \
 *     node scripts/qa/privilege-matrix-staging.mjs
 */
import pg from 'pg'

const URL = process.env.RELAY_STAGING_DATABASE_URL ?? 'postgres://mac@127.0.0.1:5433/relay_staging_local'
if (/aivencloud|relay_prod/i.test(URL)) {
  console.error('refusing a non-local target')
  process.exit(2)
}

const ORG_A = '0a000000-4000-8000-0000-000000000001'
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

async function asRep(repId, sql, params = []) {
  await db.query('set role relay_app')
  await db.query(`select set_config('app.current_user_id', $1, true)`, [repId])
  return db.query(sql, params)
}

// Fixture capacity row for org A + a retention run row.
try {
  await db.query(
    `insert into rep_capacity_settings (organization_id, rep_id, available_minutes, updated_by)
     values ($1, $2, 240, $3) on conflict (organization_id, rep_id) do nothing`,
    [ORG_A, ADMIN_A, ADMIN_A],
  )
  await db.query(
    `insert into retention_runs (organization_id, requested_by, dry_run) values ($1, $2, true)
     on conflict do nothing`,
    [ORG_A, ADMIN_A],
  )

  await scenario('member cannot configure another rep capacity', async () => {
    const result = await asRep(MEMBER_A, `update rep_capacity_settings set available_minutes = 999 where organization_id = $1`, [ORG_A])
    if (result.rowCount !== 0) throw new Error(`member changed ${result.rowCount} capacity row(s)`)
  })

  await scenario('member cannot insert a retention run', async () => {
    try {
      await asRep(MEMBER_A, `insert into retention_runs (organization_id, dry_run) values ($1, false)`, [ORG_A])
      throw new Error('expected denial but insert succeeded')
    } catch (error) {
      if (/expected denial/.test(error.message)) throw error
    }
  })

  await scenario('cross-org capacity read is invisible', async () => {
    const rows = await asRep(OWNER_B, `select rep_id from rep_capacity_settings where organization_id = $1`, [ORG_A])
    if (rows.rows.length !== 0) throw new Error('org B saw org A capacity rows')
  })

  await scenario('admin can configure capacity', async () => {
    const rows = await asRep(ADMIN_A, `update rep_capacity_settings set available_minutes = 300 where organization_id = $1 and rep_id = $2 returning id`, [ORG_A, ADMIN_A])
    if (rows.rows.length !== 1) throw new Error('admin capacity update failed')
  })
} finally {
  await db.query('reset role')
  await db.query(`delete from retention_runs where organization_id = $1 and dry_run = true`, [ORG_A])
  await db.query(`delete from rep_capacity_settings where organization_id = $1`, [ORG_A])
}

// Least-privilege matrix for the new tables.
const tables = [
  'execution_channels',
  'execution_activity_definitions',
  'execution_activity_aliases',
  'job_sync_requests',
  'responsibility_handoffs',
  'retention_runs',
  'rep_capacity_settings',
]
console.log('\nleast-privilege matrix (table privilege → roles)')
for (const table of tables) {
  const rows = await db.query(
    `select grantee, string_agg(privilege_type, ',' order by privilege_type) privileges
       from information_schema.role_table_grants
      where table_name = $1 and table_schema = 'public'
      group by grantee order by grantee`,
    [table],
  )
  console.log(table, JSON.stringify(rows.rows))
}

// SECURITY DEFINER audit: who may execute privileged functions.
const definer = await db.query(
  `select p.proname, pg_get_function_identity_arguments(p.oid) args,
          coalesce(array_to_string(p.proacl, ' | '), 'default') acl
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
    order by p.proname`,
)
console.log('\nSECURITY DEFINER functions in public:')
for (const row of definer.rows) console.log(`- ${row.proname}(${row.args}) acl=${row.acl}`)

await db.end()
const failed = results.filter((row) => !row.ok)
console.log(`\n${results.length - failed.length}/${results.length} privilege scenarios passed`)
process.exit(failed.length ? 1 : 0)
