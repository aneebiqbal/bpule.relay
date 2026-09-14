#!/usr/bin/env node
/**
 * Creates/ensures the dev auth users for Scout on the hosted Supabase project.
 * Uses the GoTrue admin API so rows are platform-consistent (raw SQL inserts
 * can break GoTrue sign-in on hosted). Idempotent: re-running only patches
 * missing users and resets their password to the shared dev password.
 *
 * For each user this ensures:
 * 1. Auth user exists (GoTrue admin API)
 * 2. reps row exists linked via auth_user_id
 * 3. voice_profiles row exists (so onboarding can be skipped)
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... NEXT_PUBLIC_SUPABASE_URL=... node scripts/seed-dev-users.mjs
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *      SUPABASE_SERVICE_ROLE_KEY. Password defaults to scout-dev-password.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const password = process.env.SCOUT_DEV_PASSWORD ?? 'scout-dev-password'

const USERS = [
  { email: 'aneeb@scout.dev', name: 'Aneeb', role: 'admin' },
  { email: 'madiha@scout.dev', name: 'Madiha', role: 'rep' },
  { email: 'hassan@scout.dev', name: 'Hassan', role: 'rep' },
  { email: 'ahmad@scout.dev', name: 'Ahmad', role: 'rep' },
  { email: 'dawood@scout.dev', name: 'Dawood', role: 'rep' },
  { email: 'suhiab@scout.dev', name: 'Suhiab', role: 'rep' },
  { email: 'najiullah@scout.dev', name: 'Najiullah', role: 'rep' },
]

const BPULSE_ORG_ID = '11111111-1111-1111-1111-111111111111'

if (!url || !serviceRole || !anonKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const authUrl = `${url}/auth/v1/admin/users`
const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${serviceRole}`,
  'Content-Type': 'application/json',
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function listAllAuthUsers() {
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

async function ensureAuthUser(email) {
  const allUsers = await listAllAuthUsers()
  const existing = allUsers.find((u) => u.email === email)
  if (existing) {
    console.log(`  auth exists: ${email} (${existing.id})`)
    return { id: existing.id, created: false }
  }

  const r = await fetch(authUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {},
      app_metadata: { provider: 'email', providers: ['email'] },
    }),
  })
  const body = await r.json()
  if (!r.ok) throw new Error(`create ${email} ${r.status}: ${JSON.stringify(body)}`)
  console.log(`  auth created: ${email} (${body.id})`)
  return { id: body.id, created: true }
}

async function ensureRep(authUserId, name, role) {
  const { data: existing } = await supabase
    .from('reps')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (existing) {
    console.log(`  rep exists: ${name} (${existing.id})`)
    return existing.id
  }

  const { data, error } = await supabase
    .from('reps')
    .insert({
      name,
      role,
      organization_id: BPULSE_ORG_ID,
      auth_user_id: authUserId,
    })
    .select('id')
    .single()

  if (error) throw error
  console.log(`  rep created: ${name} (${data.id})`)
  return data.id
}

async function ensureVoiceProfile(repId) {
  const { data: existing } = await supabase
    .from('voice_profiles')
    .select('id')
    .eq('rep_id', repId)
    .maybeSingle()

  if (existing) {
    console.log(`  voice_profile exists for rep ${repId}`)
    return
  }

  const { error } = await supabase
    .from('voice_profiles')
    .insert({
      rep_id: repId,
      organization_id: BPULSE_ORG_ID,
      style_card: '{}',
      sample_source: 'quiz',
      calibrated_at: new Date().toISOString(),
    })

  if (error) throw error
  console.log(`  voice_profile created for rep ${repId}`)
}

async function main() {
  console.log('Seeding dev users...\n')

  for (const user of USERS) {
    console.log(`${user.email}:`)
    try {
      const { id: authUserId } = await ensureAuthUser(user.email)
      const repId = await ensureRep(authUserId, user.name, user.role)
      await ensureVoiceProfile(repId)
    } catch (err) {
      console.error(`  FAILED: ${err.message}`)
      process.exitCode = 1
    }
    console.log('')
  }

  console.log('Done. All dev users are ready.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
