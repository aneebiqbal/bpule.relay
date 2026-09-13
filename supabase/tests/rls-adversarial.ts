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
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!
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
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
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
    'eval_runs', 'extraction_runs',
  ]

  const results: TableResult[] = []

  for (const table of tables) {
    const { data, error } = await testClient.from(table).select('id, organization_id')
    if (error) {
      console.log(`   ⚠ ${table}: ERROR — ${error.message}`)
      results.push({ table, visibleRows: -1, leakedRows: [], pass: false })
      continue
    }
    const rows = (data || []) as { id: string; organization_id?: string }[]
    const leaked = rows.filter((r) => r.organization_id === BPULSE_ORG_ID)
    const pass = leaked.length === 0
    results.push({ table, visibleRows: rows.length, leakedRows: leaked, pass })
    const status = pass ? '✅' : '❌ LEAK'
    console.log(`   ${status} ${table}: ${rows.length} visible, ${leaked.length} leaked`)
  }

  // Step 6: Summary
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

  // Step 7: Cleanup
  console.log('\n6. Cleaning up...')
  await admin.from('reps').delete().eq('id', 'rep-test-b')
  await admin.from('organizations').delete().eq('id', TEST_ORG_ID)
  await admin.auth.admin.deleteUser(TEST_USER_ID)
  console.log('   Done.')
  console.log('\n=== Test Complete ===')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
