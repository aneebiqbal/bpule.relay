#!/usr/bin/env node
/**
 * Remove test content personas from production.
 *
 * A test persona is identified by explicit provenance only:
 *   display_name matches /^(QA Deploy|Debug) \d{10,}$/i
 *   persona_role is empty
 *   created on 2026-10-21 (the QA window)
 *   it owns no drafts, history, findings, feedback, engagement, captures,
 *   journey, memories, pillars, opportunities, interviews, taste or genomes.
 *
 * Dry-run by default; --apply deletes the listed ids only.
 *
 *   node --env-file=.env.local scripts/qa/content-test-cleanup.mjs
 *   node --env-file=.env.local scripts/qa/content-test-cleanup.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG = '11111111-1111-1111-1111-111111111111'
const APPLY = process.argv.includes('--apply')

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const TEST_NAME = /^(QA Deploy|Debug)\s+\d{10,}$/i

const CHILD_TABLES = [
  'content_drafts', 'content_history', 'content_research_findings', 'content_draft_feedback',
  'content_engagement_events', 'content_quick_captures', 'content_journey', 'content_memories',
  'content_pillars', 'content_opportunities', 'content_interview_sessions', 'content_taste_profiles',
  'content_idea_genomes',
]

async function count(table, ids) {
  const { count: n, error } = await sb.from(table).select('id', { count: 'exact', head: true }).in('persona_id', ids)
  if (error) throw error
  return n ?? 0
}

async function main() {
  const { data: personas, error } = await sb
    .from('content_personas')
    .select('id, rep_id, display_name, persona_role, created_at')
    .eq('organization_id', ORG)
  if (error) throw error

  const candidates = (personas ?? []).filter((p) =>
    TEST_NAME.test(String(p.display_name ?? '').trim())
    && !String(p.persona_role ?? '').trim()
    && String(p.created_at ?? '').startsWith('2026-10-21'),
  )

  const ids = candidates.map((p) => p.id)
  const report = { found: candidates.map((p) => ({ id: p.id, name: p.display_name, rep: p.rep_id, created_at: p.created_at })), blocked: [] }

  if (ids.length > 0) {
    for (const table of CHILD_TABLES) {
      const n = await count(table, ids)
      if (n > 0) report.blocked.push({ table, rows: n })
    }
  }

  console.log(JSON.stringify(report, null, 2))
  if (report.blocked.length > 0) {
    console.error('Refusing: a candidate owns real content rows.')
    process.exit(1)
  }
  if (!APPLY) {
    console.log(`DRY-RUN — ${ids.length} test persona(s) would be deleted. Pass --apply.`)
    return
  }
  if (ids.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  for (const table of ['daily_content_ideas', 'daily_content_briefs']) {
    const { error: e } = await sb.from(table).delete().in('persona_id', ids)
    if (e) throw e
  }
  const { error: e } = await sb.from('content_personas').delete().in('id', ids)
  if (e) throw e

  const { count: remaining } = await sb.from('content_personas').select('id', { count: 'exact', head: true }).in('id', ids)
  const { count: profiles } = await sb.from('content_profiles').select('id', { count: 'exact', head: true }).in('persona_id', ids)
  console.log(`APPLIED — remaining personas=${remaining ?? 0} remaining profiles=${profiles ?? 0}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
