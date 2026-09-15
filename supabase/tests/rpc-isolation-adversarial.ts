import { createClient } from '@supabase/supabase-js'

/**
 * RPC Isolation Adversarial Test — Cross-Organization Data Leak Verification
 *
 * Tests the three fixed SECURITY DEFINER RPCs:
 *   1. archive_search
 *   2. match_proofs_by_embedding
 *   3. refresh_few_shot_wins
 *
 * Creates Org A and Org B with their own users and data, then verifies
 * that calling each RPC as Org A NEVER returns or writes Org B's data.
 *
 * Usage:
 *   npx ts-node supabase/tests/rpc-isolation-adversarial.ts
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const ORG_A_ID = 'aaaaaaaa-0000-0000-0000-000000000000'
const ORG_B_ID = 'bbbbbbbb-0000-0000-0000-000000000000'
const USER_A_ID = 'aaaaaaaa-1111-1111-1111-111111111111'
const USER_B_ID = 'bbbbbbbb-1111-1111-1111-111111111111'
const USER_A_EMAIL = 'rpc-test-org-a@example.com'
const USER_B_EMAIL = 'rpc-test-org-b@example.com'
const TEST_PASSWORD = 'rpc-test-password-123'

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

  console.log('=== RPC Isolation Adversarial Test ===\n')

  // ── Setup: Create two orgs with their own users and data ──
  console.log('1. Setting up test organizations...')

  await admin.from('organizations').upsert({ id: ORG_A_ID, name: 'rpc-test-org-a', plan: 'trial' })
  await admin.from('organizations').upsert({ id: ORG_B_ID, name: 'rpc-test-org-b', plan: 'trial' })

  for (const [userId, email, orgId, name] of [
    [USER_A_ID, USER_A_EMAIL, ORG_A_ID, 'Org A Admin'],
    [USER_B_ID, USER_B_EMAIL, ORG_B_ID, 'Org B Admin'],
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
      id: `rep-${orgId.slice(0, 8)}`,
      name,
      role: 'admin',
      organization_id: orgId,
      auth_user_id: userId,
    })
  }

  console.log('\n2. Inserting test data into both orgs...')

  // Org A data
  const orgALeadId = 'aaaaaaaa-2222-2222-2222-222222222222'
  const orgAProofId = 'aaaaaaaa-3333-3333-3333-333333333333'
  const orgAJobId = 'aaaaaaaa-4444-4444-4444-444444444444'
  const orgAMessageId = 'aaaaaaaa-5555-5555-5555-555555555555'
  const orgAOutcomeId = 'aaaaaaaa-6666-6666-6666-666666666666'

  // Org B data
  const orgBLeadId = 'bbbbbbbb-2222-2222-2222-222222222222'
  const orgBProofId = 'bbbbbbbb-3333-3333-3333-333333333333'
  const orgBJobId = 'bbbbbbbb-4444-4444-4444-444444444444'
  const orgBMessageId = 'bbbbbbbb-5555-5555-5555-555555555555'
  const orgBOutcomeId = 'bbbbbbbb-6666-6666-6666-666666666666'

  await admin.from('leads').insert([
    {
      id: orgALeadId,
      organization_id: ORG_A_ID,
      company: 'Org A Secret Company',
      company_key: 'org-a-secret',
      owner_rep_id: `rep-${ORG_A_ID.slice(0, 8)}`,
      signal_type: 1,
      signal_evidence: 'Org A proprietary signal evidence',
      contact_name: 'Org A Contact',
      status: 'new',
    },
    {
      id: orgBLeadId,
      organization_id: ORG_B_ID,
      company: 'Org B Secret Company',
      company_key: 'org-b-secret',
      owner_rep_id: `rep-${ORG_B_ID.slice(0, 8)}`,
      signal_type: 2,
      signal_evidence: 'Org B proprietary signal evidence',
      contact_name: 'Org B Contact',
      status: 'new',
    },
  ])

  await admin.from('proof_items').insert([
    {
      id: orgAProofId,
      organization_id: ORG_A_ID,
      project_summary: 'Org A confidential project proof',
      review_quote: 'Org A client review quote',
      client_name: 'Org A Client',
      tags: ['org-a-tag'],
    },
    {
      id: orgBProofId,
      organization_id: ORG_B_ID,
      project_summary: 'Org B confidential project proof',
      review_quote: 'Org B client review quote',
      client_name: 'Org B Client',
      tags: ['org-b-tag'],
    },
  ])

  await admin.from('upwork_jobs').insert([
    {
      id: orgAJobId,
      organization_id: ORG_A_ID,
      title: 'Org A Upwork Job',
      description: 'Org A job description with secret details',
      owner_rep_id: `rep-${ORG_A_ID.slice(0, 8)}`,
    },
    {
      id: orgBJobId,
      organization_id: ORG_B_ID,
      title: 'Org B Upwork Job',
      description: 'Org B job description with secret details',
      owner_rep_id: `rep-${ORG_B_ID.slice(0, 8)}`,
    },
  ])

  // For few-shot wins test: insert messages + outcomes
  await admin.from('messages').insert([
    {
      id: orgAMessageId,
      organization_id: ORG_A_ID,
      lead_id: orgALeadId,
      sent_text: 'Org A winning message that got a reply',
    },
    {
      id: orgBMessageId,
      organization_id: ORG_B_ID,
      lead_id: orgBLeadId,
      sent_text: 'Org B winning message that got a reply',
    },
  ])

  await admin.from('outcomes').insert([
    {
      id: orgAOutcomeId,
      organization_id: ORG_A_ID,
      lead_id: orgALeadId,
      stage: 'replied',
    },
    {
      id: orgBOutcomeId,
      organization_id: ORG_B_ID,
      lead_id: orgBLeadId,
      stage: 'replied',
    },
  ])

  // ── Sign in as Org A user ──
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

  // ── Test 1: archive_search ──
  console.log('\n4. Testing archive_search RPC isolation...')

  const { data: archiveResults, error: archiveErr } = await clientA.rpc('archive_search', {
    query: 'Secret Company confidential project',
    entity_filter: 'all',
    result_limit: 50,
  })
  if (archiveErr) {
    console.log(`   ❌ archive_search ERROR: ${archiveErr.message}`)
    failures++
  } else {
    const results = (archiveResults ?? []) as { entity_type: string; title: string; subtitle: string }[]
    const orgBLeaks = results.filter(
      (r) =>
        r.title.includes('Org B') ||
        r.subtitle.includes('Org B') ||
        r.subtitle.includes('Org B Contact'),
    )
    assert(results.some((r) => r.title.includes('Org A')), 'archive_search returns Org A data')
    assert(orgBLeaks.length === 0, `archive_search does NOT leak Org B data (${orgBLeaks.length} leaks)`)
  }

  // ── Test 2: match_proofs_by_embedding ──
  console.log('\n5. Testing match_proofs_by_embedding RPC isolation...')

  // Use a dummy embedding (all zeros except first dimension)
  const dummyEmbedding = new Array(384).fill(0)
  dummyEmbedding[0] = 0.5
  dummyEmbedding[1] = 0.3

  const { data: matchResults, error: matchErr } = await clientA.rpc('match_proofs_by_embedding', {
    query_embedding: `[${dummyEmbedding.join(',')}]`,
    match_threshold: 0.0,
    match_count: 50,
  })
  if (matchErr) {
    console.log(`   ❌ match_proofs_by_embedding ERROR: ${matchErr.message}`)
    failures++
  } else {
    const proofs = (matchResults ?? []) as { id: string; project_summary: string }[]
    const orgBLeaks = proofs.filter(
      (p) => p.id === orgBProofId || p.project_summary.includes('Org B'),
    )
    const orgAHits = proofs.filter(
      (p) => p.id === orgAProofId || p.project_summary.includes('Org A'),
    )
    assert(orgBLeaks.length === 0, `match_proofs does NOT leak Org B proofs (${orgBLeaks.length} leaks)`)
    assert(orgAHits.length > 0 || proofs.length === 0, 'match_proofs returns Org A proofs (or none if no embeddings)')
  }

  // ── Test 3: refresh_few_shot_wins ──
  console.log('\n6. Testing refresh_few_shot_wins RPC isolation...')

  // Delete any existing few-shot wins for these messages first
  await admin.from('few_shot_wins').delete().in('message_id', [orgAMessageId, orgBMessageId])

  // Call refresh for Org A only
  const { data: refreshCount, error: refreshErr } = await clientA.rpc('refresh_few_shot_wins', {
    p_org_id: ORG_A_ID,
  })
  if (refreshErr) {
    console.log(`   ❌ refresh_few_shot_wins ERROR: ${refreshErr.message}`)
    failures++
  } else {
    console.log(`   Refreshed ${refreshCount} wins for Org A`)

    // Verify Org B's message was NOT added to few_shot_wins
    const { data: orgBWins } = await admin
      .from('few_shot_wins')
      .select('id, message_id, organization_id')
      .eq('message_id', orgBMessageId)

    assert(
      !orgBWins || orgBWins.length === 0,
      `refresh_few_shot_wins did NOT create Org B wins (${orgBWins?.length ?? 0} found)`,
    )

    // Verify Org A's message WAS added with correct org
    const { data: orgAWins } = await admin
      .from('few_shot_wins')
      .select('id, message_id, organization_id')
      .eq('message_id', orgAMessageId)

    assert(
      Boolean(orgAWins && orgAWins.length > 0),
      'refresh_few_shot_wins created Org A wins',
    )
    assert(
      (orgAWins && orgAWins.length > 0 ? orgAWins[0].organization_id === ORG_A_ID : false),
      `Org A wins have correct organization_id (${orgAWins?.[0]?.organization_id})`,
    )
  }

  // ── Test 4: Org B user calling archive_search ──
  console.log('\n7. Testing Org B user calling archive_search (should NOT see Org A)...')

  const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signInB } = await clientB.auth.signInWithPassword({
    email: USER_B_EMAIL,
    password: TEST_PASSWORD,
  })
  if (!signInB.user) {
    console.error('   FATAL: Could not sign in as Org B user')
    process.exit(1)
  }

  const { data: archiveB, error: archiveBErr } = await clientB.rpc('archive_search', {
    query: 'Org A Secret',
    entity_filter: 'all',
    result_limit: 50,
  })
  if (archiveBErr) {
    console.log(`   ❌ archive_search ERROR: ${archiveBErr.message}`)
    failures++
  } else {
    const resultsB = (archiveB ?? []) as { title: string }[]
    const orgALeaks = resultsB.filter((r) => r.title.includes('Org A'))
    assert(orgALeaks.length === 0, `Org B user cannot see Org A via archive_search (${orgALeaks.length} leaks)`)
  }

  // ── Summary ──
  console.log('\n=== Summary ===')
  console.log(`   Passes: ${passes}  |  Failures: ${failures}`)

  // ── Cleanup ──
  console.log('\n8. Cleaning up test data...')
  await admin.from('few_shot_wins').delete().in('message_id', [orgAMessageId, orgBMessageId])
  await admin.from('outcomes').delete().in('id', [orgAOutcomeId, orgBOutcomeId])
  await admin.from('messages').delete().in('id', [orgAMessageId, orgBMessageId])
  await admin.from('upwork_jobs').delete().in('id', [orgAJobId, orgBJobId])
  await admin.from('proof_items').delete().in('id', [orgAProofId, orgBProofId])
  await admin.from('leads').delete().in('id', [orgALeadId, orgBLeadId])
  await admin.from('reps').delete().in('id', [`rep-${ORG_A_ID.slice(0, 8)}`, `rep-${ORG_B_ID.slice(0, 8)}`])
  await admin.from('organizations').delete().in('id', [ORG_A_ID, ORG_B_ID])
  await admin.auth.admin.deleteUser(USER_A_ID)
  await admin.auth.admin.deleteUser(USER_B_ID)
  console.log('   Done.')

  console.log('\n=== Test Complete ===')
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
