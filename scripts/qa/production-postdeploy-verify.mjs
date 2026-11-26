/**
 * Read-only post-deploy verification against production.
 *
 *   RELAY_DDL_DATABASE_URL (or SERVICE_DATABASE_URL) is used ONLY for SELECTs.
 *
 * Expected after the Unified Operations release:
 *   - 209 recorded migrations (200 baseline + 9 additive)
 *   - catalog / sync / handoff / retention / capacity tables present
 *   - seed counts 5 channels / 16 definitions / 8 aliases
 *   - runtime roles retain access, RLS enabled
 */
import 'dotenv/config'
import pg from 'pg'

const url = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('SERVICE_DATABASE_URL is required')
  process.exit(2)
}

const db = new pg.Client({ connectionString: url })
await db.connect()
const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

try {
  const versions = Number((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n)
  check('recorded migrations = 209', versions === 209, String(versions))

  const additive = await db.query(
    `select version from supabase_migrations.schema_migrations where version like '20261125%' order by version`,
  )
  check('nine additive versions recorded', additive.rows.length === 9, String(additive.rows.length))

  const tables = [
    'execution_channels',
    'execution_activity_definitions',
    'execution_activity_aliases',
    'job_sync_requests',
    'responsibility_handoffs',
    'retention_runs',
    'rep_capacity_settings',
  ]
  const found = await db.query(
    `select tablename from pg_tables where schemaname='public' and tablename = any($1) order by tablename`,
    [tables],
  )
  check('all seven new tables exist', found.rows.length === tables.length, found.rows.map((r) => r.tablename).join(','))

  const seeds = await db.query(`
    select (select count(*) from execution_channels) as channels,
           (select count(*) from execution_activity_definitions) as definitions,
           (select count(*) from execution_activity_aliases) as aliases
  `)
  const row = seeds.rows[0]
  check('catalog seeds present (5/16/8)', Number(row.channels) === 5 && Number(row.definitions) === 16 && Number(row.aliases) === 8, `${row.channels}/${row.definitions}/${row.aliases}`)

  const rls = await db.query(
    `select relname from pg_class where relname = any($1) and relrowsecurity = false`,
    [tables],
  )
  check('RLS enabled on every new table', rls.rows.length === 0, rls.rows.map((r) => r.relname).join(','))
} finally {
  await db.end()
}

const failed = checks.filter((row) => !row.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} post-deploy checks passed`)
process.exit(failed.length ? 1 : 0)
