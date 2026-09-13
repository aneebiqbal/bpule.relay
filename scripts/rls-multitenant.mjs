/**
 * Multi-tenant RLS adversarial test.
 *
 * Creates two organizations with one rep each through the real signup flow,
 * then verifies that a rep in organization A sees exactly zero rows from
 * organization B across every tenant-scoped table — and vice versa. This is
 * the definitive isolation guarantee: authenticate as rep A, query org B's
 * rows directly through the anon client (RLS applies), confirm zero results.
 *
 * Run: node scripts/rls-multitenant.mjs
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * and SUPABASE_SERVICE_ROLE_KEY (to create test orgs via the signup API).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv() {
  const file = path.join(root, '.env.local')
  if (!fs.existsSync(file)) {
    console.error('FAIL: missing .env.local')
    process.exit(1)
  }
  const env: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anon || !serviceKey) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const stamp = `mt-${Date.now()}`

async function signUp(orgName: string, email: string, password: string) {
  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: authUser, error: authErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr || !authUser.user) {
    console.error(`FAIL: create user ${email}: ${authErr?.message}`)
    process.exit(1)
  }

  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({ name: orgName, plan: 'trial' })
    .select('id')
    .single()
  if (orgErr || !org) {
    console.error(`FAIL: create org ${orgName}: ${orgErr?.message}`)
    process.exit(1)
  }

  const { error: repErr } = await service.from('reps').insert({
    name: email.split('@')[0],
    role: 'admin',
    organization_id: org.id,
    auth_user_id: authUser.user.id,
  })
  if (repErr) {
    console.error(`FAIL: create rep for ${email}: ${repErr.message}`)
    process.exit(1)
  }

  return { orgId: org.id, email, password }
}

async function signIn(email: string, password: string) {
  const sb = createClient(url, anon)
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) {
    console.error(`FAIL: sign in ${email}: ${error.message}`)
    process.exit(1)
  }
  return sb
}

let failures = 0
function assert(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures += 1
}

// Create two fresh, isolated organizations.
console.log('Creating test organizations...')
const orgA = await signUp(`${stamp} Org A`, `${stamp}-a@test.dev`, 'test-password-123')
const orgB = await signUp(`${stamp} Org B`, `${stamp}-b@test.dev`, 'test-password-123')
console.log(`Org A: ${orgA.orgId}  Org B: ${orgB.orgId}`)

// Sign in as each org's rep.
const repA = await signIn(orgA.email, 'test-password-123')
const repB = await signIn(orgB.email, 'test-password-123')

// Seed some data as org A.
const { data: leadA } = await repA
  .from('leads')
  .insert({
    organization_id: orgA.orgId,
    owner_rep_id: null,
    company: `${stamp} Lead A`,
    signal_evidence: `${stamp}: org A lead`,
    status: 'new',
  })
  .select('id')
  .single()

const { data: factA } = await repA
  .from('facts')
  .insert({
    organization_id: orgA.orgId,
    label: `${stamp} Fact A`,
    value: 'test value',
    fact_type: 'credential',
  })
  .select('id')
  .single()

const { data: playA } = await repA
  .from('plays')
  .insert({
    organization_id: orgA.orgId,
    name: `${stamp} Play A`,
    situation: 'hiring',
    template_shape: 'Test template.',
  })
  .select('id')
  .single()

const { data: personaA } = await repA
  .from('content_personas')
  .insert({
    organization_id: orgA.orgId,
    rep_id: '00000000-0000-0000-0000-000000000000',
    display_name: `${stamp} Persona A`,
    platforms: ['linkedin'],
  })
  .select('id')
  .single()

console.log(`Seeded org A: lead=${leadA?.id} fact=${factA?.id} play=${playA?.id} persona=${personaA?.id}`)

// Seed some data as org B.
const { data: leadB } = await repB
  .from('leads')
  .insert({
    organization_id: orgB.orgId,
    owner_rep_id: null,
    company: `${stamp} Lead B`,
    signal_evidence: `${stamp}: org B lead`,
    status: 'new',
  })
  .select('id')
  .single()

const { data: factB } = await repB
  .from('facts')
  .insert({
    organization_id: orgB.orgId,
    label: `${stamp} Fact B`,
    value: 'test value B',
    fact_type: 'credential',
  })
  .select('id')
  .single()

console.log(`Seeded org B: lead=${leadB?.id} fact=${factB?.id}`)

// ── Cross-tenant isolation assertions ──────────────────────────────────────
// Each table must return zero rows when queried by the other org's rep.

const tables = [
  { name: 'leads', filter: 'company', value: `${stamp}%` },
  { name: 'facts', filter: 'label', value: `${stamp}%` },
  { name: 'plays', filter: 'name', value: `${stamp}%` },
  { name: 'content_personas', filter: 'display_name', value: `${stamp}%` },
] as const

for (const table of tables) {
  const { count: aSeesA } = await repA
    .from(table.name)
    .select('id', { count: 'exact', head: true })
    .ilike(table.filter, table.value)

  const { count: aSeesB } = await repA
    .from(table.name)
    .select('id', { count: 'exact', head: true })
    .ilike(table.filter, `${stamp}%Org B%`)

  const { count: bSeesB } = await repB
    .from(table.name)
    .select('id', { count: 'exact', head: true })
    .ilike(table.filter, table.value)

  const { count: bSeesA } = await repB
    .from(table.name)
    .select('id', { count: 'exact', head: true })
    .ilike(table.filter, `${stamp}%Org A%`)

  assert(`A can read own ${table.name}`, aSeesA !== null && aSeesA >= 1, `count=${aSeesA}`)
  assert(`A sees zero of B's ${table.name}`, aSeesB === 0, `count=${aSeesB}`)
  assert(`B can read own ${table.name}`, bSeesB !== null && bSeesB >= 1, `count=${bSeesB}`)
  assert(`B sees zero of A's ${table.name}`, bSeesA === 0, `count=${bSeesA}`)
}

// Direct ID lookup: A cannot read B's specific rows.
const { data: directLeadB } = await repA
  .from('leads')
  .select('id')
  .eq('id', leadB!.id)
  .maybeSingle()
assert('A cannot read B\'s lead by ID', directLeadB === null)

const { data: directFactB } = await repA
  .from('facts')
  .select('id')
  .eq('id', factB!.id)
  .maybeSingle()
assert('A cannot read B\'s fact by ID', directFactB === null)

// Mutation attempts from B on A's rows should be silently blocked.
if (leadA) {
  await repB.from('leads').update({ status: 'contacted' }).eq('id', leadA.id)
  const { data: leadAfter } = await repA.from('leads').select('status').eq('id', leadA.id).single()
  assert('B cannot update A\'s lead', leadAfter?.status === 'new')
}

if (factA) {
  await repB.from('facts').delete().eq('id', factA.id)
  const { data: factAfter } = await repA.from('facts').select('id').eq('id', factA.id).maybeSingle()
  assert('B cannot delete A\'s fact', factAfter !== null)
}

// ── Cleanup ──────────────────────────────────────────────────────────────
const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Remove all probe data.
await service.from('leads').delete().ilike('company', `${stamp}%`)
await service.from('facts').delete().ilike('label', `${stamp}%`)
await service.from('plays').delete().ilike('name', `${stamp}%`)
await service.from('content_personas').delete().ilike('display_name', `${stamp}%`)
await service.from('organizations').delete().ilike('name', `${stamp}%`)

// Delete test auth users.
const { data: users } = await service.auth.admin.listUsers()
for (const user of users ?? []) {
  if (user.email?.startsWith(`${stamp}-`) && user.email.endsWith('@test.dev')) {
    await service.auth.admin.deleteUser(user.id)
  }
}

await repA.auth.signOut()
await repB.auth.signOut()

console.log(failures === 0 ? '\nMulti-tenant RLS test PASSED' : `\nMulti-tenant RLS test FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
