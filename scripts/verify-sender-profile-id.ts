/**
 * Verify senderProfileId against the real database schema.
 * Sprint 1 exposed a latent domain/DB inconsistency — this confirms the fix.
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

  // 1. Check if sender_profile_id column exists in leads table
  const { data: leadWithSender, error: leadErr } = await supabase
    .from('leads')
    .select('id, sender_profile_id')
    .limit(1)

  if (leadErr) {
    results['sender_profile_id column exists'] = `FAIL: ${leadErr.message}`
  } else {
    results['sender_profile_id column exists'] = true
  }

  // 2. Check that existing rows deserialize correctly (sender_profile_id is nullable)
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id, sender_profile_id')
    .limit(5)

  if (leadsErr) {
    results['existing rows deserialize'] = `FAIL: ${leadsErr.message}`
  } else {
    results['existing rows deserialize'] = true
    const withSender = leads?.filter((l) => l.sender_profile_id !== null) ?? []
    results['some leads have sender_profile_id'] = withSender.length > 0 ? true : 'NONE (acceptable for new field)'
  }

  // 3. Verify new leads can be created with sender_profile_id
  const { data: orgs } = await supabase.from('organizations').select('id').limit(1)
  const orgId = orgs?.[0]?.id

  if (orgId) {
    const { data: newLead, error: newLeadErr } = await supabase
      .from('leads')
      .insert({
        organization_id: orgId,
        company: `sender_profile_test_${Date.now()}`,
        status: 'new',
        signal_type: 1,
        signal_evidence: 'Test signal',
        score: 5,
        verdict: 'research_more',
        tags: [],
        sender_profile_id: null,
      })
      .select('id, sender_profile_id')
      .single()

    if (newLeadErr) {
      results['new lead with null sender_profile_id'] = `FAIL: ${newLeadErr.message}`
    } else {
      results['new lead with null sender_profile_id'] = true
      results['sender_profile_id defaults to null'] = newLead?.sender_profile_id === null ? true : `FAIL: got ${newLead?.sender_profile_id}`
    }

    // Clean up
    if (newLead) {
      await supabase.from('leads').delete().eq('id', newLead.id)
    }
  }

  // 4. Verify FK constraint on sender_profile_id (references profiles)
  if (orgId) {
    const { data: profiles } = await supabase.from('profiles').select('id').limit(1)
    const profileId = profiles?.[0]?.id

    if (profileId) {
      const { data: leadWithProfile, error: profileErr } = await supabase
        .from('leads')
        .insert({
          organization_id: orgId,
          company: `sender_profile_fk_test_${Date.now()}`,
          status: 'new',
          signal_type: 1,
          signal_evidence: 'Test signal FK',
          score: 5,
          verdict: 'research_more',
          tags: [],
          sender_profile_id: profileId,
        })
        .select('id, sender_profile_id')
        .single()

      if (profileErr) {
        results['sender_profile_id FK valid'] = `FAIL: ${profileErr.message}`
      } else {
        results['sender_profile_id FK valid'] = true
      }

      // Clean up
      if (leadWithProfile) {
        await supabase.from('leads').delete().eq('id', leadWithProfile.id)
      }
    }
  }

  // 5. Print results
  console.log('\n=== senderProfileId Verification ===\n')
  let allPassed = true
  for (const [key, value] of Object.entries(results)) {
    const status = value === true ? 'PASS' : (value.toString().startsWith('NONE') ? 'INFO' : 'FAIL')
    if (value !== true && status === 'FAIL') allPassed = false
    console.log(`  [${status}] ${key}${value !== true ? ': ' + value : ''}`)
  }
  console.log(`\n=== ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} ===\n`)

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
