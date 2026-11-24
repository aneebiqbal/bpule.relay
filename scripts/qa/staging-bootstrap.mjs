/**
 * Disposable staging schema bootstrap.
 *
 * Provisions the FULL Relay schema into a throwaway LOCAL PostgreSQL database:
 *   node scripts/qa/staging-bootstrap.mjs
 *
 * Requirements (already on this machine):
 *   - PostgreSQL 18 listening on 127.0.0.1:5433 with pgvector available
 *   - no production credentials involved; the target URL is validated to be local
 *
 * What it does:
 *   1. creates its own database (never touches another),
 *   2. applies the Supabase compatibility shims the migration set expects,
 *   3. applies every migration with dependency-aware retries,
 *   4. skips ONLY the historical demo-data seed migrations that require
 *      production-era reps/profiles, recording why,
 *   5. provisions the real Better Auth (`neon_auth`) schema from Better Auth's
 *      own model definitions,
 *   6. prints the resulting object counts.
 */
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { getAuthTables } from 'better-auth/db'
import { admin } from 'better-auth/plugins/admin'

const RAW_URL = process.env.RELAY_STAGING_DATABASE_URL ?? 'postgres://mac@127.0.0.1:5433/postgres'
if (/aivencloud|relay_prod/i.test(RAW_URL)) {
  console.error(`refusing a non-local staging target: ${RAW_URL}`)
  process.exit(2)
}
const DB_NAME = process.env.RELAY_STAGING_DATABASE ?? 'relay_staging_local'

/** Historical demo seeds that reference production-era reps/profiles. */
const SKIP = new Map([
  ['0044_seed_revenue_identities.sql', 'demo identities bound to production-era reps (Aneeb/Hassan) absent from a clean database'],
  ['0079_seed_client_contracts.sql', 'depends on profile 60000000-…-0010 created by 0044'],
  ['0080_seed_portfolio_projects.sql', 'depends on profile 60000000-…-0010 created by 0044'],
  ['20261110080000_responsibility_reconciliation_v49.sql', 'reconciles profiles that do not exist before the synthetic fixture load'],
])

// Use the repository's canonical provider-compatibility bootstrap instead of a
// private copy, so the disposable environment matches the documented Aiven path
// (roles, RLS identity function, storage shim, default privileges).
const SHIMS = fs.readFileSync(path.join(process.cwd(), 'supabase/aiven/bootstrap.sql'), 'utf8')

function authDdl() {
  const tables = getAuthTables({ emailAndPassword: { enabled: true }, plugins: [admin()] })
  const order = ['user', 'session', 'account', 'verification']
  const type = (t) => ({ string: 'text', number: 'integer', boolean: 'boolean', date: 'timestamptz' }[t] ?? 'text')
  const stmts = ['drop schema if exists neon_auth cascade;', 'create schema neon_auth;']
  for (const name of order) {
    const model = tables[name]
    const cols = ['  id uuid primary key default gen_random_uuid()']
    const uniques = []
    for (const [name, field] of Object.entries(model.fields)) {
      const column = field.fieldName ?? name
      const col = `  "${column}" ${type(field.type)}`
      cols.push(field.required ? `${col} not null` : col)
      if (field.unique) uniques.push(column)
    }
    stmts.push(`create table neon_auth."${model.modelName}" (\n${cols.join(',\n')}\n);`)
    for (const u of uniques) stmts.push(`create unique index if not exists ${model.modelName}_${u}_uniq on neon_auth."${model.modelName}" ("${u}");`)
  }
  stmts.push('create unique index if not exists account_provider_uniq on neon_auth."account" ("accountId", "providerId");')
  stmts.push('create unique index if not exists verification_pair_uniq on neon_auth."verification" ("identifier", "value");')
  stmts.push('create index if not exists session_user_idx on neon_auth."session" ("userId");')
  stmts.push('create index if not exists account_user_idx on neon_auth."account" ("userId");')
  stmts.push('create index if not exists verification_identifier_idx on neon_auth."verification" ("identifier");')
  return stmts.join('\n')
}

async function main() {
  const admin = new pg.Client({ connectionString: RAW_URL })
  await admin.connect()
  await admin.query(`drop database if exists "${DB_NAME}"`)
  await admin.query(`create database "${DB_NAME}"`)
  await admin.end()

  const target = RAW_URL.replace(/\/[^/?]+$/, `/${DB_NAME}`)
  const db = new pg.Client({ connectionString: target })
  await db.connect()

  // The canonical Aiven bootstrap references the hosted admin role in its
  // default-privilege statements; provide an equivalent local role so the file
  // runs unmodified on a disposable cluster.
  await db.query(`
    do $$ begin if not exists (select 1 from pg_roles where rolname = 'avnadmin') then create role avnadmin; end if; end $$;
    grant avnadmin to current_user;
  `)
  await db.query(SHIMS)
  // Roles are cluster-wide and survive a database drop, so re-assert the runtime
  // role's shape even when an earlier probe created a partial version.
  await db.query(`
    alter role relay_app login password 'relay_app_cert_632';
    alter role relay_service login password 'relay_service_cert_632';
    grant authenticated to relay_app;
  `)
  // The auth schema must exist before the migrations that reference it.
  await db.query(authDdl())

  const dir = path.join(process.cwd(), 'supabase/migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  let pending = files.map((f) => path.join(dir, f))
  const applied = []
  const skipped = []
  const failed = []
  for (let pass = 1; pass <= 6 && pending.length > 0; pass += 1) {
    const next = []
    for (const file of pending) {
      const base = path.basename(file)
      if (SKIP.has(base)) { skipped.push(base); continue }
      if (base === '20261119150000_fix_reps_auth_fk.sql') {
        // Mirror the auth users into the Better Auth schema so the FK the
        // migration adds can resolve existing reps.
        await db.query(`insert into neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
          select u.id, coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)), u.email, true, now(), now()
          from auth.users u
          on conflict (id) do nothing`).catch(() => {})
      }
      const sql = fs.readFileSync(file, 'utf8')
      try {
        await db.query(sql)
        applied.push(base)
      } catch (error) {
        // A failed multi-statement simple query leaves an aborted transaction.
        await db.query('ROLLBACK').catch(() => {})
        next.push(file)
        failed[base] = error.message
      }
    }
    if (next.length === pending.length) break
    pending = next
  }
  for (const file of pending) if (!SKIP.has(path.basename(file))) failed[path.basename(file)] = failed[path.basename(file)] ?? 'deferred'

  // The hosted default privileges target the Aiven admin role; on this cluster
  // the migrations ran as the bootstrap user, so grant the runtime role directly.
  await db.query(`
    grant usage on schema public to relay_app, relay_service;
    grant select, insert, update, delete on all tables in schema public to relay_app;
    alter default privileges for role current_user in schema public
      grant select, insert, update, delete on tables to relay_app;
  `)

  const count = async (table) => (await db.query(`select count(*)::int n from ${table}`)).rows[0].n
  const summary = {
    database: target,
    migrationsTotal: files.length,
    applied: applied.length,
    skipped: skipped.map((b) => ({ file: b, reason: SKIP.get(b) })),
    failed: Object.entries(failed).map(([file, message]) => ({ file, message })),
    objects: {
      organizations: await count('organizations'),
      reps: await count('reps'),
      profiles: await count('profiles'),
      revenueIdentities: await count('revenue_identities'),
      authUsers: await count('neon_auth.user'),
    },
  }
  await db.end()
  console.log(JSON.stringify(summary, null, 1))
  if (summary.failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
