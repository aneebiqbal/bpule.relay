#!/usr/bin/env node
/**
 * Apply every pending numbered migration to the configured database.
 *
 * Provider-agnostic: uses the installed `pg` driver, so it runs on the VPS with
 * no `psql` binary and no repository checkout beyond this script and the
 * `supabase/migrations` directory.
 *
 *   SERVICE_DATABASE_URL=... node scripts/apply-migrations.mjs
 *
 * Each migration runs in ONE transaction together with its version insert, so a
 * failure rolls back instead of leaving half the schema behind. Already-recorded
 * versions are skipped; a failed migration is left unrecorded for a later retry.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const url = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('SERVICE_DATABASE_URL (or DATABASE_URL) is required')
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
  await pool.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      installed_at timestamptz not null default now()
    );
  `)

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
