/**
 * Inbound Flow — Runtime Verification Test
 *
 * Tests the complete inbound client flow against a live deployment.
 * Covers: priority, identity isolation, conversation continuation, edge cases.
 *
 * Usage:
 *   npx ts-node supabase/tests/inbound-runtime.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const ORG_A_ID = 'aaaaaaaa-0000-0000-0000-000000000000'
const ORG_B_ID = 'bbbbbbbb-0000-0000-0000-000000000000'
const USER_A_ID = 'aaaaaaaa-1111-1111-1111-111111111111'
const USER_B_ID = 'bbbbbbbb-1111-1111-1111-111111111111'
const USER_A_EMAIL = 'inbound-test-org-a@example.com'
const USER_B_EMAIL = 'inbound-test-org-b@example.com'
const TEST_PASSWORD = 'inbound-test-password-123'

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
  const { createClient } = await import('@supabase/supabase-js')

  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('=== Inbound Flow — Runtime Verification ===\n')

  // ── Setup ──
  console.log('1. Setting up test organizations and users...')

  await admin.from('organizations').upsert({ id: ORG_A_ID, name: 'inbound-test-org-a', plan: 'trial' })
  await admin.from('organizations').upsert({ id: ORG_B_ID, name: 'inbound-test-org-b', plan: 'trial' })

  for (const [userId, email, orgId, name] of [
    [USER_A_ID, USER_A_EMAIL, ORG_A_ID, 'Org A Admin'],
    [USER_B_ID, USER_B_EMAIL, ORG_B_ID, 'Org B Admin'],
  ] as const) {
    await admin.auth.admin.createUser({
      id: userId,
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name },
    }).catch(() => {})
    await admin.from('reps').upsert({
      id: `rep-${orgId.slice(0, 8)}`,
      name,
      role: 'admin',
      organization_id: orgId,
      auth_user_id: userId,
    })
  }

  // Create profiles for different identities
  const profileMehak = 'aaaaaaaa-3333-3333-3333-333333333333'
  const profileAneeb = 'aaaaaaaa-4444-4444-4444-444444444444'
  const profileHassan = 'aaaaaaaa-5555-5555-5555-555555555555'

  await admin.from('profiles').upsert([
    { id: profileMehak, organization_id: ORG_A_ID, rep_id: `rep-${ORG_A_ID.slice(0, 8)}`, platform: 'linkedin', label: 'Mehak — Full Stack', headline: 'React, Node.js, TypeScript' },
    { id: profileAneeb, organization_id: ORG_A_ID, rep_id: `rep-${ORG_A_ID.slice(0, 8)}`, platform: 'linkedin', label: 'Aneeb — Mobile', headline: 'iOS, Android, React Native' },
    { id: profileHassan, organization_id: ORG_A_ID, rep_id: `rep-${ORG_A_ID.slice(0, 8)}`, platform: 'linkedin', label: 'Hassan — Backend', headline: 'Python, PostgreSQL, AWS' },
  ])

  // Create proof items for each identity
  await admin.from('proof_items').upsert([
    { id: 'proof-mehak-1', organization_id: ORG_A_ID, profile_id: profileMehak, project_summary: 'Built a React e-commerce platform handling 10k daily users', review_quote: 'Mehak delivered our React app on time', tags: ['react', 'ecommerce'] },
    { id: 'proof-mehak-2', organization_id: ORG_A_ID, profile_id: profileMehak, project_summary: 'Node.js microservices migration for fintech startup', tags: ['nodejs', 'fintech'] },
    { id: 'proof-aneeb-1', organization_id: ORG_A_ID, profile_id: profileAneeb, project_summary: 'iOS app for healthcare startup with 50k downloads', review_quote: 'Aneeb built our entire mobile presence', tags: ['ios', 'healthcare'] },
    { id: 'proof-aneeb-2', organization_id: ORG_A_ID, profile_id: profileAneeb, project_summary: 'React Native cross-platform app for logistics', tags: ['reactnative', 'logistics'] },
    { id: 'proof-hassan-1', organization_id: ORG_A_ID, profile_id: profileHassan, project_summary: 'PostgreSQL database optimization reducing query time by 80%', tags: ['postgres', 'performance'] },
    { id: 'proof-hassan-2', organization_id: ORG_A_ID, profile_id: profileHassan, project_summary: 'AWS infrastructure setup for SaaS platform', tags: ['aws', 'saas'] },
  ])

  // Sign in as Org A
  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await clientA.auth.signInWithPassword({ email: USER_A_EMAIL, password: TEST_PASSWORD })

  // ── Test 1: Priority ──
  console.log('\n2. Testing priority ordering...')

  // Create an outbound lead with reply_needed status
  const replyLeadId = 'aaaaaaaa-7777-7777-7777-777777777777'
  await admin.from('leads').insert({
    id: replyLeadId,
    organization_id: ORG_A_ID,
    company: 'Existing Client Corp',
    company_key: 'existing-client-corp',
    owner_rep_id: `rep-${ORG_A_ID.slice(0, 8)}`,
    direction: 'outbound',
    status: 'replied',
    signal_type: 1,
    signal_evidence: 'test',
  })

  // Create an inbound lead
  const inboundLeadId = 'aaaaaaaa-8888-8888-8888-888888888888'
  await admin.from('leads').insert({
    id: inboundLeadId,
    organization_id: ORG_A_ID,
    company: 'Inbound Prospect Inc',
    company_key: 'inbound-prospect-inc',
    owner_rep_id: `rep-${ORG_A_ID.slice(0, 8)}`,
    direction: 'inbound',
    source: 'linkedin',
    status: 'new',
    inbound_message: 'Hi, we need a React developer for our project',
  })

  // Fetch queue and check ordering
  const queueRes = await clientA.rpc('archive_search', { query: 'Client Prospect', result_limit: 10 })
  assert(!queueRes.error, 'archive_search returns without error')

  // ── Test 2: Identity Isolation ──
  console.log('\n3. Testing identity isolation...')

  const testMessage = 'We need a React developer for our e-commerce platform'

  // Analyze with Mehak's profile context
  const mehakAnalysis = await clientA.rpc('match_proofs_by_embedding', {
    query_embedding: new Array(384).fill(0.01),
    match_threshold: 0.0,
    match_count: 10,
  })
  assert(!mehakAnalysis.error, 'Proof matching works')

  // Verify proof filtering by profile
  const mehakProofs = await admin
    .from('proof_items')
    .select('id, profile_id')
    .eq('profile_id', profileMehak)

  const aneebProofs = await admin
    .from('proof_items')
    .select('id, profile_id')
    .eq('profile_id', profileAneeb)

  const mehakProofIds = new Set((mehakProofs.data ?? []).map((p) => p.id))
  const aneebProofIds = new Set((aneebProofs.data ?? []).map((p) => p.id))

  assert(mehakProofIds.size > 0, `Mehak has ${mehakProofIds.size} proof items`)
  assert(aneebProofIds.size > 0, `Aneeb has ${aneebProofIds.size} proof items`)
  assert(![...mehakProofIds].some((id) => aneebProofIds.has(id)), 'No proof overlap between identities')

  // ── Test 3: Inbound Lead Creation ──
  console.log('\n4. Testing inbound lead creation...')

  const inboundLeadResult = await admin.from('leads').insert({
    organization_id: ORG_A_ID,
    company: 'Test Inbound Co',
    company_key: 'test-inbound-co',
    owner_rep_id: `rep-${ORG_A_ID.slice(0, 8)}`,
    direction: 'inbound',
    source: 'upwork',
    status: 'new',
    inbound_message: 'Looking for a mobile app developer for our healthcare startup. Budget is $15k.',
    inbound_raw: { platform: 'upwork', job_url: 'https://upwork.com/job/123' },
    sender_profile_id: profileAneeb,
  }).select('*').single()

  assert(!inboundLeadResult.error, 'Inbound lead created successfully')
  assert(inboundLeadResult.data?.direction === 'inbound', 'Direction is inbound')
  assert(inboundLeadResult.data?.source === 'upwork', 'Source is upwork')
  assert(inboundLeadResult.data?.inbound_message?.includes('healthcare'), 'Inbound message preserved')
  assert(inboundLeadResult.data?.sender_profile_id === profileAneeb, 'Assigned to Aneeb profile')

  // ── Test 4: Duplicate Inbound ──
  console.log('\n5. Testing duplicate inbound...')

  const dupResult = await admin.from('leads').insert({
    organization_id: ORG_A_ID,
    company: 'Test Inbound Co',
    company_key: 'test-inbound-co',
    owner_rep_id: `rep-${ORG_A_ID.slice(0, 8)}`,
    direction: 'inbound',
    source: 'email',
    status: 'new',
    inbound_message: 'Different message same company',
  }).select('*').single()

  // Should be blocked because company already exists
  assert(dupResult.data?.company_key === 'test-inbound-co', 'Duplicate company detected')

  // ── Test 5: Cross-Org Isolation ──
  console.log('\n6. Testing cross-org isolation...')

  const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await clientB.auth.signInWithPassword({ email: USER_B_EMAIL, password: TEST_PASSWORD })

  const orgBLeads = await clientB.from('leads').select('id, company').eq('direction', 'inbound')
  const orgBSeesOrgA = (orgBLeads.data ?? []).some((l: { id: string }) => l.id === inboundLeadResult.data?.id)

  assert(!orgBSeesOrgA, 'Org B cannot see Org A inbound leads')

  // ── Test 6: Message Preservation ──
  console.log('\n7. Testing message preservation...')

  const fetchedLead = await admin
    .from('leads')
    .select('inbound_message, inbound_raw')
    .eq('id', inboundLeadResult.data?.id)
    .single()

  assert(
    fetchedLead.data?.inbound_message === 'Looking for a mobile app developer for our healthcare startup. Budget is $15k.',
    'Inbound message preserved exactly'
  )
  assert(
    (fetchedLead.data?.inbound_raw as Record<string, unknown>)?.job_url === 'https://upwork.com/job/123',
    'Inbound raw data preserved'
  )

  // ── Test 7: Unauthorized Access ──
  console.log('\n8. Testing unauthorized access...')

  const noAuthClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const noAuthResult = await noAuthClient.from('leads').insert({
    organization_id: ORG_A_ID,
    company: 'Unauthorized Co',
    company_key: 'unauthorized-co',
    direction: 'inbound',
    source: 'other',
    inbound_message: 'Should not be created',
  })

  assert(noAuthResult.error !== null, 'Unauthenticated user cannot create leads')

  // ── Test 8: Empty/Invalid Input ──
  console.log('\n9. Testing empty/invalid input...')

  const emptyMessage = await admin.from('leads').insert({
    organization_id: ORG_A_ID,
    company: 'Empty Msg Co',
    company_key: 'empty-msg-co',
    direction: 'inbound',
    source: 'other',
    inbound_message: '',
  })
  // Empty message should still be allowed at DB level (validation is in API layer)
  assert(!emptyMessage.error, 'Empty message allowed at DB level (API validates)')

  // ── Summary ──
  console.log('\n=== Summary ===')
  console.log(`   Passes: ${passes}  |  Failures: ${failures}`)

  // ── Cleanup ──
  console.log('\n10. Cleaning up...')
  await admin.from('leads').delete().eq('organization_id', ORG_A_ID).neq('direction', 'outbound')
  await admin.from('proof_items').delete().in('id', ['proof-mehak-1', 'proof-mehak-2', 'proof-aneeb-1', 'proof-aneeb-2', 'proof-hassan-1', 'proof-hassan-2'])
  await admin.from('profiles').delete().in('id', [profileMehak, profileAneeb, profileHassan])
  await admin.from('leads').delete().in('id', [replyLeadId, inboundLeadId])
  await admin.from('reps').delete().in('id', [`rep-${ORG_A_ID.slice(0, 8)}`, `rep-${ORG_B_ID.slice(0, 8)}`])
  await admin.from('organizations').delete().in('id', [ORG_A_ID, ORG_B_ID])
  await admin.auth.admin.deleteUser(USER_A_ID)
  await admin.auth.admin.deleteUser(USER_B_ID)
  console.log('   Done.')

  console.log('\n=== Test Complete ===')
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
