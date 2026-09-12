#!/usr/bin/env node
/**
 * Completely clear the public schema (all data, keep auth users).
 * Keeps auth.users and auth.identities intact so sign-ins still work.
 * Re-runs seed-dev-users.mjs first to ensure all 5 users exist.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *      SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !serviceRole || !anonKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function clearTable(table) {
  const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) {
    if (error.message?.includes('Could not find the table') || error.message?.includes('does not exist')) {
      console.log(`  Skipped ${table} (does not exist)`)
      return
    }
    console.error(`  Failed ${table}:`, error.message)
    throw error
  }
  console.log(`  Cleared ${table}`)
}

async function main() {
  console.log('Step 1: Ensuring auth users exist...\n')
  const seedPath = new URL('./seed-dev-users.mjs', import.meta.url).pathname
  const { spawn } = await import('child_process')
  const child = spawn('node', [seedPath], {
    env: { ...process.env },
    stdio: 'inherit',
  })
  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`seed-dev-users.mjs exited with code ${code ?? 'unknown'}`))
    })
  })

  // Order matters: child tables first, parent tables last.
  const tables = [
    // Phase 8 / audit
    'notification_log',
    'csv_imports',
    'push_subscriptions',
    // Phase 7
    'eval_runs',
    'golden_set',
    'few_shot_wins',
    // Core pipeline
    'outcomes',
    'messages',
    'upwork_messages',
    'upwork_jobs',
    // Phase 3
    'proof_items',
    'profiles',
    // Core
    'leads',
    'voice_profiles',
    'facts',
    'plays',
    'reps',
  ]

  console.log('\nStep 2: Wiping all public tables...')
  for (const t of tables) {
    await clearTable(t)
  }

  console.log('\nDone. Database is fresh. Auth users remain intact.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
