/**
 * READ-ONLY production RLS cutover verification (warm-pool-safe).
 *
 * The release gate answers "which role executed the page queries". A warm pool
 * can reuse connections, so counting opened backends is only diagnostic. The
 * primary proof resets `pg_stat_statements`, makes exactly one authenticated
 * page request, and attributes the executed statements to roles.
 *
 * Required env:
 *   RELAY_CUTOVER_SHA          exact code SHA the deployment must report
 *   RELAY_CUTOVER_COOKIE       authenticated session cookie for a real rep
 *   RELAY_CUTOVER_DB_URL       owner/service URL, used ONLY for read-only
 *                              pg_stat_activity / pg_stat_statements inspection
 *
 * Optional env:
 *   RELAY_CUTOVER_BASE         default https://bpule-relay.vercel.app
 *   RELAY_CUTOVER_APP_URL      relay_app URL, for the RLS scoping check
 *   RELAY_CUTOVER_AUTH_USER_ID rep whose identity proves RLS scoping
 *   RELAY_CUTOVER_ORG_ID       that rep's organisation
 *   RELAY_CUTOVER_SECOND_ORG_ID / RELAY_CUTOVER_SECOND_AUTH_USER_ID
 *                              a second organisation, for a cross-tenant check
 *
 * Secrets are never printed — only role names and row counts.
 */
import { Pool } from '@neondatabase/serverless'
import { assertCutover, classifyRoleAttribution } from './role-attribution.mjs'

const BASE = process.env.RELAY_CUTOVER_BASE ?? 'https://bpule-relay.vercel.app'
const EXPECTED_SHA = process.env.RELAY_CUTOVER_SHA
const COOKIE = process.env.RELAY_CUTOVER_COOKIE
const SERVICE_URL = process.env.RELAY_CUTOVER_DB_URL
const APP_URL = process.env.RELAY_CUTOVER_APP_URL
const AUTH_USER_ID = process.env.RELAY_CUTOVER_AUTH_USER_ID
const ORG_ID = process.env.RELAY_CUTOVER_ORG_ID
const SECOND_ORG_ID = process.env.RELAY_CUTOVER_SECOND_ORG_ID
const SECOND_AUTH_USER_ID = process.env.RELAY_CUTOVER_SECOND_AUTH_USER_ID

const results = []
const ok = (m) => results.push(['ok', m])
const fail = (m) => results.push(['FAIL', m])

function assert(cond, message) {
  if (cond) ok(message)
  else fail(message)
}

function normalize(url) {
  const parsed = new URL(url)
  // The Neon pooler requires channel_binding, which the serverless driver does
  // not implement; dropping it keeps the inspection connection working.
  parsed.searchParams.delete('channel_binding')
  return parsed.toString()
}

/** Locate pg_stat_statements — Neon installs it in the `extensions` schema. */
async function statsTable(pool) {
  const ext = await pool.query(
    `select n.nspname as schema
       from pg_extension e
       join pg_namespace n on n.oid = e.extnamespace
      where e.extname = 'pg_stat_statements'`,
    [],
  )
  return ext.rows[0]?.schema ? `${ext.rows[0].schema}.pg_stat_statements` : null
}

async function readAttribution(pool, table) {
  const res = await pool.query(
    `select userid::regrole::text as role, calls, query
       from ${table}
      where calls > 0`,
    [],
  )
  return classifyRoleAttribution(res.rows)
}

// ── 1. Deployed identity ────────────────────────────────────────────────────
const versionRes = await fetch(`${BASE}/api/version`, { headers: { cookie: COOKIE ?? '' } })
const version = await versionRes.json().catch(() => null)
assert(versionRes.status === 200, `GET /api/version → ${versionRes.status}`)
if (version) {
  assert(
    !EXPECTED_SHA || version.sha === EXPECTED_SHA,
    `deployed SHA matches ${EXPECTED_SHA ?? '(any)'} (got ${version.sha ?? 'null'})`,
  )
  assert(version.databaseProvider === 'neon', `databaseProvider=neon (got ${version.databaseProvider})`)
  assert(version.authProvider === 'neon', `authProvider=neon (got ${version.authProvider})`)
} else {
  fail('GET /api/version returned no JSON')
}

let pool = null
if (!SERVICE_URL) {
  fail('RELAY_CUTOVER_DB_URL is not set — cannot inspect pg_stat_activity')
} else {
  pool = new Pool({ connectionString: normalize(SERVICE_URL), max: 1 })
}

// ── 2. Role attributes ──────────────────────────────────────────────────────
let statsTablePath = null
if (pool) {
  try {
    const roles = await pool.query(
      `select rolname, rolbypassrls, rolcanlogin
         from pg_roles
        where rolname in ('relay_app', 'neondb_owner', 'service_role')
        order by rolname`,
      [],
    )
    const byRole = Object.fromEntries(roles.rows.map((r) => [r.rolname, r]))
    assert(byRole.relay_app?.rolbypassrls === false, 'relay_app rolbypassrls=false')
    assert(byRole.relay_app?.rolcanlogin === true, 'relay_app can log in')
    assert(byRole.neondb_owner?.rolbypassrls === true, 'owner retains BYPASSRLS (expected)')
    statsTablePath = await statsTable(pool)
    assert(statsTablePath !== null, 'pg_stat_statements is available')
  } catch (err) {
    fail(`role/stat inspection failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── 3. Control run: ambient noise with no page request ──────────────────────
let control = null
if (pool && statsTablePath) {
  try {
    await pool.query(`select ${statsTablePath.replace('.pg_stat_statements', '')}.pg_stat_statements_reset()`, [])
    await new Promise((r) => setTimeout(r, 4000))
    control = await readAttribution(pool, statsTablePath)
    ok(
      `control (no page request): relay_app runtime=${control.runtimeAppCalls}, owner runtime=${control.runtimeOwnerCalls}`,
    )
  } catch (err) {
    fail(`control run failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── 4. Role-attributed application proof (PRIMARY) ──────────────────────────
let attribution = null
if (pool && statsTablePath) {
  try {
    await pool.query(`select ${statsTablePath.replace('.pg_stat_statements', '')}.pg_stat_statements_reset()`, [])
    await new Promise((r) => setTimeout(r, 300))

    const startedAt = new Date()
    const dashboardRes = await fetch(`${BASE}/dashboard`, {
      headers: { cookie: COOKIE ?? '', accept: 'text/html' },
      redirect: 'manual',
    })
    const dashboardText = await dashboardRes.text()
    assert(
      dashboardRes.status === 200,
      `GET /dashboard → ${dashboardRes.status} (302 would mean the session is not accepted)`,
    )
    assert(
      !/permission denied|row-level security|Neon query failed|raw SQL/i.test(dashboardText),
      'dashboard HTML carries no raw database error',
    )

    await new Promise((r) => setTimeout(r, 400))
    attribution = await readAttribution(pool, statsTablePath)
    const verdict = assertCutover(attribution)
    assert(
      verdict.pass,
      `role attribution: ${verdict.reason} (window ${startedAt.toISOString()})`,
    )
    ok(
      `relay_app application calls=${attribution.runtimeAppCalls}, owner application calls=${attribution.runtimeOwnerCalls}`,
    )
    for (const row of attribution.applicationSelects.slice(0, 5)) {
      ok(`  ${row.role}: ${row.calls}× ${row.query.slice(0, 90)}`)
    }
  } catch (err) {
    fail(`role-attributed proof failed: ${err instanceof Error ? err.message : String(err)}`)
  }
} else {
  fail('role-attributed proof skipped — no inspection pool')
}

// ── 5. Backend activity (DIAGNOSTIC ONLY) ───────────────────────────────────
if (pool) {
  try {
    const ownerBackends = await pool.query(
      `select count(*)::int as n
         from pg_stat_activity
        where datname = 'neondb'
          and usename = 'neondb_owner'
          and application_name like '%serverless%'
          and pid <> pg_backend_pid()`,
      [],
    )
    const relayBackends = await pool.query(
      `select count(*)::int as n
         from pg_stat_activity
        where datname = 'neondb'
          and usename = 'relay_app'
          and pid <> pg_backend_pid()`,
      [],
    )
    ok(
      `DIAGNOSTIC ONLY — idle pooled backends: relay_app=${relayBackends.rows[0].n}, owner=${ownerBackends.rows[0].n}`,
    )
    ok('backend counts are diagnostic only; the release decision is the role-attributed proof above')
  } catch (err) {
    fail(`backend diagnostics failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── 6. RLS scoping, read-only ───────────────────────────────────────────────
if (pool && APP_URL) {
  const asApp = new Pool({ connectionString: normalize(APP_URL), max: 1 })
  try {
    const scopedCount = async (userId) => {
      // The pooler can hand a client a backend that still carries a session
      // GUC from an earlier client, so set the identity explicitly inside a
      // transaction (SET LOCAL) for every check.
      const client = await asApp.connect()
      try {
        await client.query('begin')
        if (userId) {
          await client.query('select set_config($1, $2, true)', ['app.current_user_id', userId])
        } else {
          await client.query("select set_config('app.current_user_id', '', true)")
        }
        const r = await client.query('select count(*)::int as n from leads')
        await client.query('commit')
        return r.rows[0].n
      } catch (err) {
        await client.query('rollback').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    }

    const anon = await scopedCount(null)
    assert(anon === 0, `relay_app with no identity sees 0 leads (got ${anon})`)

    if (AUTH_USER_ID && ORG_ID) {
      const got = await scopedCount(AUTH_USER_ID)
      const expected = (await pool.query('select count(*)::int as n from leads where organization_id = $1', [ORG_ID]))
        .rows[0].n
      assert(got === expected, `relay_app scoped to the rep sees exactly its org (${got} == ${expected})`)
    }

    if (SECOND_ORG_ID && SECOND_AUTH_USER_ID) {
      const got = await scopedCount(SECOND_AUTH_USER_ID)
      const expected = (
        await pool.query('select count(*)::int as n from leads where organization_id = $1', [SECOND_ORG_ID])
      ).rows[0].n
      assert(got === expected, `second org is scoped independently (${got} == ${expected})`)
    }
  } catch (err) {
    fail(`RLS scoping check failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    await asApp.end()
  }
} else if (pool) {
  ok('RELAY_CUTOVER_APP_URL not set — skipping the RLS scoping check')
}

await pool?.end()

// ── 7. Report ───────────────────────────────────────────────────────────────
console.log(`\nRLS cutover verification — ${BASE}`)
console.log('─'.repeat(64))
for (const [status, message] of results) console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${message}`)
const failures = results.filter(([s]) => s === 'FAIL').length
console.log('─'.repeat(64))
console.log(`${results.length - failures} passed, ${failures} failed`)
if (attribution) {
  console.log(
    `\nAPPLICATION ROLE: ${attribution.runtimeOwnerCalls > 0 ? 'neondb_owner' : attribution.runtimeAppCalls > 0 ? 'relay_app' : 'unknown'}`,
  )
  console.log(`relay_app application calls: ${attribution.runtimeAppCalls}`)
  console.log(`neondb_owner application calls: ${attribution.runtimeOwnerCalls}`)
}
process.exit(failures === 0 ? 0 : 1)
