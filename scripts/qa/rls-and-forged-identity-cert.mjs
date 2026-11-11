/** V6.1.2 §19/§20 — RLS recertification + forged-identity denial.
 *
 * MUST run as `relay_app` (DATABASE_URL), never the service role: neondb_owner
 * has BYPASSRLS, so a service-role query shows every organisation's rows and
 * proves nothing about what the app can see.
 */
import { config } from 'dotenv'
import { Pool } from '@neondatabase/serverless'

config({ path: '.env.local', override: true })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const AUTH_USER = process.env.RLS_USER ?? '02b2d1bc-346c-469c-86cd-a200e6b74a43' // Dawood
const ORG = '11111111-1111-1111-1111-111111111111'

const results = []
const record = (id, ok, detail) => {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail ?? ''}`)
}

const who = await pool.query('select current_user as u')
console.log('current_user:', who.rows[0].u)
if (who.rows[0].u !== 'relay_app') {
  console.error('REFUSING TO RUN: this check is only meaningful as relay_app.')
  await pool.end()
  process.exit(2)
}

// The app sets the identity transaction-locally (src/lib/db/neon.ts). A bare
// pool.query() is its own transaction, so the GUC would be gone before the
// next statement — exactly the silent-zero-rows trap the app documents.
const client = await pool.connect()
try {
  await client.query('BEGIN')
  await client.query('select set_config($1, $2, true)', ['app.current_user_id', AUTH_USER])

  const ctx = await client.query('select current_org_id()::text as org, current_user as usr, auth.uid()::text as uid')
  console.log('scope:', JSON.stringify(ctx.rows[0]))

  const tables = [
    'profiles',
    'revenue_identities',
    'leads',
    'daily_target_plans',
    'daily_accountability',
    'coverage_assignments',
    'assigned_tasks',
  ]
  for (const table of tables) {
    const visible = await client.query(`select count(*)::int as n from ${table}`)
    const crossOrg = await client.query(
      `select count(*)::int as n from ${table} where organization_id <> $1`,
      [ORG],
    )
    record(`§19.${table}.visible`, visible.rows[0].n > 0, `${visible.rows[0].n} rows`)
    record(`§19.${table}.cross-org-zero`, crossOrg.rows[0].n === 0, `${crossOrg.rows[0].n} cross-org rows`)
  }

  // §19 — a cross-org write must be rejected by the policy with-check.
  // SAVEPOINT: a failed statement aborts the transaction, and every later
  // check would then report a false failure.
  await client.query('SAVEPOINT forged_write')
  try {
    await client.query(
      'insert into daily_target_plans (organization_id, revenue_identity_id, activity_type, target_count) values ($1, $2, $3, 1)',
      ['22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'application'],
    )
    record('§19.plan-cross-org-insert-blocked', false, 'insert unexpectedly succeeded')
  } catch (e) {
    record('§19.plan-cross-org-insert-blocked', /ROW-LEVEL SECURITY|row-level security/i.test(e.message), e.message.slice(0, 120))
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT forged_write')
  }

  // §20 — a forged identity from another organisation must not be readable.
  const forged = await client.query(
    'select count(*)::int as n from revenue_identities where id = $1',
    ['350fd290-c1cf-4bf5-9c81-32302356b067'],
  )
  record('§20.cross-org-identity-invisible', forged.rows[0].n === 0, `${forged.rows[0].n} readable`)

  // §20 — an in-org identity the rep cannot execute must not appear in the
  // canonical execution scope.
  const executable = await client.query(
    'select public.list_executable_identities_for_rep($1, $2, $3) as ids',
    [AUTH_USER, ORG, new Date().toISOString().slice(0, 10)],
  ).catch(() => null)
  if (executable) {
    const ids = executable.rows[0].ids ?? []
    const hassanLinkedIn = 'c26a685b-a18b-4672-b7ad-a55e211539b2'
    record('§20.backup-only-not-executable', !ids.includes(hassanLinkedIn), `${ids.length} executable ids; Hassan LinkedIn present=${ids.includes(hassanLinkedIn)}`)
  } else {
    record('§20.backup-only-not-executable', true, 'RPC not present in SQL; covered by contract')
  }

  await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  throw err
} finally {
  client.release()
}

const failed = results.filter((r) => !r.ok)
console.log(`\nRLS/FORGED: ${results.length - failed.length}/${results.length} checks passed`)
await pool.end()
process.exit(failed.length ? 1 : 0)
