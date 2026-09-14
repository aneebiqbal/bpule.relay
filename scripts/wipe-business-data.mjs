#!/usr/bin/env node
/**
 * Clears all business/activity data while keeping organizations, reps, and
 * org configuration (organization_rulebooks) intact. Also removes any
 * leftover test organizations (and their auth users) created by
 * scripts/rls-multitenant.mjs runs that were never cleaned up.
 *
 * Deliberately NOT cleared: organizations, reps, organization_rulebooks,
 * content_post_structures (curated seed data, not user-generated).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Safety: requires --confirm flag and DEMO_MODE=1 or local Supabase URL.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRole) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

// Safety: require explicit confirmation and non-production environment
const isLocal = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('supabase.co') === false
const isDemo = process.env.DEMO_MODE === '1'
const confirmed = process.argv.includes('--confirm')

if (!confirmed) {
  console.error('This script DELETES business data. Pass --confirm to proceed.')
  console.error('Example: DEMO_MODE=1 node scripts/wipe-business-data.mjs --confirm')
  process.exit(1)
}

if (!isLocal && !isDemo) {
  console.error('Refusing to run on non-local/non-demo Supabase. Set DEMO_MODE=1 or use local Supabase.')
  process.exit(1)
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const KEEP_ORG_ID = '11111111-1111-1111-1111-111111111111'

// Child tables first, so no FK violations. content_personas cascades to
// most content_* tables anyway (on delete cascade), but clearing explicitly
// keeps this script correct even if a future migration removes a cascade.
const BUSINESS_TABLES = [
  'content_draft_feedback',
  'content_evaluations',
  'content_interview_answers',
  'content_interview_sessions',
  'content_idea_genomes',
  'content_opportunities',
  'content_memories',
  'content_research_findings',
  'content_engagement_events',
  'content_history',
  'content_drafts',
  'trending_angles',
  'topic_clusters',
  'content_profiles',
  'content_pillars',
  'content_personas',
  'host_calls',
  'extraction_runs',
  'eval_runs',
  'golden_set',
  'few_shot_wins',
  'outcomes',
  'messages',
  'upwork_messages',
  'upwork_jobs',
  'proof_items',
  'profiles',
  'leads',
  'voice_profiles',
  'facts',
  'plays',
  'notification_log',
  'csv_imports',
  'push_subscriptions',
  // relay revenue intelligence tables
  'edit_learning',
  'sales_memory',
  'conversation_states',
  'proof_cards',
  'profile_assignments',
]

async function clearTable(table) {
  const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) {
    if (error.message?.includes('Could not find the table') || error.message?.includes('does not exist')) {
      console.log(`  skipped ${table} (does not exist)`)
      return
    }
    console.error(`  FAILED ${table}: ${error.message}`)
    throw error
  }
  console.log(`  cleared ${table}`)
}

async function removeLeftoverTestOrgs() {
  const { data: orgs, error } = await supabase.from('organizations').select('id, name').neq('id', KEEP_ORG_ID)
  if (error) throw error
  if (!orgs || orgs.length === 0) {
    console.log('  no leftover test organizations found')
    return
  }

  for (const org of orgs) {
    console.log(`  removing test org: ${org.name} (${org.id})`)
    const { data: orgReps } = await supabase.from('reps').select('auth_user_id').eq('organization_id', org.id)
    // organizations has no direct cascade to reps in every migration path,
    // so remove reps explicitly before the org row.
    await supabase.from('reps').delete().eq('organization_id', org.id)
    await supabase.from('organizations').delete().eq('id', org.id)
    for (const rep of orgReps ?? []) {
      if (rep.auth_user_id) {
        await supabase.auth.admin.deleteUser(rep.auth_user_id).catch(() => {})
      }
    }
  }
}

async function removeReps(names) {
  for (const name of names) {
    const { data: rep } = await supabase.from('reps').select('id, auth_user_id').eq('organization_id', KEEP_ORG_ID).eq('name', name).maybeSingle()
    if (!rep) {
      console.log(`  no rep named ${name}, skipping`)
      continue
    }
    await supabase.from('reps').delete().eq('id', rep.id)
    if (rep.auth_user_id) {
      await supabase.auth.admin.deleteUser(rep.auth_user_id).catch(() => {})
    }
    console.log(`  removed rep ${name}`)
  }
}

async function main() {
  console.log('Step 1: Removing leftover test organizations...')
  await removeLeftoverTestOrgs()

  console.log('\nStep 2: Clearing business data (main org kept)...')
  for (const table of BUSINESS_TABLES) {
    await clearTable(table)
  }

  console.log('\nStep 3: Removing reps not in the requested roster (Abdullah, Mehak, Zaira)...')
  await removeReps(['Abdullah', 'Mehak', 'Zaira'])

  console.log('\nDone. Business data cleared; organizations, remaining reps, and organization_rulebooks kept intact.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
