/**
 * Inspect live production schema for daily_targets and related objects.
 */
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = 'https://fhnkanwvgamitrcuzpem.supabase.co'
const SUPA_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY)

async function main() {
  console.log('\n=== Live Production Schema Inspection ===\n')

  // Try to select from daily_targets to see what columns exist
  const { data: dtData, error: dtError } = await supabase.from('daily_targets').select('*').limit(1)
  if (dtError) {
    console.log('daily_targets error:', dtError.message)
  } else if (dtData && dtData.length > 0) {
    console.log('daily_targets columns:', Object.keys(dtData[0]).join(', '))
  } else {
    // Table exists but empty — try inserting a minimal row to see what's expected
    const { error: insertErr } = await supabase.from('daily_targets').insert({
      organization_id: '00000000-0000-0000-0000-000000000000',
      rep_id: '00000000-0000-0000-0000-000000000000',
    }).select()
    console.log('daily_targets insert probe:', insertErr?.message ?? 'success')
  }

  // Check RPC
  const { error: rpcError } = await supabase.rpc('record_activity_event', {
    p_rep_id: '00000000-0000-0000-0000-000000000000',
    p_identity_id: '00000000-0000-0000-0000-000000000000',
    p_activity_type: 'dm',
    p_org_id: '00000000-0000-0000-0000-000000000000',
  })
  console.log('record_activity_event RPC:', rpcError ? `MISSING — ${rpcError.message}` : 'EXISTS')

  // Check daily_accountability
  const { data: daData, error: daError } = await supabase.from('daily_accountability').select('*').limit(1)
  if (daError) {
    console.log('daily_accountability error:', daError.message)
  } else if (daData && daData.length > 0) {
    console.log('daily_accountability columns:', Object.keys(daData[0]).join(', '))
  } else {
    console.log('daily_accountability: table exists, empty or wrong schema')
  }

  console.log('\n=== WHAT 0091 NEEDS TO FIX ===\n')
  console.log('If daily_targets errors mention "active", "target_count", or "activity_type":')
  console.log('  → The broken 0088 schema is live. Apply 0091.')
  console.log('If record_activity_event is MISSING:')
  console.log('  → The RPC was never created (0085 trigger/RPC not applied). Apply 0091.')
}

main().catch(console.error)
