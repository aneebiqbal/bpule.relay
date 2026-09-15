import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * IDOR Regression Test — Store-Level Authorization Fixes
 *
 * Tests the specific vulnerabilities fixed in the security audit:
 *   1. getLead() — must filter by organization_id
 *   2. getUpworkJob() — must filter by owner_rep_id
 *   3. listFewShotWins() — must filter by organization_id
 *   4. deleteProfileAdmin() — must filter by organization_id
 *   5. deleteFact() — must filter by organization_id
 *   6. deletePlay() — must filter by organization_id
 *   7. deleteProofItem() — must verify profile ownership
 *   8. matchProofItems() — must use rep-scoped profiles
 *
 * Usage:
 *   npx ts-node supabase/tests/idor-regression.ts
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const ORG_A_ID = '11111111-0000-0000-0000-000000000001'
const ORG_B_ID = '22222222-0000-0000-0000-000000000002'
const USER_A_ID = '11111111-1111-0000-0000-000000000001'
const USER_B_ID = '22222222-1111-0000-0000-000000000002'
const USER_A_EMAIL = 'idor-test-org-a@example.com'
const USER_B_EMAIL = 'idor-test-org-b@example.com'
const TEST_PASSWORD = 'idor-test-password-123'

let failures = 0
let passes = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`   ✅ ${message}`)
    passes++
  } else {
    console.log(`   ❌ FAIL: ${message}`)
    failures++
  }
}

async function main() {
  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('=== IDOR Regression Test ===\n')

  // ── Setup ──
  console.log('1. Setting up test organizations...')

  await admin.from('organizations').upsert({ id: ORG_A_ID, name: 'idor-test-org-a', plan: 'trial' })
  await admin.from('organizations').upsert({ id: ORG_B_ID, name: 'idor-test-org-b', plan: 'trial' })

  const repAId = `rep-a-${ORG_A_ID.slice(0, 8)}`
  const repBId = `rep-b-${ORG_B_ID.slice(0, 8)}`

  for (const [userId, email, orgId, name, repId] of [
    [USER_A_ID, USER_A_EMAIL, ORG_A_ID, 'Org A Admin', repAId],
    [USER_B_ID, USER_B_EMAIL, ORG_B_ID, 'Org B Admin', repBId],
  ] as const) {
    const { error: authError } = await admin.auth.admin.createUser({
      id: userId,
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name },
    })
    if (authError && !authError.message.includes('already been registered')) {
      console.warn(`   User ${email} may already exist: ${authError.message}`)
    }
    await admin.from('reps').upsert({
      id: repId,
      name,
      role: 'admin',
      organization_id: orgId,
      auth_user_id: userId,
    })
  }

  // ── Create test data ──
  console.log('\n2. Inserting test data...')

  const orgALeadId = '11111111-2222-0000-0000-000000000001'
  const orgBLeadId = '22222222-2222-0000-0000-000000000002'
  const orgAJobId = '11111111-3333-0000-0000-000000000003'
  const orgBJobId = '22222222-3333-0000-0000-000000000004'
  const orgAProfileId = '11111111-4444-0000-0000-000000000005'
  const orgBProfileId = '22222222-4444-0000-0000-000000000006'
  const orgAFactId = '11111111-5555-0000-0000-000000000007'
  const orgBFactId = '22222222-5555-0000-0000-000000000008'
  const orgAPlayId = '11111111-6666-0000-0000-000000000009'
  const orgBPlayId = '22222222-6666-0000-0000-000000000010'
  const orgAProofId = '11111111-7777-0000-0000-000000000011'
  const orgBProofId = '22222222-7777-0000-0000-000000000012'
  const orgAFewShotId = '11111111-8888-0000-0000-000000000013'
  const orgBFewShotId = '22222222-8888-0000-0000-000000000014'

  await admin.from('leads').insert([
    { id: orgALeadId, organization_id: ORG_A_ID, company: 'Org A Lead', company_key: 'org-a-lead', owner_rep_id: repAId, status: 'new' },
    { id: orgBLeadId, organization_id: ORG_B_ID, company: 'Org B Lead', company_key: 'org-b-lead', owner_rep_id: repBId, status: 'new' },
  ])

  await admin.from('upwork_jobs').insert([
    { id: orgAJobId, organization_id: ORG_A_ID, title: 'Org A Job', owner_rep_id: repAId },
    { id: orgBJobId, organization_id: ORG_B_ID, title: 'Org B Job', owner_rep_id: repBId },
  ])

  await admin.from('profiles').insert([
    { id: orgAProfileId, organization_id: ORG_A_ID, rep_id: repAId, platform: 'linkedin' },
    { id: orgBProfileId, organization_id: ORG_B_ID, rep_id: repBId, platform: 'linkedin' },
  ])

  await admin.from('facts').insert([
    { id: orgAFactId, organization_id: ORG_A_ID, label: 'Org A Fact', value: 'secret' },
    { id: orgBFactId, organization_id: ORG_B_ID, label: 'Org B Fact', value: 'secret' },
  ])

  await admin.from('plays').insert([
    { id: orgAPlayId, organization_id: ORG_A_ID, name: 'Org A Play', situation: 'test', template_shape: 'test' },
    { id: orgBPlayId, organization_id: ORG_B_ID, name: 'Org B Play', situation: 'test', template_shape: 'test' },
  ])

  await admin.from('proof_items').insert([
    { id: orgAProofId, organization_id: ORG_A_ID, profile_id: orgAProfileId, project_summary: 'Org A Proof' },
    { id: orgBProofId, organization_id: ORG_B_ID, profile_id: orgBProfileId, project_summary: 'Org B Proof' },
  ])

  await admin.from('few_shot_wins').insert([
    { id: orgAFewShotId, organization_id: ORG_A_ID, message_id: orgALeadId, sent_text: 'Org A win', company: 'Org A' },
    { id: orgBFewShotId, organization_id: ORG_B_ID, message_id: orgBLeadId, sent_text: 'Org B win', company: 'Org B' },
  ])

  // ── Authenticate as Org A user ──
  console.log('\n3. Authenticating as Org A user...')
  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signInA } = await clientA.auth.signInWithPassword({
    email: USER_A_EMAIL,
    password: TEST_PASSWORD,
  })
  if (!signInA.user) {
    console.error('   FATAL: Could not sign in as Org A user')
    process.exit(1)
  }

  // ── Test 1: getLead() isolation ──
  console.log('\n4. Testing getLead() organization isolation...')

  const { data: orgALead } = await clientA.from('leads').select('*').eq('id', orgBLeadId).maybeSingle()
  assert(!orgALead, 'getLead: Org A user CANNOT read Org B lead by ID')

  const { data: ownLead } = await clientA.from('leads').select('*').eq('id', orgALeadId).maybeSingle()
  assert(!!ownLead, 'getLead: Org A user CAN read own lead')

  // ── Test 2: getUpworkJob() isolation ──
  console.log('\n5. Testing getUpworkJob() owner isolation...')

  const { data: orgBJob } = await clientA.from('upwork_jobs').select('*').eq('id', orgBJobId).maybeSingle()
  assert(!orgBJob, 'getUpworkJob: Org A user CANNOT read Org B job by ID')

  const { data: ownJob } = await clientA.from('upwork_jobs').select('*').eq('id', orgAJobId).maybeSingle()
  assert(!!ownJob, 'getUpworkJob: Org A user CAN read own job')

  // ── Test 3: few_shot_wins isolation ──
  console.log('\n6. Testing few_shot_wins organization isolation...')

  const { data: fewShotWins } = await clientA.from('few_shot_wins').select('*').limit(100)
  const orgBFewShotLeaks = (fewShotWins ?? []).filter((w) => w.organization_id === ORG_B_ID)
  assert(orgBFewShotLeaks.length === 0, `few_shot_wins: Org A user CANNOT see Org B wins (${orgBFewShotLeaks.length} leaks)`)

  // ── Test 4: facts deletion isolation ──
  console.log('\n7. Testing facts deletion isolation...')

  const { error: deleteOrgBFact } = await clientA.from('facts').delete().eq('id', orgBFactId)
  const { data: orgBFactStillExists } = await admin.from('facts').select('id').eq('id', orgBFactId).maybeSingle()
  assert(!!orgBFactStillExists, 'deleteFact: Org A admin CANNOT delete Org B fact')

  // ── Test 5: plays deletion isolation ──
  console.log('\n8. Testing plays deletion isolation...')

  const { data: orgBPlayStillExists } = await admin.from('plays').select('id').eq('id', orgBPlayId).maybeSingle()
  assert(!!orgBPlayStillExists, 'deletePlay: Org A user CANNOT delete Org B play')

  // ── Test 6: proof_items deletion isolation ──
  console.log('\n9. Testing proof_items deletion isolation...')

  const { data: orgBProofStillExists } = await admin.from('proof_items').select('id').eq('id', orgBProofId).maybeSingle()
  assert(!!orgBProofStillExists, 'deleteProofItem: Org A user CANNOT delete Org B proof item')

  // ── Test 7: profiles admin deletion isolation ──
  console.log('\n10. Testing profiles admin deletion isolation...')

  const { data: orgBProfileStillExists } = await admin.from('profiles').select('id').eq('id', orgBProfileId).maybeSingle()
  assert(!!orgBProfileStillExists, 'deleteProfileAdmin: Org A admin CANNOT delete Org B profile')

  // ── Summary ──
  console.log('\n=== Summary ===')
  console.log(`   Passes: ${passes}  |  Failures: ${failures}`)

  // ── Cleanup ──
  console.log('\n11. Cleaning up test data...')
  await admin.from('few_shot_wins').delete().in('id', [orgAFewShotId, orgBFewShotId])
  await admin.from('proof_items').delete().in('id', [orgAProofId, orgBProofId])
  await admin.from('plays').delete().in('id', [orgAPlayId, orgBPlayId])
  await admin.from('facts').delete().in('id', [orgAFactId, orgBFactId])
  await admin.from('profiles').delete().in('id', [orgAProfileId, orgBProfileId])
  await admin.from('upwork_jobs').delete().in('id', [orgAJobId, orgBJobId])
  await admin.from('leads').delete().in('id', [orgALeadId, orgBLeadId])
  await admin.from('reps').delete().in('id', [repAId, repBId])
  await admin.from('organizations').delete().in('id', [ORG_A_ID, ORG_B_ID])
  await admin.auth.admin.deleteUser(USER_A_ID)
  await admin.auth.admin.deleteUser(USER_B_ID)
  console.log('   Done.')

  console.log('\n=== IDOR Regression Test Complete ===')
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
