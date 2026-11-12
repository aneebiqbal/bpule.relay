#!/usr/bin/env node
/**
 * Live RLS matrix + function certification on restored real data (sections 9-12).
 *
 * Runs as relay_app with a REAL rep identity from the restored database.
 * Read-only except for one reversible write fixture, which is rolled back.
 *
 * Usage:
 *   AIVEN_APP_URL=... AIVEN_SERVICE_URL=... node supabase/aiven/verify-live.mjs
 */
import { Client } from 'pg'

const appUrl = process.env.AIVEN_APP_URL
const serviceUrl = process.env.AIVEN_SERVICE_URL
if (!appUrl || !serviceUrl) {
  console.error('set AIVEN_APP_URL and AIVEN_SERVICE_URL')
  process.exit(1)
}
const ssl = { rejectUnauthorized: false }

const app = new Client({ connectionString: appUrl, ssl })
const service = new Client({ connectionString: serviceUrl, ssl })
await app.connect()
await service.connect()

const failures = []
const PROTECTED = [
  'profiles', 'revenue_identities', 'leads', 'messages', 'assigned_tasks',
  'action_events', 'daily_target_plans', 'daily_accountability',
  'coverage_assignments', 'responsibility_acknowledgements', 'upwork_jobs',
  'upwork_applications', 'captured_prospects', 'provider_config',
  'provider_saved_searches', 'provider_search_runs', 'provider_telemetry',
  'contact_points', 'conversation_states', 'profile_coverage',
]

// --- pick a real rep with an auth identity ---------------------------------
const rep = (
  await service.query(
    `select r.id, r.organization_id, r.name
       from reps r where r.auth_user_id is not null
      order by r.created_at limit 1`,
  )
).rows[0]
if (!rep) {
  console.error('no rep with auth_user_id in the restored data')
  process.exit(1)
}
console.log(`identity: rep=${rep.name} (${rep.id}) org=${rep.organization_id}`)

// --- role attributes -------------------------------------------------------
const roles = (
  await service.query(
    `select rolname, rolbypassrls, rolcanlogin,
            (select count(*) from pg_auth_members m join pg_roles p on p.oid=m.roleid
              where m.member = r.oid and p.rolname='authenticated') as member_of_authenticated
       from pg_roles r where rolname in ('relay_app','relay_service') order by 1`,
  )
).rows
console.log('\n== roles ==')
for (const r of roles) console.log(`${r.rolname}: bypassrls=${r.rolbypassrls} login=${r.rolcanlogin} member_of_authenticated=${r.member_of_authenticated}`)
const appRole = roles.find((r) => r.rolname === 'relay_app')
if (appRole?.rolbypassrls !== false) failures.push('relay_app must not bypass RLS')

// --- helper: run a query with/without identity ----------------------------
async function count(client, table, where = '', params = []) {
  const sql = `select count(*)::bigint as c from "${table}" ${where ? 'where ' + where : ''}`
  return (await client.query(sql, params)).rows[0].c
}

// --- no identity -----------------------------------------------------------
console.log('\n== no identity: protected rows must be 0 ==')
for (const t of PROTECTED) {
  try {
    const c = await count(app, t)
    if (c !== 0) failures.push(`no-identity leak: ${t}=${c}`)
  } catch (e) {
    failures.push(`no-identity query failed ${t}: ${e.message}`)
  }
}
console.log('checked', PROTECTED.length, 'tables')

// --- with identity ---------------------------------------------------------
console.log('\n== with identity: own-org visibility ==')
await app.query('begin')
await app.query('select set_config($1,$2,true)', ['app.current_user_id', rep.id])
const own = {}
for (const t of PROTECTED) {
  try {
    own[t] = await count(app, t, 'organization_id = $1', [rep.organization_id])
  } catch (e) {
    failures.push(`identity query failed ${t}: ${e.message}`)
  }
}
await app.query('commit')
console.log(own)

console.log('\n== cross-org: must be 0 ==')
await app.query('begin')
await app.query('select set_config($1,$2,true)', ['app.current_user_id', rep.id])
for (const t of PROTECTED) {
  try {
    const c = await count(app, t, 'organization_id <> $1', [rep.organization_id])
    if (c !== 0) failures.push(`cross-org leak: ${t}=${c}`)
  } catch (e) {
    failures.push(`cross-org query failed ${t}: ${e.message}`)
  }
}
await app.query('commit')
console.log('cross-org checked')

// --- write test (rolled back) ---------------------------------------------
console.log('\n== write test ==')
await app.query('begin')
await app.query('select set_config($1,$2,true)', ['app.current_user_id', rep.id])
try {
  const ins = await app.query(
    `insert into profiles (id, organization_id, rep_id, platform, label)
     values ($1,$2,$3,'cert','rls-live-test') returning id`,
    ['99999999-9999-9999-9999-999999999999', rep.organization_id, rep.id],
  )
  console.log('own-org write: OK', ins.rows[0].id)
} catch (e) {
  failures.push(`own-org write failed: ${e.message}`)
}
try {
  await app.query(
    `insert into profiles (id, organization_id, rep_id, platform, label)
     values ($1,$2,$3,'cert','rls-cross-org')`,
    ['88888888-8888-8888-8888-888888888888', '00000000-0000-0000-0000-000000000000', rep.id],
  )
  failures.push('cross-org write was allowed (RLS failure)')
} catch (e) {
  console.log('cross-org write: blocked OK')
}
await app.query('rollback')

// --- functions -------------------------------------------------------------
console.log('\n== functions ==')
await app.query('begin')
await app.query('select set_config($1,$2,true)', ['app.current_user_id', rep.id])
const fns = [
  ['current_org_id', `select current_org_id() as v`],
  ['caller_may_act_for', `select caller_may_act_for($1,$2) as v`, [rep.organization_id, rep.id]],
  ['request_is_service_role', `select request_is_service_role() as v`],
]
for (const [name, sql, params] of fns) {
  try {
    const r = await app.query(sql, params)
    console.log(`${name}: OK (${JSON.stringify(r.rows[0].v)})`)
  } catch (e) {
    failures.push(`function ${name}: ${e.message}`)
  }
}
await app.query('commit')

await app.end()
await service.end()

console.log('\n== summary ==')
if (failures.length) {
  console.log('FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log('LIVE RLS + FUNCTIONS: PASS')
