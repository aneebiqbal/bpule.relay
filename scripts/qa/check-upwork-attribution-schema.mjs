#!/usr/bin/env node
/**
 * Is the Upwork sender-attribution migration applied?
 *
 * BUG-29 needs `upwork_jobs.sender_profile_id` and
 * `upwork_messages.sender_profile_id`. BUG-28 needs `upwork_jobs.connects_used`.
 * The application writes all three only when they exist and degrades to a no-op
 * when they do not, so a missing column is silent rather than loud — this script
 * makes it loud.
 *
 *   node --env-file=.env.local scripts/qa/check-upwork-attribution-schema.mjs
 *
 * Exit 0 = applied. Exit 1 = missing, with the exact statement to run.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

/** PostgREST errors with 42703 when the column is absent; that is the probe. */
async function hasColumn(table, column) {
  const { error } = await sb.from(table).select(column).limit(1)
  if (!error) return true
  const message = String(error.message ?? '')
  if (/42703|does not exist|schema cache/i.test(message) || /42703|does not exist|schema cache/i.test(String(error.code ?? ''))) {
    return false
  }
  // An unrelated failure (network, permissions) must not read as "missing".
  throw new Error(`could not probe ${table}.${column}: ${message}`)
}

const REQUIRED = [
  ['upwork_jobs', 'sender_profile_id', 'BUG-29 Upwork profile attribution'],
  ['upwork_messages', 'sender_profile_id', 'BUG-29 Upwork profile attribution'],
  ['upwork_jobs', 'connects_used', 'BUG-28 Upwork applied status write'],
]

const missing = []
for (const [table, column, why] of REQUIRED) {
  if (!(await hasColumn(table, column))) missing.push({ table, column, why })
}

if (missing.length === 0) {
  console.log('OK — Upwork attribution schema is applied.')
  process.exit(0)
}

console.error('MISSING — the Upwork attribution migration has not been applied.\n')
for (const m of missing) console.error(`  ${m.table}.${m.column}  (${m.why})`)
console.error('\nApply it with (idempotent, safe to re-run):')
console.error('  supabase db push --linked')
console.error('or, in the Supabase SQL editor:')
console.error('  supabase/migrations/20261029120001_upwork_sender_attribution.sql')
console.error('\nThe application already writes these columns when present and')
console.error('degrades to null when absent, so nothing is broken — the feature')
console.error('is simply not live until this runs.')
process.exit(1)
