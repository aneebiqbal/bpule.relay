#!/usr/bin/env node
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
require('dotenv').config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const orgId = process.env.SCOUT_PROOF_ORG_ID
const repId = process.env.SCOUT_PROOF_REP_ID

if (!url || !serviceKey || !anonKey || !orgId || !repId) {
  console.error('Missing required env vars.')
  process.exit(1)
}

const serviceClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const proofNonce = Date.now()
  const email = `orch-proof-${proofNonce}@scout.dev`
  const password = 'OrchProof123!'

  // Create and link auth user
  const { data: createData, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError) {
    console.error('Create user failed:', createError.message)
    process.exit(1)
  }
  const authUserId = createData.user?.id
  if (!authUserId) {
    console.error('No user ID')
    process.exit(1)
  }

  // Link to rep
  const { error: linkError } = await serviceClient
    .from('reps')
    .update({ auth_user_id: authUserId })
    .eq('id', repId)
  if (linkError) {
    console.error('Link failed:', linkError.message)
    process.exit(1)
  }

  // Sign in
  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) {
    console.error('Sign in failed:', signInError.message)
    process.exit(1)
  }
  console.log('✓ Signed in')

  // Create lead via service role (simulates API route)
  const leadResult = await serviceClient
    .from('leads')
    .insert({
      organization_id: orgId,
      owner_rep_id: repId,
      company: `Orch Proof ${proofNonce}`,
      contact_name: 'Proof Contact',
      url: `https://linkedin.com/in/orch-proof-${proofNonce}`,
      direction: 'outbound',
      source: 'linkedin',
      signal_type: 1,
      signal_evidence: 'proof signal',
      canonical_score: 8,
      score_version: 'v2',
      scored_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (leadResult.error) {
    console.error('Lead create failed:', leadResult.error.message)
    process.exit(1)
  }
  const leadId = leadResult.data.id
  console.log('✓ Lead created:', leadId)

  // Use the authenticated client to create a relay run (simulates what createLead now does internally)
  // We call the RPCs directly since we're bypassing the store's createLead method
  console.log('\n--- Testing orchestration RPCs directly ---')

  // 1. Create relay run via RPC
  const { data: runId, error: runError } = await authClient.rpc('create_relay_run', {
    p_org_id: orgId,
    p_run_type: 'outbound',
    p_primary_entity_type: 'lead',
    p_primary_entity_id: leadId,
    p_assigned_rep_id: repId,
  })
  console.log('create_relay_run:', runError ? runError.message : `✓ ${runId}`)

  if (!runId) {
    console.error('FAIL: no run created')
    process.exit(1)
  }

  // 2. Transition through the pipeline
  const transitions = [
    { from: 'detected', to: 'qualifying' },
    { from: 'qualifying', to: 'qualified' },
    { from: 'qualified', to: 'preparing' },
    { from: 'preparing', to: 'awaiting_human' },
    { from: 'awaiting_human', to: 'action_recorded' },
    { from: 'action_recorded', to: 'waiting' },
  ]

  for (const t of transitions) {
    const { error: tError } = await authClient.rpc('transition_relay_run', {
      p_run_id: runId,
      p_org_id: orgId,
      p_new_status: t.to,
    })
    if (tError) {
      console.error(`  transition ${t.from} -> ${t.to}: ${tError.message}`)
    } else {
      console.log(`  ✓ ${t.from} -> ${t.to}`)
    }
  }

  // 3. Verify idempotency - try to create duplicate run
  const { data: dupRunId } = await authClient.rpc('create_relay_run', {
    p_org_id: orgId,
    p_run_type: 'outbound',
    p_primary_entity_type: 'lead',
    p_primary_entity_id: leadId,
    p_assigned_rep_id: repId,
  })
  console.log('\nIdempotency test:')
  console.log('  Duplicate create returned:', dupRunId)
  console.log('  Same as original?', dupRunId === runId ? '✓ PASS' : '✗ FAIL')

  // 4. Verify invalid transition is rejected
  const { error: invalidError } = await authClient.rpc('transition_relay_run', {
    p_run_id: runId,
    p_org_id: orgId,
    p_new_status: 'waiting', // already at waiting, should fail
  })
  console.log('\nInvalid transition test:')
  console.log('  Attempted waiting -> waiting:', invalidError ? '✓ rejected' : '✗ accepted')

  // 5. Cleanup
  await serviceClient.from('leads').delete().eq('id', leadId)
  await serviceClient.from('relay_runs').delete().eq('id', runId)
  await serviceClient.from('relay_events').delete().eq('relay_run_id', runId)
  console.log('\n✓ Cleanup complete')
  console.log('\n=== ALL CHECKS COMPLETE ===')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
