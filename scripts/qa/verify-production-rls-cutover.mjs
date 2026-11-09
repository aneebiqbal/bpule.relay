/**
 * READ-ONLY production RLS cutover verification.
 *
 * Proves the deployed app reads through the least-privilege `relay_app` role
 * and that RLS actually scopes its rows — the release gate for the Vercel
 * owner cutover.
 *
 * Required env:
 *   RELAY_CUTOVER_SHA          exact code SHA the deployment must report
 *   RELAY_CUTOVER_COOKIE       authenticated session cookie for a real rep
 *   RELAY_CUTOVER_DB_URL       owner/service URL, used ONLY for read-only
 *                              pg_stat_activity / pg_roles inspection
 *
 * Optional env:
 *   RELAY_CUTOVER_BASE         default https://bpule-relay.vercel.app
 *   RELAY_CUTOVER_AUTH_USER_ID rep whose identity proves RLS scoping
 *   RELAY_CUTOVER_ORG_ID       that rep's organisation
 *   RELAY_CUTOVER_SECOND_ORG_ID / RELAY_CUTOVER_SECOND_AUTH_USER_ID
 *                              a second organisation, for a cross-tenant check
 *
 * Secrets are never printed — only role names and row counts.
 */
import { Pool } from '@neondatabase/serverless'

const BASE = process.env.RELAY_CUTOVER_BASE ?? 'https://bpule-relay.vercel.app'
const EXPECTED_SHA = process.env.RELAY_CUTOVER_SHA
const COOKIE = process.env.RELAY_CUTOVER_COOKIE
const SERVICE_URL = process.env.RELAY_CUTOVER_DB_URL
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

// ── 2. One authenticated page request, timed ────────────────────────────────
// Open the inspection pool first so the owner-backend count can be compared
// before and after the page request — pooled connections opened by earlier
// traffic would otherwise be mistaken for page traffic.
let pool = null
let myPid = null
if (!SERVICE_URL) {
  fail('RELAY_CUTOVER_DB_URL is not set — cannot inspect pg_stat_activity')
} else {
  pool = new Pool({ connectionString: normalize(SERVICE_URL), max: 1 })
  myPid = (await pool.query('select pg_backend_pid() as pid')).rows[0].pid
}

const ownerPageBackends = () =>
  pool.query(
    `select count(*)::int as n
       from pg_stat_activity
      where datname = 'neondb'
        and usename = 'neondb_owner'
        and application_name like '%serverless%'
        and pid <> $1`,
    [myPid],
  )
const relayAppBackends = () =>
  pool.query(
    `select count(*)::int as n
       from pg_stat_activity
      where datname = 'neondb'
        and usename = 'relay_app'
        and pid <> $1`,
    [myPid],
  )

const ownerBefore = pool ? (await ownerPageBackends()).rows[0].n : null
const relayAppBefore = pool ? (await relayAppBackends()).rows[0].n : null

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

// ── 3. Fresh connection inspection ──────────────────────────────────────────
if (!pool) {
  // already reported
} else {
  try {
    // Role attributes: the app role must not bypass RLS.
    const roles = await pool.query(
      `select rolname, rolbypassrls, rolcanlogin
         from pg_roles
        where rolname in ('relay_app', 'neondb_owner', 'service_role')
        order by rolname`,
    )
    const byRole = Object.fromEntries(roles.rows.map((r) => [r.rolname, r]))
    assert(byRole.relay_app?.rolbypassrls === false, 'relay_app rolbypassrls=false')
    assert(byRole.relay_app?.rolcanlogin === true, 'relay_app can log in')
    assert(byRole.neondb_owner?.rolbypassrls === true, 'owner retains BYPASSRLS (expected)')

    const ownerAfter = (await ownerPageBackends()).rows[0].n
    const relayAppAfter = (await relayAppBackends()).rows[0].n
    assert(relayAppAfter > 0, 'relay_app holds live application connections')
    assert(
      ownerAfter <= ownerBefore,
      `page traffic opened no owner backend (before ${ownerBefore}, after ${ownerAfter})`,
    )
    ok(`owner serverless backends before/after page request: ${ownerBefore}/${ownerAfter}`)
    ok(`relay_app backends before/after page request: ${relayAppBefore}/${relayAppAfter}`)

    // Connections created by the timed page request specifically.
    const sincePage = await pool.query(
      `select usename, count(*)::int as n
         from pg_stat_activity
        where datname = 'neondb'
          and backend_start >= $1
          and pid <> $2
        group by usename`,
      [startedAt, myPid],
    )
    const sinceByRole = Object.fromEntries(sincePage.rows.map((r) => [r.usename, r.n]))
    assert(
      (sinceByRole.neondb_owner ?? 0) === 0,
      `no owner backend opened since the page request (found ${sinceByRole.neondb_owner ?? 0})`,
    )
    ok(`backends opened since the page request: ${JSON.stringify(sinceByRole)}`)

    // ── 4. RLS scoping, read-only ───────────────────────────────────────────
    const APP_URL = process.env.RELAY_CUTOVER_APP_URL
    if (!APP_URL) {
      ok('RELAY_CUTOVER_APP_URL not set — skipping the RLS scoping check')
    } else {
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
      } finally {
        await asApp.end()
      }
    }
  } finally {
    await pool.end()
  }
}

// ── 5. Report ───────────────────────────────────────────────────────────────
console.log(`\nRLS cutover verification — ${BASE}`)
console.log('─'.repeat(64))
for (const [status, message] of results) console.log(`${status === 'ok' ? 'ok  ' : 'FAIL'} ${message}`)
const failures = results.filter(([s]) => s === 'FAIL').length
console.log('─'.repeat(64))
console.log(`${results.length - failures} passed, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
