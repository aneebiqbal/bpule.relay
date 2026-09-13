#!/usr/bin/env node
/**
 * Deletes every content_personas row (cascades to topic_clusters,
 * content_drafts, content_history, content_draft_feedback,
 * content_research_findings, content_engagement_events via FK on delete
 * cascade). Scoped to Studio only — does not touch leads, upwork, voice
 * profiles, or anything else.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRole) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data: before, error: countError } = await supabase
    .from('content_personas')
    .select('id, display_name')
  if (countError) throw countError

  console.log(`Found ${before.length} persona(s):`)
  for (const p of before) console.log(`  - ${p.display_name} (${p.id})`)

  if (before.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  const { error: deleteError } = await supabase
    .from('content_personas')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) throw deleteError

  const { data: after, error: verifyError } = await supabase
    .from('content_personas')
    .select('id')
  if (verifyError) throw verifyError

  console.log(`\nDeleted. ${after.length} persona(s) remain (expect 0).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
