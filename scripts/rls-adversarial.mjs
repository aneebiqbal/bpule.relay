/**
 * RLS adversarial test (Phase 3).
 *
 * Signs in as rep A (non-admin owner) and rep B (non-admin stranger), seeds a
 * small A-owned profile + proof item + lead through the PUBLIC API surface
 * (RLS applies, no service role), then asserts that rep B sees exactly zero of
 * A's rows across all three tables and cannot mutate them.
 *
 * Run: node scripts/rls-adversarial.mjs
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * and the dev users seeded on the hosted project (password scout-dev-password).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Fixed rep ids from 0004_link_reps_and_seed.sql. Aneeb (rep) and Madiha (rep)
// are both non-admins, so this is a genuine stranger-to-stranger test.
const REP_A_ID = 'bbbbbbbb-0000-0000-0000-000000000002' // aneeb@scout.dev

function loadEnv() {
  const file = path.join(root, '.env.local')
  if (!fs.existsSync(file)) {
    console.error('FAIL: missing .env.local')
    process.exit(1)
  }
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/)
    if (m) env[m[1]] = m[2]
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing from .env.local')
    process.exit(1)
  }
  return { url, anon }
}

const { url, anon } = loadEnv()

function client() {
  return createClient(url, anon)
}

async function signIn(email) {
  const sb = client()
  const { error } = await sb.auth.signInWithPassword({
    email,
    password: 'scout-dev-password',
  })
  if (error) {
    console.error(`FAIL: sign in ${email}: ${error.message}`)
    process.exit(1)
  }
  return sb
}

let failures = 0
function assert(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures += 1
}

const stamp = `${Date.now()}`
const namespace = `rls-${stamp}`

const repA = await signIn('aneeb@scout.dev')
const repB = await signIn('madiha@scout.dev')

// ---------------------------------------------------------------------------
// 1. As rep A, create a profile, a proof item, and a lead.
// ---------------------------------------------------------------------------
const { data: profile, error: profileErr } = await repA
  .from('profiles')
  .insert({ rep_id: REP_A_ID, platform: 'linkedin', label: `${namespace} identity` })
  .select('id')
  .single()
if (profileErr) {
  console.error(`FAIL: seed profile as A: ${profileErr.message}`)
  process.exit(1)
}

const { data: proof, error: proofErr } = await repA
  .from('proof_items')
  .insert({
    profile_id: profile.id,
    client_named: false,
    permission_on_file: false,
    project_summary: `${namespace}: internal tools project, tagged private`,
    tags: [`rls-probe-${stamp}`],
  })
  .select('id')
  .single()
if (proofErr) {
  console.error(`FAIL: seed proof item as A: ${proofErr.message}`)
  process.exit(1)
}

const companyName = `${namespace} Co`
const { data: lead, error: leadErr } = await repA
  .from('leads')
  .insert({
    owner_rep_id: REP_A_ID,
    company: companyName,
    signal_evidence: `${namespace}: adversarial probe lead`,
    status: 'new',
  })
  .select('id')
  .single()
if (leadErr) {
  console.error(`FAIL: seed lead as A: ${leadErr.message}`)
  process.exit(1)
}

console.log(`Seeded as A: profile=${profile.id} proof=${proof.id} lead=${lead.id}`)

assert('A can still read own profile', (await repA.from('profiles').select('id', { count: 'exact' }).eq('rep_id', REP_A_ID).eq('id', profile.id)).count === 1)
assert('A can still read own proof item', (await repA.from('proof_items').select('id', { count: 'exact' }).eq('profile_id', profile.id)).count === 1)
assert('A can still read own lead', (await repA.from('leads').select('id', { count: 'exact' }).eq('id', lead.id)).count === 1)

// ---------------------------------------------------------------------------
// 2. As rep B, attempt to read A's rows across all three tables.
// ---------------------------------------------------------------------------
const bProfiles = await repB
  .from('profiles')
  .select('id', { count: 'exact' })
  .eq('rep_id', REP_A_ID)
assert('B sees zero of A\'s profiles', bProfiles.count === 0, `count=${bProfiles.count} ${bProfiles.error ? bProfiles.error.message : ''}`)

const bProofs = await repB
  .from('proof_items')
  .select('id', { count: 'exact' })
  .eq('profile_id', profile.id)
assert('B sees zero of A\'s proof items', bProofs.count === 0, `count=${bProofs.count} ${bProofs.error ? bProofs.error.message : ''}`)

const bLeads = await repB
  .from('leads')
  .select('id', { count: 'exact' })
  .eq('owner_rep_id', REP_A_ID)
assert('B sees zero of A\'s leads', bLeads.count === 0, `count=${bLeads.count} ${bLeads.error ? bLeads.error.message : ''}`)

// ---------------------------------------------------------------------------
// 3. As rep B, attempt to mutate A's rows. RLS no-ops silently (no error, no
//    rows), so the assertion is read-back: A's rows must be unchanged.
// ---------------------------------------------------------------------------
await repB.from('leads').update({ status: 'contacted' }).eq('id', lead.id)
await repB.from('proof_items').delete().eq('id', proof.id)
await repB.from('profiles').delete().eq('id', profile.id)

const leadAfter = await repA.from('leads').select('status', { count: 'exact' }).eq('id', lead.id)
assert('B cannot update A\'s lead', leadAfter.count === 1 && leadAfter.data?.[0]?.status === 'new', `count=${leadAfter.count} status=${leadAfter.data?.[0]?.status ?? 'none'}`)

const proofAfter = await repA.from('proof_items').select('id', { count: 'exact' }).eq('id', proof.id)
assert('B cannot delete A\'s proof item', proofAfter.count === 1, `count=${proofAfter.count}`)

const profileAfter = await repA.from('profiles').select('id', { count: 'exact' }).eq('id', profile.id)
assert('B cannot delete A\'s profile', profileAfter.count === 1, `count=${profileAfter.count}`)

// ---------------------------------------------------------------------------
// 4. Clean up the probe rows.
// ---------------------------------------------------------------------------
const cleanLead = await repA.from('leads').delete().eq('id', lead.id)
const cleanProof = await repA.from('proof_items').delete().eq('id', proof.id)
const cleanProfile = await repA.from('profiles').delete().eq('id', profile.id)
assert('Cleanup removed all probe rows', Boolean(cleanLead && cleanProof && cleanProfile) && !cleanLead.error && !cleanProof.error && !cleanProfile.error)

await repA.auth.signOut()
await repB.auth.signOut()

console.log(failures === 0 ? 'RLS adversarial test PASSED' : `RLS adversarial test FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)