#!/usr/bin/env node
/**
 * Apply every pending numbered migration to the configured database.
 *
 * Provider-agnostic: uses the installed `pg` driver, so it runs on the VPS with
 * no `psql` binary and no repository checkout beyond this script and the
 * `supabase/migrations` directory.
 *
 *   RELAY_DDL_DATABASE_URL=... node scripts/apply-migrations.mjs
 *
 * The DDL connection must be an owner-level role. The restricted app/service
 * roles are DML-only on Aiven, so this script FAILS CLOSED unless a dedicated
 * owner URL is supplied (and refuses to reuse the app/service credentials).
 *
 * Each migration runs in ONE transaction together with its version insert, so a
 * failure rolls back instead of leaving half the schema behind. Already-recorded
 * versions are skipped; a failed migration is left unrecorded for a later retry.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

// Fail closed: schema changes require the owner-level DDL connection. Reusing
// the restricted app/service role produced "permission denied for schema public"
// on a production deploy attempt, so it is now an explicit configuration error.
const url = process.env.RELAY_DDL_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL
if (!url) {
  console.error(
    'RELAY_DDL_DATABASE_URL (owner-level DDL connection) is required to apply migrations.\n' +
      'The app/service roles are DML-only and cannot create tables or alter existing ones.',
  )
  process.exit(1)
}
if (url === process.env.SERVICE_DATABASE_URL || url === process.env.DATABASE_URL) {
  console.error(
    'RELAY_DDL_DATABASE_URL must not be the restricted SERVICE_DATABASE_URL/DATABASE_URL.\n' +
      'Provide the owner connection (avnadmin / postgres) used for schema changes.',
  )
  process.exit(1)
}

// Same TLS policy as src/lib/db/ssl.ts: Aiven presents a private CA. Verification
// turns on when DATABASE_SSL_CA is present; otherwise we keep the historical
// insecure mode so a deployment without the CA still connects.
function resolveSsl() {
  if (process.env.DATABASE_SSL === 'false') return undefined
  const caRaw = process.env.DATABASE_SSL_CA ?? ''
  const caPresent = caRaw.trim().length > 0
  const verify = process.env.DATABASE_SSL_VERIFY === 'true' || (process.env.DATABASE_SSL_VERIFY !== 'false' && caPresent)
  if (!verify) return { rejectUnauthorized: false }
  const ca = caPresent ? (caRaw.includes('-----BEGIN') ? caRaw : readFileSync(caRaw, 'utf8')) : undefined
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const pool = new pg.Pool({ connectionString: url, max: 1, ssl: resolveSsl() })

const FILE_PATTERN = /^(\d+)_.*\.sql$/

async function main() {
  const privilege = await pool.query(
    `select has_schema_privilege(current_user, 'public', 'CREATE') as can_create,
            current_user as role`,
  )
  const guard = privilege.rows[0]
  console.log(`migration role: ${guard.role} (schema public CREATE=${guard.can_create})`)
  if (!guard.can_create) {
    console.error(
      `Role "${guard.role}" cannot create in schema public. Re-run with RELAY_DDL_DATABASE_URL pointing at the owner role.`,
    )
    await pool.end()
    process.exit(1)
  }

  // relay_service is DML-only on Aiven: no CREATE on the database or schema.
  // Only bootstrap when absent, so a fully-migrated production database does
  // not require DDL privileges to be read and verified.
  const schemaExists =
    (await pool.query(`select 1 from pg_namespace where nspname = 'supabase_migrations'`)).rows.length > 0
  if (!schemaExists) await pool.query('create schema supabase_migrations')

  const tableExists = (
    await pool.query(
      `select 1 from pg_tables where schemaname = 'supabase_migrations' and tablename = 'schema_migrations'`,
    )
  ).rows.length > 0
  if (!tableExists) {
    await pool.query(`
      create table supabase_migrations.schema_migrations (
        version text primary key,
        installed_at timestamptz not null default now()
      );
    `)
  }

  const recorded = new Set(
    (await pool.query('select version from supabase_migrations.schema_migrations')).rows.map((row) => row.version),
  )

  const files = readdirSync(migrationsDir)
    .filter((name) => FILE_PATTERN.test(name))
    .sort()

  let applied = 0
  let skipped = 0
  let failed = 0

  for (const name of files) {
    const version = name.match(FILE_PATTERN)[1]
    if (recorded.has(version)) {
      skipped += 1
      continue
    }
    const sql = readFileSync(join(migrationsDir, name), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query(
        'insert into supabase_migrations.schema_migrations (version) values ($1) on conflict (version) do nothing',
        [version],
      )
      await client.query('commit')
      console.log(`applied ${name}`)
      applied += 1
    } catch (error) {
      await client.query('rollback').catch(() => {})
      console.error(`FAILED ${name}: ${error instanceof Error ? error.message : String(error)}`)
      failed += 1
    } finally {
      client.release()
    }
  }

  console.log(`\napplied=${applied} skipped=${skipped} failed=${failed}`)
  await pool.end()
  process.exitCode = failed === 0 ? 0 : 1
}

main().catch(async (error) => {
  console.error(error)
  await pool.end().catch(() => {})
  process.exit(1)
})
