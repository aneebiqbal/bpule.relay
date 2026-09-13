import { createClient } from '@supabase/supabase-js'

/**
 * RLS Adversarial Test — Multi-Tenant Isolation Verification
 *
 * Creates a test org + user, then verifies the user cannot see bpulse's data.
 *
 * Usage:
 *   1. Set SUPABASE_SERVICE_KEY in your .env (service role key, not anon)
 *   2. npx ts-node supabase/tests/rls-adversarial.ts
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const TEST_ORG_ID = '99999999-9999-9999-9999-999999999999'
const TEST_USER_ID = '88888888-8888-8888-8888-888888888888'
const TEST_USER_EMAIL = 'test-org-b@example.com'
const TEST_USER_PASSWORD = 'test-password-123'
const BPULSE_ORG_ID = '11111111-1111-1111-1111-111111111111'

interface TableResult {
  table: string
  visibleRows: number
  leakedRows: { id: string; organization_id?: string }[]
  pass: boolean
}

async function main() {
  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('=== RLS Adversarial Test: Multi-Tenant Isolation ===\n')

  // Step 1: Create test org
  console.log('1. Creating test organization...')
  await admin.from('organizations').upsert({ id: TEST_ORG_ID, name: 'test-org-b', plan: 'trial' })

  // Step 2: Create test auth user
  console.log('2. Creating test auth user...')
  const { error: authError } = await admin.auth.admin.createUser({
    id: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
    user_metadata: { name: 'Test Org B Rep' },
  })
  if (authError && !authError.message.includes('already been registered')) {
    console.warn('   User may already exist, continuing...')
  }

  // Step 3: Create test rep
  console.log('3. Creating test rep in test org...')
  await admin.from('reps').upsert({
    id: 'rep-test-b',
    name: 'Test Org B Rep',
    role: 'admin',
    organization_id: TEST_ORG_ID,
    auth_user_id: TEST_USER_ID,
  })

  // Step 4: Sign in as test user to get a JWT
  console.log('4. Authenticating as test user...')
  const testClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  await testClient.auth.signInWithPassword({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

  // Step 5: Query every table as the test user
  console.log('\n5. Running adversarial queries (all should return 0 bpulse rows)...\n')

  const tables = [
    'leads', 'messages', 'outcomes', 'voice_profiles', 'facts', 'plays',
    'profiles', 'proof_items', 'golden_set', 'few_shot_wins', 'upwork_jobs',
    'upwork_messages', 'csv_imports', 'content_personas', 'content_pillars',
    'content_drafts', 'content_history', 'push_subscriptions', 'notification_log',
    'eval_runs', 'extraction_runs', 'organization_rulebooks', 'subscriptions',
  ]

  const results: TableResult[] = []

  for (const table of tables) {
    const selectCols = table === 'organization_rulebooks' ? 'organization_id' : 'id, organization_id'
    const { data, error } = await testClient.from(table).select(selectCols)
    if (error) {
      console.log(`   ⚠ ${table}: ERROR — ${error.message}`)
      results.push({ table, visibleRows: -1, leakedRows: [], pass: false })
      continue
    }
    const rows = (data || []) as unknown as { id: string; organization_id?: string }[]
    const leaked = rows.filter((r) => r.organization_id === BPULSE_ORG_ID)
    const pass = leaked.length === 0
    results.push({ table, visibleRows: rows.length, leakedRows: leaked, pass })
    const status = pass ? '✅' : '❌ LEAK'
    console.log(`   ${status} ${table}: ${rows.length} visible, ${leaked.length} leaked`)
  }

  // Step 6: Reverse direction — create data in org B, verify org A can't see it
  console.log('\n6. Reverse direction: creating data in org B...\n')

  const bpulseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: bpulseSignIn } = await bpulseUser.auth.signInWithPassword({
    email: 'hassan@bpulse.example.com',
    password: 'password123',
  })
  if (!bpulseSignIn.user) {
    console.log('   ⚠ Could not sign in as bpulse user, skipping reverse check')
  } else {
    // Create a lead in org B via admin (service role bypasses RLS)
    const testLeadId = '66666666-6666-6666-6666-666666666666'
    await admin.from('leads').insert({
      id: testLeadId,
      organization_id: TEST_ORG_ID,
      company: 'Test Org B Lead',
      company_key: 'test-org-b-lead',
      owner_rep_id: '77777777-7777-7777-7777-777777777777',
      signal_type: 7,
      signal_evidence: 'Test evidence',
      status: 'new',
    })

    // Now query as bpulse user — should NOT see org B's lead
    const { data: bpulseLeads } = await bpulseUser.from('leads').select('id, organization_id, company')
    const bpulseSeesOrgB = ((bpulseLeads || []) as { organization_id?: string }[])
      .filter((r) => r.organization_id === TEST_ORG_ID)

    if (bpulseSeesOrgB.length === 0) {
      console.log('   ✅ bpulse user CANNOT see org B data (reverse direction)')
    } else {
      console.log(`   ❌ LEAK: bpulse user can see ${bpulseSeesOrgB.length} rows from org B!`)
      console.log(`      Rows: ${JSON.stringify(bpulseSeesOrgB)}`)
    }

    // Cleanup test data
    await admin.from('leads').delete().eq('id', testLeadId)
  }

  // Step 7: Summary
  console.log('\n=== Summary ===')
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass && r.visibleRows >= 0).length
  console.log(`   Passed: ${passed}/${tables.length}  |  Failed: ${failed}/${tables.length}`)
  if (failed > 0) {
    console.log('\n   LEAKING TABLES:')
    for (const r of results.filter((r) => !r.pass && r.visibleRows > 0)) {
      console.log(`     - ${r.table}: ${r.leakedRows.length} rows from bpulse org`)
    }
  }

  // Step 8: Cleanup
  console.log('\n7. Cleaning up...')
  await admin.from('reps').delete().eq('id', '77777777-7777-7777-7777-777777777777')
  await admin.from('organizations').delete().eq('id', TEST_ORG_ID)
  await admin.auth.admin.deleteUser(TEST_USER_ID)
  console.log('   Done.')
  console.log('\n=== Test Complete ===')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
