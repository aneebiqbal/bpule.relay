/**
 * Real-PostgreSQL RLS adversarial certification against the disposable staging
 * database. Connects as the RUNTIME role (`relay_app`, member of `authenticated`)
 * and switches the transaction-local `app.current_user_id` GUC — exactly the
 * boundary the application uses. Application-layer HTTP 404s are NOT accepted as
 * evidence here.
 *
 *   node scripts/qa/rls-adversarial-staging.mjs
 */
import pg from 'pg'

const BASE = process.env.RELAY_STAGING_DATABASE_URL ?? 'postgres://mac@127.0.0.1:5433/postgres'
const DB = process.env.RELAY_STAGING_DATABASE ?? 'relay_staging_local'
const TARGET = BASE.replace(/\/[^/?]+$/, `/${DB}`)
if (/aivencloud|relay_prod/i.test(TARGET)) {
  console.error(`refusing a non-local RLS target: ${TARGET}`)
  process.exit(2)
}

const ORG_A = '0a000000-4000-8000-0000-000000000001'
const ORG_B = '0b000000-4000-8000-0000-000000000001'
const MANAGER_A = '0a000000-4000-8000-0000-000000000003'
const MEMBER_B = '0b000000-4000-8000-0000-000000000014'
const FOREIGN_LEAD = '1a000000-4000-8000-0000-000000000063' // owned by org B

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function runtime() {
  const url = new URL(TARGET)
  url.username = 'relay_app'
  url.password = 'relay_app_cert_632'
  return new pg.Client({ connectionString: url.toString() })
}

async function as(userId, fn) {
  const client = runtime()
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', userId])
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

const count = (client, table, extra = '') =>
  client.query(`select count(*)::int n from ${table} ${extra}`).then((r) => r.rows[0].n)

async function main() {
  const admin = new pg.Client({ connectionString: TARGET })
  await admin.connect()
  const totalLeads = (await admin.query('select count(*)::int n from leads')).rows[0].n
  const totalStates = (await admin.query('select count(*)::int n from conversation_states')).rows[0].n
  const totalIdentities = (await admin.query('select count(*)::int n from revenue_identities')).rows[0].n

  // ── SELECT isolation ──────────────────────────────────────────────────────
  const identity = await as(MANAGER_A, async (c) => {
    const r = await c.query('select current_user, rolsuper from pg_roles where rolname = current_user')
    return r.rows[0]
  })
  check('harness connects as the runtime role, not a superuser', identity?.current_user === 'relay_app' && identity?.rolsuper === false, JSON.stringify(identity))

  const a = await as(MANAGER_A, async (c) => ({
    leads: await count(c, 'leads'),
    states: await count(c, 'conversation_states'),
    identities: await count(c, 'revenue_identities'),
    foreignLead: await count(c, 'leads', `where id = '${FOREIGN_LEAD}'`),
  }))
  const b = await as(MEMBER_B, async (c) => ({
    leads: await count(c, 'leads'),
    states: await count(c, 'conversation_states'),
    identities: await count(c, 'revenue_identities'),
  }))
  check('org A sees only its own leads', a.leads > 0 && a.leads < totalLeads, `${a.leads}/${totalLeads}`)
  check('org B sees only its own leads', b.leads > 0 && b.leads < totalLeads, `${b.leads}/${totalLeads}`)
  check('org A and org B lead sets are disjoint', a.leads + b.leads <= totalLeads, `${a.leads}+${b.leads} vs ${totalLeads}`)
  check('org A conversation states are org-scoped', a.states > 0 && a.states < totalStates, `${a.states}/${totalStates}`)
  check('org A revenue identities are org-scoped', a.identities > 0 && a.identities < totalIdentities, `${a.identities}/${totalIdentities}`)
  check('direct cross-org lead id is invisible', a.foreignLead === 0, `rows=${a.foreignLead}`)

  // ── UPDATE / DELETE boundaries ────────────────────────────────────────────
  const upd = await as(MANAGER_A, (c) =>
    c.query(`update leads set company = 'HACKED' where id = '${FOREIGN_LEAD}'`).then((r) => r.rowCount),
  )
  check('cross-org UPDATE affects zero rows', upd === 0, `rowCount=${upd}`)
  const del = await as(MANAGER_A, (c) =>
    c.query(`delete from leads where id = '${FOREIGN_LEAD}'`).then((r) => r.rowCount),
  )
  check('cross-org DELETE affects zero rows', del === 0, `rowCount=${del}`)

  // ── INSERT with a forged organization_id ──────────────────────────────────
  let forged = 'no-error'
  try {
    await as(MANAGER_A, (c) =>
      c.query(
        `insert into leads (id, organization_id, owner_rep_id, company, contact_name, status, source, archived, is_test)
         values ('2a000000-4000-8000-0000-0000000000aa', $1, $2, 'Forged Co', 'X', 'new', 'linkedin', false, false)`,
        [ORG_B, MEMBER_B],
      ),
    )
  } catch (error) {
    forged = /row-level security/i.test(error.message) ? 'blocked-by-rls' : `other:${error.message}`
  }
  check('forged organization_id INSERT is blocked by RLS', forged === 'blocked-by-rls', forged)
  const forgedRows = (await admin.query(`select count(*)::int n from leads where id = '2a000000-4000-8000-0000-0000000000aa'`)).rows[0].n
  check('forged row was not written', forgedRows === 0, `rows=${forgedRows}`)

  // ── Forged / unknown identity ─────────────────────────────────────────────
  const unknown = await as('99999999-4000-8000-0000-000000000099', (c) => count(c, 'leads'))
  check('unknown user id sees nothing', unknown === 0, `rows=${unknown}`)
  const empty = await as('', (c) => count(c, 'leads'))
  check('empty identity sees nothing', empty === 0, `rows=${empty}`)

  // ── Transaction-local context ────────────────────────────────────────────
  const switching = await as(MANAGER_A, async (c) => {
    const before = await count(c, 'leads')
    await c.query('SELECT set_config($1, $2, true)', ['app.current_user_id', MEMBER_B])
    const after = await count(c, 'leads')
    return { before, after }
  })
  check('identity switch inside a transaction changes scope', switching.before !== switching.after, JSON.stringify(switching))

  // ── Policy coverage on the critical tenant tables ─────────────────────────
  const policyCheck = await admin.query(
    `select c.relname, c.relrowsecurity as rls,
            count(p.policyname)::int as policies
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
      where n.nspname = 'public'
        and c.relname in ('leads','conversation_states','revenue_identities','daily_target_plans','profile_coverage')
      group by c.relname, c.relrowsecurity`,
  )
  for (const row of policyCheck.rows) {
    check(`${row.relname} has RLS enabled and policies`, row.rls === true && row.policies > 0, `rls=${row.rls} policies=${row.policies}`)
  }

  // ── SECURITY DEFINER / search_path audit ──────────────────────────────────
  const fns = await admin.query(
    `select n.nspname as schema, p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig,
            pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','auth') and p.proname in ('current_org_id','current_rep_id','is_org_admin','uid')`,
  )
  for (const row of fns.rows) {
    if (row.proname === 'uid') {
      // auth.uid() must derive identity only from request context; it must not
      // read any relation, so a search_path would be meaningless rather than
      // unsafe.
      check('auth.uid derives identity without touching relations', !/\bfrom\s+\w/i.test(row.def) && /current_setting/.test(row.def), row.schema)
    } else {
      check(`${row.proname} is SECURITY DEFINER`, row.prosecdef === true, `owner=${row.owner}`)
      check(`${row.proname} pins search_path`, /search_path/.test(row.proconfig ?? ''), row.proconfig ?? '(none)')
    }
  }

  // ── Work Setup revision conflict on real PostgreSQL ───────────────────────
  const { postgresServiceDbClient } = await import('../../src/lib/db/postgres.ts')
  const { saveWorkSetup, computeAccountRevision } = await import('../../src/lib/operations/work-setup-write.ts')

  const service = postgresServiceDbClient()
  const identityRow = (
    await admin.query(
      `select ri.id, ri.profile_id, ri.identity_name,
              (select rep_id from profile_coverage pc where pc.profile_id = ri.profile_id and pc.role = 'PRIMARY' and pc.active limit 1) as primary_rep
         from revenue_identities ri where ri.organization_id = $1 and ri.status = 'active'
        order by ri.identity_name limit 1`,
      [ORG_A],
    )
  ).rows[0]
  check('a seeded account exists for the writer test', Boolean(identityRow), identityRow?.identity_name ?? '')

  if (identityRow) {
    const lanes = (
      await admin.query(
        `select activity_type, target_count from daily_target_plans
          where organization_id = $1 and revenue_identity_id = $2 and active
          order by activity_type`,
        [ORG_A, identityRow.id],
      )
    ).rows
    const operators = (
      await admin.query(
        `select rep_id from profile_coverage where profile_id = $1 and role = 'OPERATOR' and active`,
        [identityRow.profile_id],
      )
    ).rows
    const revision = await computeAccountRevision(service, ORG_A, identityRow.id, identityRow.profile_id)
    const payload = {
      orgId: ORG_A,
      identityId: identityRow.id,
      primaryRepId: identityRow.primary_rep,
      operators: operators.map((o) => ({ repId: o.rep_id })),
      backups: [],
      actorRepId: MANAGER_A,
      targets: lanes.map((l) => ({ activityType: l.activity_type, targetCount: Number(l.target_count) })),
      expectedRevision: revision ?? undefined,
    }
    const first = await saveWorkSetup(service, payload)
    check('first write with the current revision succeeds', first.ok === true, JSON.stringify(first).slice(0, 160))
    const stale = await saveWorkSetup(service, payload)
    check('replayed stale revision returns CONFLICT', stale.code === 'CONFLICT', JSON.stringify(stale).slice(0, 160))
    const stillThere = await admin.query(`select count(*)::int n from daily_target_plans where revenue_identity_id = $1`, [identityRow.id])
    check('account remains intact after the conflict', stillThere.rows[0].n === lanes.length, `${stillThere.rows[0].n}/${lanes.length} lanes`)
  }

  // ── Organization isolation of the canonical writer ────────────────────────
  const otherOrgIdentity = (
    await admin.query(`select id, profile_id from revenue_identities where organization_id = $1 limit 1`, [ORG_B])
  ).rows[0]
  if (otherOrgIdentity) {
    const foreign = await saveWorkSetup(service, {
      orgId: ORG_A,
      identityId: otherOrgIdentity.id,
      primaryRepId: MANAGER_A,
      operators: [],
      backups: [],
      actorRepId: MANAGER_A,
      targets: [],
      allocations: [],
    }).catch((e) => ({ ok: false, error: e.message }))
    check('canonical writer refuses an identity owned by another organization', foreign.ok !== true, JSON.stringify(foreign).slice(0, 160))
  }

  await admin.end()

  const failed = results.filter((r) => !r.ok)
  const summary = {
    generatedAt: new Date().toISOString(),
    target: TARGET,
    role: 'relay_app (member of authenticated)',
    checks: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
  }
  console.log(JSON.stringify(summary, null, 1))
  process.exitCode = failed.length === 0 ? 0 : 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
