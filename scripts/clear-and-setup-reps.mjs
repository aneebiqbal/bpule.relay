#!/usr/bin/env node
/**
 * 1) Clears all leads, messages, outcomes, upwork data, and eval/audit tables.
 * 2) Ensures the 5 dev reps exist and are linked to their auth users.
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

async function clearTable(table, opts = {}) {
  console.log(`Clearing ${table}...`)
  let query = supabase.from(table).delete()
  if (opts.neqColumn) {
    query = query.neq(opts.neqColumn, '00000000-0000-0000-0000-000000000000')
  } else {
    query = query.neq('id', '00000000-0000-0000-0000-000000000000')
  }
  const { error } = await query
  if (error) {
    if (error.message?.includes('Could not find the table')) {
      console.log(`  Skipping ${table}: table does not exist.`)
      return
    }
    console.error(`  Failed to clear ${table}:`, error.message)
    throw error
  }
  console.log(`  ${table} cleared.`)
}

async function clearAll() {
  // Order matters for FK constraints.
  await clearTable('notification_log')
  await clearTable('csv_imports')
  await clearTable('eval_runs')
  await clearTable('golden_set')
  await clearTable('few_shot_wins')
  await clearTable('outcomes')
  await clearTable('messages')
  await clearTable('upwork_messages')
  await clearTable('upwork_jobs')
  await clearTable('leads')
  console.log('\nAll leads and related data cleared.')
}

const REPS = [
  { id: 'bbbbbbbb-0000-0000-0000-000000000001', email: 'hassan@scout.dev', name: 'Hassan', role: 'admin' },
  { id: 'bbbbbbbb-0000-0000-0000-000000000002', email: 'aneeb@scout.dev', name: 'Aneeb', role: 'rep' },
  { id: 'bbbbbbbb-0000-0000-0000-000000000003', email: 'madiha@scout.dev', name: 'Madiha', role: 'rep' },
  { id: 'bbbbbbbb-0000-0000-0000-000000000004', email: 'ahmad@scout.dev', name: 'Ahmad', role: 'rep' },
  { id: 'bbbbbbbb-0000-0000-0000-000000000005', email: 'abdullah@scout.dev', name: 'Abdullah', role: 'rep' },
]

async function listAllAuthUsers() {
  const authUrl = `${url}/auth/v1/admin/users`
  const headers = { apikey: anonKey, Authorization: `Bearer ${serviceRole}` }
  const out = []
  for (let page = 1; page <= 10; page += 1) {
    const r = await fetch(`${authUrl}?page=${page}&per_page=200`, { headers })
    if (!r.ok) throw new Error(`list users ${r.status}: ${await r.text()}`)
    const { users } = await r.json()
    out.push(...users)
    if (users.length < 200) break
  }
  return out
}

async function ensureReps() {
  console.log('\nEnsuring reps are linked...')
  const allAuthUsers = await listAllAuthUsers()

  for (const rep of REPS) {
    const authUser = allAuthUsers.find((u) => u.email === rep.email)
    if (!authUser) {
      console.error(`  Auth user not found for ${rep.email}`)
      continue
    }

    // Check if any rep already has this auth_user_id (could be a different rep row).
    const { data: existingByAuth } = await supabase
      .from('reps')
      .select('id, auth_user_id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle()

    if (existingByAuth && existingByAuth.id !== rep.id) {
      // Another rep row has this auth user. Delete the old row (it's stale).
      console.log(`  Removing stale rep ${existingByAuth.id} with auth_user_id ${authUser.id}`)
      await supabase.from('reps').delete().eq('id', existingByAuth.id)
    }

    const { data: existing } = await supabase
      .from('reps')
      .select('id, auth_user_id')
      .eq('id', rep.id)
      .maybeSingle()

    if (existing) {
      if (existing.auth_user_id !== authUser.id) {
        const { error } = await supabase
          .from('reps')
          .update({ auth_user_id: authUser.id, name: rep.name, role: rep.role })
          .eq('id', rep.id)
        if (error) {
          console.error(`  Failed to update ${rep.email}:`, error.message)
        } else {
          console.log(`  Updated ${rep.email} -> ${authUser.id}`)
        }
      } else {
        console.log(`  Already linked: ${rep.email}`)
      }
    } else {
      const { error } = await supabase
        .from('reps')
        .insert({ id: rep.id, name: rep.name, role: rep.role, auth_user_id: authUser.id })
      if (error) {
        console.error(`  Failed to create ${rep.email}:`, error.message)
      } else {
        console.log(`  Created ${rep.email} -> ${authUser.id}`)
      }
    }
  }
}

async function main() {
  await clearAll()
  await ensureReps()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
