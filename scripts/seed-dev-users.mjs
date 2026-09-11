#!/usr/bin/env node
/**
 * Creates/ensures the dev auth users for Scout on the hosted Supabase project.
 * Uses the GoTrue admin API so rows are platform-consistent (raw SQL inserts
 * can break GoTrue sign-in on hosted). Idempotent: re-running only patches
 * missing users and resets their password to the shared dev password.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-dev-users.mjs
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *      SUPABASE_SERVICE_ROLE_KEY. Password defaults to scout-dev-password.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const password = process.env.SCOUT_DEV_PASSWORD ?? 'scout-dev-password'

const USERS = [
  'aneeb@scout.dev',
  'hassan@scout.dev',
  'ahmad@scout.dev',
  'abdullah@scout.dev',
  'madiha@scout.dev',
]

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

async function listAll() {
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

async function ensureUser(email) {
  const existing = (await listAll()).find((u) => u.email === email)
  if (existing) {
    console.log(`exists: ${email} (${existing.id})`)
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
  console.log(`created: ${email} (${body.id})`)
  return { id: body.id, created: true }
}

for (const email of USERS) {
  try {
    await ensureUser(email)
  } catch (err) {
    console.error(`failed: ${email}`, err.message)
    process.exitCode = 1
  }
}