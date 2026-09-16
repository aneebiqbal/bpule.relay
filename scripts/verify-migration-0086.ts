/**
 * Verify migration 0086 was applied to the remote Supabase project.
 * Run with: npx tsx scripts/verify-migration-0086.ts
 */
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = 'https://fhnkanwvgamitrcuzpem.supabase.co'
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPA_SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY)

async function main() {
  const results: Record<string, boolean | string> = {}

  // 1. Verify relay_events table exists
  const { data: eventsData, error: eventsError } = await supabase
    .from('relay_events')
    .select('id')
    .limit(0)
  results['relay_events table'] = eventsError ? `FAIL: ${eventsError.message}` : true

  // 2. Verify relay_runs table exists
  const { data: runsData, error: runsError } = await supabase
    .from('relay_runs')
    .select('id')
    .limit(0)
  results['relay_runs table'] = runsError ? `FAIL: ${runsError.message}` : true

  // 3. Verify RPCs exist via information_schema
  const { data: rpcs, error: rpcsError } = await supabase.rpc('emit_relay_event', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_event_type: 'TEST',
    p_entity_type: 'test',
    p_source: 'migration_verify',
    p_source_event_id: `verify_${Date.now()}`,
  })
  // We expect a cross-org denial (not a "function does not exist" error)
  results['emit_relay_event rpc'] = typeof rpcs === 'string' ? true : `FAIL: ${rpcsError?.message ?? 'unknown'}`

  // 4. Test idempotency: emit same event twice
  const idempotencyId = `idempotency_test_${Date.now()}`
  const { data: evt1, error: evt1Err } = await supabase.rpc('emit_relay_event', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_event_type: 'TEST_IDEMPOTENT',
    p_entity_type: 'test',
    p_source: 'migration_verify',
    p_source_event_id: idempotencyId,
  })

  const { data: evt2, error: evt2Err } = await supabase.rpc('emit_relay_event', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_event_type: 'TEST_IDEMPOTENT',
    p_entity_type: 'test',
    p_source: 'migration_verify',
    p_source_event_id: idempotencyId,
  })

  if (evt1 === evt2 && typeof evt1 === 'string') {
    results['idempotency'] = true
  } else {
    results['idempotency'] = `FAIL: evt1=${evt1}, evt2=${evt2}, err=${evt2Err?.message}`
  }

  // 5. Verify the idempotency event exists exactly once
  const { count } = await supabase
    .from('relay_events')
    .select('id', { count: 'exact', head: true })
    .eq('source_event_id', idempotencyId)
  results['idempotency count = 1'] = count === 1 ? true : `FAIL: count=${count}`

  // 6. Clean up test event
  await supabase.from('relay_events').delete().eq('source_event_id', idempotencyId)

  // 7. Print results
  console.log('\n=== Migration 0086 Verification ===\n')
  let allPassed = true
  for (const [key, value] of Object.entries(results)) {
    const status = value === true ? 'PASS' : 'FAIL'
    if (value !== true) allPassed = false
    console.log(`  [${status}] ${key}${value !== true ? ': ' + value : ''}`)
  }
  console.log(`\n=== ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} ===\n`)

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
