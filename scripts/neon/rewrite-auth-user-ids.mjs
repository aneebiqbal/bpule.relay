#!/usr/bin/env node
/**
 * Rewrite `reps.auth_user_id` from legacy Supabase ids to Neon Auth ids.
 *
 * Neon Auth issues its own user ids, and the application looks a rep up with
 * `.eq('auth_user_id', userId)`. Until this runs, every rep points at a Supabase
 * id that Neon Auth does not know, so nobody can sign in.
 *
 * Safety contract:
 *   - DRY RUN by default; `--apply` is required to write anything.
 *   - IDEMPOTENT: a rep already on its Neon id is left alone, so re-running is
 *     safe and a partially-applied run can be resumed.
 *   - ABORTS on a missing mapping (a rep whose legacy id is not in the map).
 *   - ABORTS on an ambiguous mapping (a Neon id already used by another rep).
 *   - Reports before/after, and never prints a password or a password hash.
 *
 * Usage:
 *   node scripts/neon/rewrite-auth-user-ids.mjs --mapping <auth_mapping.json>
 *   node scripts/neon/rewrite-auth-user-ids.mjs --mapping <...> --apply
 *
 * The target is Neon only. The script refuses to run against a database that
 * has no `neon_auth` schema, and prints the database it is about to touch.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Client } from '@neondatabase/serverless'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const apply = process.argv.includes('--apply')
const mappingPath = arg('mapping', 'auth_mapping.json')

function resolveConnectionString() {
  // Prefer an explicit migration-branch connection, then the app's own var.
  const envFile = path.resolve(process.env.NEON_ENV_FILE ?? 'neon.env')
  if (fs.existsSync(envFile)) {
    const text = fs.readFileSync(envFile, 'utf8')
    const match = /^(NEON_MIG_DIRECT|NEON_TARGET|DATABASE_URL)=(["']?)(.+?)\2\s*$/m.exec(text)
    if (match?.[3]) return match[3].trim()
  }
  const fromEnv = process.env.NEON_MIG_DIRECT ?? process.env.NEON_TARGET ?? process.env.DATABASE_URL
  if (!fromEnv) {
    console.error('No connection string. Set NEON_MIG_DIRECT or pass --url.')
    process.exit(2)
  }
  return fromEnv
}

/** Read the connection string from neon.env without echoing the password. */
function describeConnection(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.pathname}`
  } catch {
    return '<unparseable>'
  }
}

function fail(message) {
  console.error(`\nABORTED: ${message}\n`)
  process.exit(1)
}

// ── 1. Mapping ───────────────────────────────────────────────────────────────

if (!fs.existsSync(mappingPath)) {
  fail(`mapping file not found: ${mappingPath}`)
}

const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'))
const users = Array.isArray(mapping.users) ? mapping.users : []
if (users.length === 0) fail('mapping file contains no users')

const legacyToNeon = new Map()
const neonToLegacy = new Map()
const duplicateLegacy = []
const duplicateNeon = []

for (const row of users) {
  const legacy = row.legacy_supabase_user_id
  const neon = row.neon_auth_user_id
  if (!legacy || !neon) fail(`mapping row is missing an id: ${JSON.stringify(row)}`)
  if (legacyToNeon.has(legacy)) duplicateLegacy.push(legacy)
  if (neonToLegacy.has(neon)) duplicateNeon.push(neon)
  legacyToNeon.set(legacy, neon)
  neonToLegacy.set(neon, legacy)
}

if (duplicateLegacy.length > 0) fail(`duplicate legacy ids in the mapping: ${duplicateLegacy.join(', ')}`)
if (duplicateNeon.length > 0) fail(`duplicate Neon ids in the mapping: ${duplicateNeon.join(', ')}`)

// ── 2. Target ────────────────────────────────────────────────────────────────

const url = resolveConnectionString()
const client = new Client({ connectionString: url })
await client.connect()

/** `Client.query` returns rows directly; normalise so the plan code is plain. */
async function q(text, params) {
  const result = await client.query(text, params)
  return Array.isArray(result) ? result : (result?.rows ?? [])
}

/** Rows affected by an UPDATE, returned as a single `n` column. */
async function updateCount(text, params) {
  const wrapped = `with u as (${text} returning 1) select count(*)::int as n from u`
  const rows = await q(wrapped, params)
  return rows[0]?.n ?? 0
}

let databaseName = ''
let hasNeonAuth = false
try {
  databaseName = (await q('select current_database() as db'))[0].db
  const neonAuth = await q("select to_regclass('neon_auth.user') is not null as present")
  hasNeonAuth = Boolean(neonAuth[0].present)
} catch (error) {
  fail(`could not inspect the target: ${error.message}`)
}

console.log('NEON AUTH ID REWRITE')
console.log('  target      :', describeConnection(url))
console.log('  database    :', databaseName)
console.log('  neon_auth   :', hasNeonAuth ? 'present' : 'MISSING')
console.log('  mapping     :', mappingPath, `(${users.length} users)`)
console.log('  mode        :', apply ? 'APPLY' : 'DRY RUN (no writes)')

if (!hasNeonAuth) {
  await client.end()
  fail('the target has no neon_auth schema, so it is not a Neon Auth database')
}

// ── 3. Plan ──────────────────────────────────────────────────────────────────

const reps = (await q('select id, auth_user_id, name from reps order by created_at'))

const alreadyCorrect = []
const toRewrite = []
const unmappedLegacy = []
const foreignNeon = []
const unknownId = []

for (const rep of reps) {
  const current = rep.auth_user_id
  if (!current) {
    unknownId.push({ rep: rep.id, name: rep.name, reason: 'auth_user_id is null' })
    continue
  }

  if (legacyToNeon.has(current)) {
    const target = legacyToNeon.get(current)
    // A Neon id that already belongs to a different rep is a collision.
    const owner = reps.find((r) => r.auth_user_id === target)
    if (owner && owner.id !== rep.id) {
      foreignNeon.push({ rep: rep.id, name: rep.name, neonId: target, ownedBy: owner.id })
      continue
    }
    if (owner && owner.id === rep.id) alreadyCorrect.push({ rep: rep.id, name: rep.name })
    else toRewrite.push({ rep: rep.id, name: rep.name, from: current, to: target })
    continue
  }

  if (neonToLegacy.has(current)) {
    alreadyCorrect.push({ rep: rep.id, name: rep.name })
    continue
  }

  // Not in the mapping at all.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(current)) {
    unmappedLegacy.push({ rep: rep.id, name: rep.name, id: current })
  } else {
    unknownId.push({ rep: rep.id, name: rep.name, id: current })
  }
}

// ── 4. Report ────────────────────────────────────────────────────────────────

console.log('')
console.log(`  reps total          : ${reps.length}`)
console.log(`  already on Neon id  : ${alreadyCorrect.length}`)
console.log(`  to rewrite          : ${toRewrite.length}`)

if (unmappedLegacy.length > 0) {
  console.log('')
  console.log(`  UNMAPPED legacy ids : ${unmappedLegacy.length}`)
  for (const row of unmappedLegacy) console.log(`    ${row.rep}  ${row.name ?? ''}  ${row.id}`)
}
if (foreignNeon.length > 0) {
  console.log('')
  console.log(`  AMBIGUOUS Neon ids  : ${foreignNeon.length}`)
  for (const row of foreignNeon) {
    console.log(`    ${row.rep}  ${row.name ?? ''}  ${row.neonId} already used by ${row.ownedBy}`)
  }
}
if (unknownId.length > 0) {
  console.log('')
  console.log(`  UNRECOGNIZED ids    : ${unknownId.length}`)
  for (const row of unknownId) console.log(`    ${row.rep}  ${row.name ?? ''}  ${row.id ?? row.reason}`)
}

if (unmappedLegacy.length > 0 || foreignNeon.length > 0) {
  await client.end()
  fail('the plan is not safe to apply; resolve the rows above first')
}

// ── 5. Apply ─────────────────────────────────────────────────────────────────

if (!apply) {
  console.log('')
  console.log('DRY RUN complete. Re-run with --apply to write.')
  await client.end()
  process.exit(0)
}

if (toRewrite.length === 0) {
  console.log('')
  console.log('Nothing to rewrite — every rep is already on its Neon id.')
  await client.end()
  process.exit(0)
}

console.log('')
console.log('Applying…')

// `reps.auth_user_id` has a foreign key to the `auth.users` compatibility
// table. Postgres checks that per statement, so rekeying `auth.users` first
// would momentarily orphan every reps row still pointing at the legacy id.
// Dropping the constraint for the duration keeps the two rekeys atomic.
await q('alter table public.reps drop constraint if exists reps_auth_user_id_fkey')

let rekeyedUsers = 0
for (const row of toRewrite) {
  const res = await updateCount('update auth.users set id = $1 where id = $2', [row.to, row.from])
  rekeyedUsers += res
  await q('update reps set auth_user_id = $1 where id = $2', [row.to, row.rep])
  console.log(`  ${row.rep}  ${row.name ?? ''}`)
}

await q(
  'alter table public.reps add constraint reps_auth_user_id_fkey foreign key (auth_user_id) references auth.users(id)',
)
console.log(`  rekeyed ${rekeyedUsers} auth.users rows`)

// ── 6. Verify ────────────────────────────────────────────────────────────────

const after = (await q('select id, auth_user_id from reps order by created_at'))
const stillLegacy = after.filter((r) => legacyToNeon.has(r.auth_user_id))
const onNeon = after.filter((r) => neonToLegacy.has(r.auth_user_id))
const orphans = after.filter(
  (r) => r.auth_user_id && !neonToLegacy.has(r.auth_user_id) && !legacyToNeon.has(r.auth_user_id),
)

// Every rep must resolve to a real Neon Auth user, and the compatibility table
// must agree with it.
const unresolved = (
  await q(
    `select count(*)::int as n from reps r
       left join neon_auth.user n on n.id = r.auth_user_id
      where n.id is null`,
  )
)[0].n
const fkViolations = (
  await q(
    `select count(*)::int as n from reps r
       left join auth.users u on u.id = r.auth_user_id
      where u.id is null`,
  )
)[0].n

console.log('')
console.log('AFTER')
console.log(`  reps on a Neon id        : ${onNeon.length}`)
console.log(`  still on a legacy id     : ${stillLegacy.length}`)
console.log(`  unrecognized ids         : ${orphans.length}`)
console.log(`  reps with no Neon user   : ${unresolved}`)
console.log(`  reps with no auth.users  : ${fkViolations}`)

await client.end()

if (stillLegacy.length > 0 || orphans.length > 0 || unresolved > 0 || fkViolations > 0) {
  fail('the rewrite did not converge; inspect the rows above')
}

console.log('')
console.log('OK — every rep points at its Neon Auth user id.')
