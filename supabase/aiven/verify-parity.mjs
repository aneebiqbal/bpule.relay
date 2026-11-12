#!/usr/bin/env node
/**
 * Data + schema parity verification: Neon (source) vs Aiven (target).
 * Sections 5-8. Read-only.
 *
 * Usage:
 *   node verify-parity.mjs <neon-url> <aiven-url>
 */
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

const neonUrl = process.argv[2] ?? process.env.NEON_DATABASE_URL
const aivenUrl = process.argv[3] ?? process.env.AIVEN_TARGET_URL
if (!neonUrl || !aivenUrl) {
  console.error('usage: node verify-parity.mjs <neon-url> <aiven-url>')
  process.exit(1)
}

const ssl = { rejectUnauthorized: false }
const neon = new Client({ connectionString: neonUrl, ssl })
const aiven = new Client({ connectionString: aivenUrl, ssl })
await neon.connect()
await aiven.connect()

const failures = []
const notes = []

// ---- schema ----------------------------------------------------------------
async function schema(c) {
  const tables = await c.query(
    `select table_name from information_schema.tables where table_schema='public' order by 1`,
  )
  const cols = await c.query(
    `select table_name, column_name, data_type from information_schema.columns where table_schema='public'`,
  )
  const colMap = new Map()
  for (const r of cols.rows) {
    if (!colMap.has(r.table_name)) colMap.set(r.table_name, new Map())
    colMap.get(r.table_name).set(r.column_name, r.data_type)
  }
  const policies = await c.query(
    `select tablename, policyname from pg_policies where schemaname='public' order by 1,2`,
  )
  const funcs = await c.query(
    `select p.proname, pg_get_function_identity_arguments(p.oid) as args
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' order by 1,2`,
  )
  const rls = await c.query(
    `select tablename from pg_tables where schemaname='public' and rowsecurity order by 1`,
  )
  const migrations = await c.query(
    `select version from supabase_migrations.schema_migrations order by 1`,
  )
  return {
    tables: tables.rows.map((r) => r.table_name),
    colMap,
    policies: policies.rows.map((r) => `${r.tablename}:${r.policyname}`),
    funcs: funcs.rows.map((r) => `${r.proname}(${r.args})`),
    rls: rls.rows.map((r) => r.tablename),
    migrations: migrations.rows.map((r) => r.version),
  }
}

const sNeon = await schema(neon)
const sAiven = await schema(aiven)

console.log('== schema parity ==')
for (const [label, a, b] of [
  ['tables', sNeon.tables, sAiven.tables],
  ['policies', sNeon.policies, sAiven.policies],
  ['functions', sNeon.funcs, sAiven.funcs],
  ['rls_tables', sNeon.rls, sAiven.rls],
  ['migrations', sNeon.migrations, sAiven.migrations],
]) {
  const missing = a.filter((x) => !b.includes(x))
  const extra = b.filter((x) => !a.includes(x))
  const status = missing.length === 0 && extra.length === 0 ? 'PASS' : 'DIFF'
  console.log(`${status} ${label}: neon=${a.length} aiven=${b.length}`)
  if (missing.length) {
    failures.push(`${label} missing on Aiven: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ` (+${missing.length - 20})` : ''}`)
  }
  if (extra.length) notes.push(`${label} extra on Aiven: ${extra.slice(0, 20).join(', ')}${extra.length > 20 ? ` (+${extra.length - 20})` : ''}`)
}

// column-level diff on shared tables
const colDiffs = []
for (const t of sNeon.tables) {
  const a = sNeon.colMap.get(t)
  const b = sAiven.colMap.get(t)
  if (!b) continue
  for (const [col, type] of a) {
    if (!b.has(col)) colDiffs.push(`${t}.${col} (${type})`)
    else if (b.get(col) !== type) colDiffs.push(`${t}.${col} type neon=${type} aiven=${b.get(col)}`)
  }
}
console.log(`${colDiffs.length === 0 ? 'PASS' : 'DIFF'} columns: ${colDiffs.length} differences`)
if (colDiffs.length) {
  failures.push(`column differences: ${colDiffs.slice(0, 30).join(', ')}`)
}

// ---- row counts ------------------------------------------------------------
console.log('\n== row count parity ==')
const snapshotRows = JSON.parse(
  readFileSync(new URL('./neon-source-snapshot.json.rows', import.meta.url), 'utf8'),
)
const tables = sNeon.tables.filter((t) => sAiven.tables.includes(t))
let drift = 0
for (const t of tables) {
  const n = (await neon.query(`select count(*)::bigint as c from "${t}"`)).rows[0].c
  const a = (await aiven.query(`select count(*)::bigint as c from "${t}"`)).rows[0].c
  if (n !== a) {
    const snap = snapshotRows[t]
    if (typeof snap === 'number' && Math.abs(snap - a) <= 1) {
      notes.push(`post-snapshot drift ${t}: neon_now=${n} aiven=${a} snapshot=${snap} (writes after the dump)`)
      console.log(`DRIFT(explained) ${t}: neon_now=${n} aiven=${a} snapshot=${snap}`)
    } else {
      drift++
      failures.push(`row drift ${t}: neon=${n} aiven=${a} diff=${n - a}`)
      console.log(`DIFF ${t}: neon=${n} aiven=${a} diff=${n - a}`)
    }
  }
}
console.log(`${drift === 0 ? 'PASS' : 'DIFF'} row counts: ${tables.length} tables, ${drift} unexplained drifted`)

// ---- high-value aggregates -------------------------------------------------
console.log('\n== high-value aggregates ==')
const agg = [
  'profiles', 'revenue_identities', 'leads', 'messages', 'assigned_tasks',
  'action_events', 'daily_target_plans', 'daily_accountability',
  'coverage_assignments', 'responsibility_acknowledgements', 'upwork_jobs',
  'upwork_applications', 'captured_prospects', 'provider_saved_searches',
  'contact_points',
]
for (const t of agg) {
  if (!sNeon.tables.includes(t) || !sAiven.tables.includes(t)) {
    notes.push(`aggregate skipped (table absent): ${t}`)
    continue
  }
  const n = (await neon.query(`select count(*)::bigint as c from "${t}"`)).rows[0].c
  const a = (await aiven.query(`select count(*)::bigint as c from "${t}"`)).rows[0].c
  console.log(`${n === a ? 'PASS' : 'DIFF'} ${t}: neon=${n} aiven=${a}`)
  if (n !== a) failures.push(`aggregate drift ${t}: neon=${n} aiven=${a}`)
}

// ---- referential integrity (section 8) ------------------------------------
console.log('\n== identity / profile integrity ==')
const checks = [
  ['broken sender profile refs', `select count(*)::bigint from leads l left join profiles p on p.id=l.sender_profile_id where l.sender_profile_id is not null and p.id is null`],
  ['broken identity refs', `select count(*)::bigint from identity_assignments ia left join revenue_identities ri on ri.id=ia.revenue_identity_id where ri.id is null`],
  ['orphan organizations', `select count(*)::bigint from profiles p left join organizations o on o.id=p.organization_id where o.id is null`],
]
for (const [label, sql] of checks) {
  const n = (await neon.query(sql)).rows[0].count
  const a = (await aiven.query(sql)).rows[0].count
  const ok = n === a
  console.log(`${ok ? 'PASS' : 'DIFF'} ${label}: neon=${n} aiven=${a}`)
  if (!ok) failures.push(`integrity drift ${label}: neon=${n} aiven=${a}`)
}

await neon.end()
await aiven.end()

console.log('\n== summary ==')
if (notes.length) console.log('NOTES:\n' + notes.map((n) => `  - ${n}`).join('\n'))
if (failures.length) {
  console.log('FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log('PARITY: PASS')
