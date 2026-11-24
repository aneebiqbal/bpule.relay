#!/usr/bin/env node
/**
 * Production test-workspace cleanup for the LIVE Aiven Postgres database.
 *
 * The old Supabase-REST cleanup scripts no longer match production. This tool
 * scopes deletion to whole non-production tenant organizations and everything
 * that belongs to them, and never touches the kept organization.
 *
 *   node scripts/qa/relay-test-cleanup-pg.mjs                 # DRY-RUN (reads only)
 *   node scripts/qa/relay-test-cleanup-pg.mjs --apply         # execute in one transaction
 *
 * Safety:
 *   - the kept org defaults to bpulse (11111111-…) and can be overridden with --keep
 *   - deleting requires RELAY_CLEANUP_CONFIRM=delete-test-workspaces as well as --apply
 *   - non-CASCADE foreign keys are discovered from the catalog and cleared first,
 *     so a restricted child row cannot silently block or survive the delete
 *   - --apply runs in a transaction and rolls back unless every verification passes
 *
 * Take a restorable dump before --apply. Aiven backups are not a point-in-time
 * guarantee for a live database.
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

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}
const apply = process.argv.includes('--apply')
const keep = arg('--keep') || '11111111-1111-1111-1111-111111111111'
const client = new pg.Client({ connectionString: url, ssl })

const ident = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`refusing suspicious identifier: ${name}`)
  return `"${name}"`
}

/** Every foreign key in the catalog, with its delete rule. */
async function loadForeignKeys() {
  const { rows } = await client.query(`
    select ns.nspname as child_schema, cl.relname as child, att.attname as col,
           pns.nspname as parent_schema, pcl.relname as parent, patt.attname as parent_col,
           con.confdeltype as rule
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_class pcl on pcl.oid = con.confrelid
    join pg_namespace pns on pns.oid = pcl.relnamespace
    join unnest(con.conkey) with ordinality as ck(attnum, ord) on true
    join pg_attribute att on att.attrelid = cl.oid and att.attnum = ck.attnum
    join unnest(con.confkey) with ordinality as fk(attnum, ord) on fk.ord = ck.ord
    join pg_attribute patt on patt.attrelid = pcl.oid and patt.attnum = fk.attnum
    where con.contype = 'f'
  `)
  return rows.map((r) => ({
    ...r,
    cascade: r.rule === 'c',
    table: `${ident(r.child_schema)}.${ident(r.child)}`,
    parentTable: `${ident(r.parent_schema)}.${ident(r.parent)}`,
  }))
}

async function main() {
  await client.connect()

  const orgs = (
    await client.query('select id, name from organizations order by created_at')
  ).rows
  const targets = orgs.filter((o) => o.id !== keep)
  if (!targets.length) {
    console.log(`nothing to do — every organization is the kept org ${keep}`)
    return await client.end()
  }
  const targetOrgIds = targets.map((o) => o.id)

  const reps = (
    await client.query('select id, name, auth_user_id from reps where organization_id = any($1)', [
      targetOrgIds,
    ])
  ).rows
  const repIds = reps.map((r) => r.id)
  const userIds = [...new Set(reps.map((r) => r.auth_user_id).filter(Boolean))]
  const profiles = repIds.length
    ? (
        await client.query('select id from profiles where rep_id = any($1)', [repIds])
      ).rows
    : []
  const profileIds = profiles.map((p) => p.id)

  console.log(`kept org: ${keep}`)
  console.log(
    `targets: ${targets.length} orgs, ${repIds.length} reps, ${profileIds.length} profiles, ${userIds.length} auth users`,
  )
  for (const o of targets) console.log(`  ${o.id}  ${o.name}`)

  const fks = await loadForeignKeys()
  if (process.env.RELAY_CLEANUP_DEBUG) {
    console.error(`DEBUG fks=${fks.length} sample=${JSON.stringify(fks.find((f) => f.parent === 'reps') ?? fks[0])}`)
  }
  const seeds = [
    { table: '"public"."organizations"', ids: targetOrgIds, label: 'organization' },
    { table: '"public"."reps"', ids: repIds, label: 'rep' },
    { table: '"public"."profiles"', ids: profileIds, label: 'profile' },
    { table: '"neon_auth"."user"', ids: userIds, label: 'user' },
  ]

  // Restricted children of the seeds: clear them first so the parent delete
  // cannot be blocked. CASCADE children ride along with the parent delete.
  const plan = []
  for (const fk of fks) {
    if (fk.cascade) continue
    const seed = seeds.find((s) => s.table === fk.parentTable && s.ids.length)
    if (!seed) continue
    const [table, where] = [`${fk.table}`, `${ident(fk.col)} in (select ${ident(fk.parent_col)} from ${fk.parentTable} where ${ident(fk.parent_col)} = any($1))`]
    plan.push({ sql: `delete from ${table} where ${where}`, table, where, ids: seed.ids, label: `${fk.table} via ${fk.col}` })
  }

  console.log(`\nrestricted children to clear: ${plan.length}`)
  const counts = []
  for (const step of plan) {
    const { rows } = await client.query(`select count(*)::int as n from ${step.table} where ${step.where}`, [step.ids])
    counts.push({ label: step.label, n: rows[0].n })
  }
  for (const c of counts.filter((c) => c.n > 0)) console.log(`  ${c.label}: ${c.n}`)

  console.log('\ndelete order:')
  for (const c of [...counts].sort((a, b) => b.n - a.n)) console.log(`  ${c.label}: ${c.n}`)
  console.log(`  public."reps": ${repIds.length}`)
  console.log(`  neon_auth."user": ${userIds.length}`)
  console.log(`  public."organizations": ${targetOrgIds.length}`)

  if (!apply) {
    console.log('\nDRY-RUN — no rows were changed.')
    console.log('before --apply: take a restorable dump, then run with RELAY_CLEANUP_CONFIRM=delete-test-workspaces --apply')
    return await client.end()
  }

  if (process.env.RELAY_CLEANUP_CONFIRM !== 'delete-test-workspaces') {
    console.error('REFUSING: set RELAY_CLEANUP_CONFIRM=delete-test-workspaces to apply')
    process.exitCode = 1
    return await client.end()
  }

  await client.query('begin')
  try {
    for (const step of plan) {
      await client.query(step.sql, [step.ids])
    }
    if (repIds.length) await client.query('delete from public."reps" where id = any($1)', [repIds])
    if (userIds.length) await client.query('delete from neon_auth."user" where id = any($1)', [userIds])
    await client.query('delete from public."organizations" where id = any($1)', [targetOrgIds])

    const leftOrgs = (
      await client.query('select count(*)::int as n from organizations where id = any($1)', [targetOrgIds])
    ).rows[0].n
    const leftReps = (
      await client.query('select count(*)::int as n from reps where id = any($1)', [repIds])
    ).rows[0].n
    const leftUsers = (
      await client.query('select count(*)::int as n from neon_auth."user" where id = any($1)', [userIds])
    ).rows[0].n
    const keptLeads = (
      await client.query('select count(*)::int as n from leads where organization_id = $1', [keep])
    ).rows[0].n
    if (leftOrgs || leftReps || leftUsers) {
      throw new Error(`verification failed: orgs=${leftOrgs} reps=${leftReps} users=${leftUsers}`)
    }
    await client.query('commit')
    console.log(`\nAPPLY COMPLETE. kept org leads=${keptLeads}`)
  } catch (err) {
    await client.query('rollback')
    throw err
  }
  await client.end()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
