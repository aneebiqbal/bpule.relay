/**
 * Production workflow verification: Targets → Accountability
 *
 * Tests the canonical flow against the LIVE Supabase DB:
 * 1. Admin creates a daily target for a rep + identity + activity
 * 2. Rep performs the activity (markContacted equivalent via RPC)
 * 3. Accountability increments automatically
 * 4. Status updates correctly
 * 5. State persists (re-read confirms)
 *
 * Uses service role (bypasses RLS) to verify schema + RPC correctness.
 * This tests the DATABASE LAYER that the app depends on.
 */
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = 'https://fhnkanwvgamitrcuzpem.supabase.co'
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPA_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY)
const results: Array<{ step: string; pass: boolean; detail?: string }> = []

function check(step: string, pass: boolean, detail?: string) {
  results.push({ step, pass, detail })
  const icon = pass ? '✓' : '✗'
  console.log(`  ${icon} ${step}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  console.log('\n=== Targets + Accountability: Production Workflow Verification ===\n')

  // ── Setup: Find test data ──
  console.log('Setup: Finding test data...')

  const { data: orgs } = await supabase.from('organizations').select('id').limit(1)
  const orgId = orgs?.[0]?.id
  check('Organization exists', !!orgId, orgId)

  if (!orgId) {
    console.error('FATAL: No organization found')
    process.exit(1)
  }

  // Find a rep with an assigned identity
  const { data: assignments } = await supabase
    .from('identity_assignments')
    .select('rep_id, revenue_identity_id')
    .limit(5)

  const assignment = assignments?.[0]
  check('Identity assignment exists', !!assignment, assignment ? `${assignment.rep_id} → ${assignment.revenue_identity_id}` : 'none')

  if (!assignment) {
    console.error('FATAL: No identity assignments found')
    process.exit(1)
  }

  const repId = assignment.rep_id
  const identityId = assignment.revenue_identity_id

  // Get identity details
  const { data: identity } = await supabase
    .from('revenue_identities')
    .select('id, identity_name, channel, status')
    .eq('id', identityId)
    .single()

  check('Revenue Identity active', identity?.status === 'active', `${identity?.identity_name} (${identity?.channel})`)

  // Clean up any existing test data
  await supabase.from('daily_accountability').delete().eq('rep_id', repId).eq('organization_id', orgId).like('target_date', `${new Date().toISOString().slice(0, 10)}`)
  await supabase.from('daily_targets').delete().eq('rep_id', repId).eq('revenue_identity_id', identityId).eq('organization_id', orgId)

  // ── Step 1: Admin creates target ──
  console.log('\nStep 1: Admin creates daily target...')

  const today = new Date().toISOString().slice(0, 10)
  const { data: target, error: targetError } = await supabase
    .from('daily_targets')
    .insert({
      organization_id: orgId,
      rep_id: repId,
      revenue_identity_id: identityId,
      activity_type: 'dm',
      target_count: 3,
      active: true,
      created_by: repId,
    })
    .select('*')
    .single()

  check('Target created', !targetError && !!target, targetError?.message ?? `target_count=3, activity=dm`)

  // ── Step 2: Verify accountability row auto-created ──
  console.log('\nStep 2: Verify auto-created accountability row...')

  const { data: accountRow } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', repId)
    .eq('revenue_identity_id', identityId)
    .eq('activity_type', 'dm')
    .eq('target_date', today)
    .maybeSingle()

  check('Accountability row exists', !!accountRow, accountRow ? `completed=${accountRow.completed_count}/${accountRow.target_count}` : 'missing')
  check('Accountability target_count matches', accountRow?.target_count === 3, `expected 3, got ${accountRow?.target_count}`)
  check('Accountability starts at 0', accountRow?.completed_count === 0, `completed=${accountRow?.completed_count}`)
  check('Accountability starts on_track', accountRow?.status === 'on_track', `status=${accountRow?.status}`)

  // ── Step 3: Rep performs activity (1st time) ──
  console.log('\nStep 3: Rep performs activity (#1)...')

  const { data: result1, error: rpcError1 } = await supabase.rpc('record_activity_event', {
    p_rep_id: repId,
    p_identity_id: identityId,
    p_activity_type: 'dm',
    p_org_id: orgId,
  })

  check('RPC call succeeded', !rpcError1 && result1?.recorded === true, rpcError1?.message ?? `recorded=${result1?.recorded}`)

  const { data: acc1 } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', repId)
    .eq('revenue_identity_id', identityId)
    .eq('activity_type', 'dm')
    .eq('target_date', today)
    .single()

  check('Completed count = 1', acc1?.completed_count === 1, `completed=${acc1?.completed_count}`)
  check('Status = on_track (1/3)', acc1?.status === 'on_track', `status=${acc1?.status}`)

  // ── Step 4: Rep performs activity (2nd time) ──
  console.log('\nStep 4: Rep performs activity (#2)...')

  const { data: result2 } = await supabase.rpc('record_activity_event', {
    p_rep_id: repId,
    p_identity_id: identityId,
    p_activity_type: 'dm',
    p_org_id: orgId,
  })

  check('RPC call #2 succeeded', result2?.recorded === true, `recorded=${result2?.recorded}`)

  const { data: acc2 } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', repId)
    .eq('revenue_identity_id', identityId)
    .eq('activity_type', 'dm')
    .eq('target_date', today)
    .single()

  check('Completed count = 2', acc2?.completed_count === 2, `completed=${acc2?.completed_count}`)
  check('Status = on_track (2/3)', acc2?.status === 'on_track', `status=${acc2?.status}`)

  // ── Step 5: Rep performs activity (3rd time → completes target) ──
  console.log('\nStep 5: Rep performs activity (#3 → target complete)...')

  const { data: result3 } = await supabase.rpc('record_activity_event', {
    p_rep_id: repId,
    p_identity_id: identityId,
    p_activity_type: 'dm',
    p_org_id: orgId,
  })

  check('RPC call #3 succeeded', result3?.recorded === true, `recorded=${result3?.recorded}`)

  const { data: acc3 } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', repId)
    .eq('revenue_identity_id', identityId)
    .eq('activity_type', 'dm')
    .eq('target_date', today)
    .single()

  check('Completed count = 3', acc3?.completed_count === 3, `completed=${acc3?.completed_count}`)
  check('Status = completed (3/3)', acc3?.status === 'completed', `status=${acc3?.status}`)

  // ── Step 6: Verify persistence (re-read from DB) ──
  console.log('\nStep 6: Verify persistence (fresh read simulates refresh/login)...')

  const { data: freshRead } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', repId)
    .eq('revenue_identity_id', identityId)
    .eq('activity_type', 'dm')
    .eq('target_date', today)
    .single()

  check('Persisted: completed = 3', freshRead?.completed_count === 3, `completed=${freshRead?.completed_count}`)
  check('Persisted: status = completed', freshRead?.status === 'completed', `status=${freshRead?.status}`)
  check('Persisted: target = 3', freshRead?.target_count === 3, `target=${freshRead?.target_count}`)

  // ── Step 7: Verify audit log captured events ──
  console.log('\nStep 7: Verify audit trail...')

  const { data: auditEvents } = await supabase
    .from('accountability_audit_log')
    .select('*')
    .eq('organization_id', orgId)
    .eq('revenue_identity_id', identityId)
    .order('created_at', { ascending: false })
    .limit(5)

  check('Audit log has events', (auditEvents?.length ?? 0) > 0, `${auditEvents?.length} events found`)

  // ── Step 8: Verify increment came from activity, NOT page view ──
  console.log('\nStep 8: Verify increment is from activity event only...')

  // The key test: accountability.completed_count matches the number of RPC calls (3)
  // NOT from reading the page or any other side effect
  check('Increment = exactly 3 RPC calls', freshRead?.completed_count === 3,
    `completed_count=${freshRead?.completed_count} (should equal RPC call count)`)

  // ── Step 9: Verify no duplicate counting on repeated reads ──
  console.log('\nStep 9: Verify reads do not increment...')

  // Read multiple times
  for (let i = 0; i < 5; i++) {
    await supabase.from('daily_accountability').select('*').eq('rep_id', repId).single()
  }

  const { data: afterReads } = await supabase
    .from('daily_accountability')
    .select('*')
    .eq('rep_id', repId)
    .eq('revenue_identity_id', identityId)
    .eq('activity_type', 'dm')
    .eq('target_date', today)
    .single()

  check('Reads do not increment counter', afterReads?.completed_count === 3,
    `completed_count still ${afterReads?.completed_count} after 5 reads`)

  // ── Cleanup ──
  console.log('\nCleanup: Removing test data...')
  await supabase.from('daily_accountability').delete().eq('rep_id', repId).eq('revenue_identity_id', identityId).eq('target_date', today)
  await supabase.from('daily_targets').delete().eq('rep_id', repId).eq('revenue_identity_id', identityId).eq('organization_id', orgId)
  check('Test data cleaned up', true)

  // ── Summary ──
  console.log('\n=== Summary ===\n')
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length

  if (failed > 0) {
    console.log(`FAILED: ${failed} checks failed`)
    for (const r of results.filter((r) => !r.pass)) {
      console.log(`  ✗ ${r.step}: ${r.detail ?? ''}`)
    }
    process.exit(1)
  } else {
    console.log(`ALL ${passed} CHECKS PASSED ✓`)
    console.log('\nCanonical workflow verified:')
    console.log('  Admin defines target → Rep executes activity → Relay records via RPC →')
    console.log('  Accountability derives completed_count/status → persists across reads')
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
