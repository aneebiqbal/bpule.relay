#!/usr/bin/env node
/**
 * Apply migration 20261001000004 (accountability idempotency) to hosted Supabase.
 *
 * Requires: SUPABASE_ACCESS_TOKEN (from Supabase Dashboard → Account → Tokens)
 * Optional: DRY_RUN=1 to print SQL without executing
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sqp_xxx node scripts/apply-accountability-idempotency.mjs
 *   SUPABASE_ACCESS_TOKEN=sqp_xxx DRY_RUN=1 node scripts/apply-accountability-idempotency.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const token = process.env.SUPABASE_ACCESS_TOKEN
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, 'https://fhnkanwvgamitrcuzpem.supabase.co')
const dryRun = process.env.DRY_RUN === '1'

if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN (from Supabase Dashboard → Account → Access Tokens).')
  process.exit(1)
}

const projectRef = url.replace('https://', '').split('.')[0]
const api = `https://api.supabase.com/v1/projects/${projectRef}/database/query`
const migrationPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase/migrations/20261001000004_accountability_idempotency.sql')
const sql = readFileSync(migrationPath, 'utf8')

if (dryRun) {
  console.log('=== DRY RUN — SQL to execute ===')
  console.log(sql)
  console.log('=== END SQL ===')
  process.exit(0)
}

console.log('Applying accountability idempotency migration...')
const res = await fetch(api, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const body = await res.text()
if (!res.ok) {
  console.error(`FAILED (${res.status}):`)
  console.error(body.slice(0, 2000))
  process.exit(1)
}
console.log('Applied successfully.')
console.log('Verifying...')

// Verify source_event_ids column exists
const verifyRes = await fetch(api, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'daily_accountability' AND column_name = 'source_event_ids'" }),
})
const verifyBody = await verifyRes.json()
if (Array.isArray(verifyBody) && verifyBody.length > 0) {
  console.log('  ✓ daily_accountability.source_event_ids column exists')
} else {
  console.error('  ✗ source_event_ids column NOT FOUND')
  process.exit(1)
}

// Verify unique index exists
const idxRes = await fetch(api, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "SELECT indexname FROM pg_indexes WHERE indexname = 're_idempotency_unique_idx'" }),
})
const idxBody = await idxRes.json()
if (Array.isArray(idxBody) && idxBody.length > 0) {
  console.log('  ✓ re_idempotency_unique_idx unique index exists')
} else {
  console.error('  ✗ re_idempotency_unique_idx NOT FOUND')
  process.exit(1)
}

console.log('All verifications passed.')
