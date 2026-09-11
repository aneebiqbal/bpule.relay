#!/usr/bin/env node
/**
 * Apply migration 0007 (real reps, profiles, proof items) to the hosted
 * project via the Supabase Management API. Idempotent; safe to re-run.
 *
 * Usage: node scripts/seed-real-profiles.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv() {
  const env = {}
  const file = path.join(root, '.env.local')
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
      if (m) env[m[1]] = m[2]
    }
  }
  return { ...process.env, ...env }
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const accessToken = env.SUPABASE_ACCESS_TOKEN
const refMatch = url?.match(/^https:\/\/([^.]+)\.supabase\./)

if (!accessToken || !refMatch) {
  console.error(
    'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN in .env.local (or run `supabase db push` to apply migrations).',
  )
  process.exit(1)
}

const sql = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '0007_seed_real_profiles_and_proof.sql'),
  'utf8',
)

const res = await fetch(
  `https://api.supabase.com/v1/projects/${refMatch[1]}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  },
)

const text = await res.text()
if (res.ok) {
  console.log('Seed applied (0007) via Management API.')
} else {
  console.error(`Management API failed (${res.status}).`)
  console.error(text)
  process.exit(1)
}
