#!/usr/bin/env node
/**
 * Read-only test-data inventory for the LIVE Aiven Postgres database.
 *
 * The older scripts in this folder (relay-test-manifest.mjs / qa-cleanup.mjs)
 * speak Supabase PostgREST and no longer match production, which is now Aiven
 * Postgres (RELAY_DB_PROVIDER=postgres). This tool is the read-only half of the
 * replacement: it classifies rows by explicit provenance only and never writes.
 *
 *   node scripts/qa/relay-test-inventory-pg.mjs            # summary
 *   node scripts/qa/relay-test-inventory-pg.mjs --leads    # confirmed-test lead detail
 *   node scripts/qa/relay-test-inventory-pg.mjs --reps     # rep roster with test-lead counts
 *
 * Classification (mirrors the immutable-manifest rules):
 *   CONFIRMED_TEST  is_test = true OR source_kind in (E2E,TEST,DEMO,QA,SYNTHETIC)
 *   CONFIRMED_REAL  is_test = false AND source_kind = 'PRODUCTION'
 *   AMBIGUOUS_KEEP  anything else — never deleted.
 */
import pg from 'pg'
import { config } from 'dotenv'

config({ path: '.env.local' })

const url = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('SERVICE_DATABASE_URL is required')
  process.exit(1)
}

const ssl =
  process.env.DATABASE_SSL === 'false'
    ? undefined
    : {
        rejectUnauthorized:
          process.env.DATABASE_SSL_VERIFY === 'true' || process.env.DATABASE_SSL_CA ? true : false,
        ca: process.env.DATABASE_SSL_CA || undefined,
      }

const TEST_KINDS = ['E2E', 'TEST', 'DEMO', 'QA', 'SYNTHETIC']
const client = new pg.Client({ connectionString: url, ssl })

const isTestSql = `(is_test = true OR source_kind IN (${TEST_KINDS.map((k) => `'${k}'`).join(',')}))`
const isRealSql = `(is_test = false AND source_kind = 'PRODUCTION')`

async function counts(table) {
  const { rows } = await client.query(
    `select count(*)::int as total,
            count(*) filter (where ${isTestSql})::int as confirmed_test,
            count(*) filter (where ${isRealSql})::int as confirmed_real,
            count(*) filter (where not (${isTestSql}) and not (${isRealSql}))::int as ambiguous
     from ${table}`,
  )
  return rows[0]
}

async function main() {
  await client.connect()

  const orgs = (await client.query('select id, name from organizations order by created_at')).rows
  console.log(`organizations: ${orgs.length}`)
  for (const o of orgs) console.log(`  ${o.id}  ${o.name}`)

  console.log('\n== classification ==')
  for (const t of ['leads', 'captured_prospects', 'intelligence_samples']) {
    console.log(`${t}: ${JSON.stringify(await counts(t))}`)
  }
  const shadow = await client.query(
    `select count(*) filter (where is_test)::int as test,
            count(*) filter (where not is_test)::int as real,
            count(*)::int as total
     from scoring_shadow_decisions`,
  )
  console.log(`scoring_shadow_decisions: ${JSON.stringify(shadow.rows[0])}`)

  console.log('\n== lead children that can block deletion (confirmed-test leads) ==')
  const blockers = await client.query(
    `select
       count(*) filter (where exists (select 1 from few_shot_wins f where f.lead_id = l.id))::int as with_few_shot_wins,
       count(*) filter (where exists (select 1 from golden_set g where g.lead_id = l.id))::int as with_golden_set,
       count(*) filter (where exists (select 1 from outcomes o where o.lead_id = l.id))::int as with_outcomes,
       count(*) filter (where exists (select 1 from messages m where m.lead_id = l.id))::int as with_messages,
       count(*)::int as confirmed_test_leads
     from leads l where ${isTestSql}`,
  )
  console.log(JSON.stringify(blockers.rows[0]))

  if (process.argv.includes('--leads')) {
    const { rows } = await client.query(
      `select l.id, l.company, l.owner_rep_id, r.name as owner, l.source_kind, l.is_test, l.created_at,
              (select count(*) from messages m where m.lead_id = l.id)::int as messages
       from leads l left join reps r on r.id = l.owner_rep_id
       where ${isTestSql}
       order by l.created_at desc
       limit 400`,
    )
    console.log(`\n== confirmed-test leads (${rows.length} shown) ==`)
    for (const r of rows) {
      console.log(`${r.created_at?.toISOString()?.slice(0, 10)}  ${String(r.company).slice(0, 34).padEnd(34)}  ${String(r.owner ?? '-').padEnd(12)}  ${r.source_kind.padEnd(9)}  msgs=${r.messages}  ${r.id}`)
    }
  }

  if (process.argv.includes('--reps')) {
    const { rows } = await client.query(
      `select r.id, r.name, r.role, r.organization_id, u.email,
              count(l.id)::int as leads,
              count(l.id) filter (where ${isTestSql})::int as test_leads,
              count(l.id) filter (where ${isRealSql})::int as real_leads,
              r.created_at
       from reps r
       left join leads l on l.owner_rep_id = r.id
       left join neon_auth."user" u on u.id = r.auth_user_id
       group by r.id, r.name, r.role, r.organization_id, u.email, r.created_at
       order by test_leads desc, r.created_at`,
    )
    console.log(`\n== reps (${rows.length}) ==`)
    for (const r of rows) {
      console.log(`${String(r.name).padEnd(18)} ${String(r.role).padEnd(7)} ${String(r.email ?? '-').padEnd(26)} leads=${String(r.leads).padStart(4)} test=${String(r.test_leads).padStart(4)} real=${String(r.real_leads).padStart(4)}  ${r.id}`)
    }
  }

  await client.end()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
