#!/usr/bin/env node
/**
 * Relay production test-data manifest builder (read-only).
 *
 * Consumes relay-test-inventory.mjs output and applies PHASE 5 (protect real
 * child records): an explicitly-test parent that owns a child carrying an
 * explicit REAL marker (is_test=false, source_kind=PRODUCTION, human labeler,
 * won/lost outcome) is demoted to AMBIGUOUS_KEEP and is NOT deleted.
 *
 * Emits the immutable CONFIRMED_TEST manifest used by qa-cleanup.mjs.
 *
 *   node scripts/qa/relay-test-manifest.mjs --in /tmp/relay_inventory.json --out /tmp/relay_manifest.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }

const TEST_SOURCE_KINDS = new Set(['E2E', 'TEST', 'DEMO', 'QA', 'SYNTHETIC'])

async function get(table, select, filter, limit = 2000) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${select}&${filter}&limit=${limit}`, { headers: H })
  if (!res.ok) throw new Error(`GET ${table} failed ${res.status}`)
  return res.json()
}

/** Explicit REAL markers only. Unmarked rows are treated as test-derived. */
/** Explicit REAL markers only. Unmarked rows are treated as test-derived. */
function childIsRealLooking(table, row) {
  if (table === 'outcomes') return true // outcome history is a real-activity signal
  if (row.is_test === false) return true
  if (row.source_kind === 'PRODUCTION') return true
  if (table === 'scoring_feedback' && row.rep_id) return true // human feedback
  if (row.labeler_id || row.labeler_rep_id) return true
  if (row.won_at || row.lost_at) return true
  if (row.human_feedback) return true
  return false
}

const LEAD_CHILD_TABLES = [
  ['intelligence_samples', 'lead_id', 'is_test,source_kind,labeler_id,label_status'],
  ['scoring_shadow_decisions', 'lead_id', 'is_test,candidate_engine'],
  ['scoring_feedback', 'lead_id', 'rep_id,captured_prospect_id'],
  ['scoring_labels', 'lead_id', 'labeler_rep_id'],
  ['outcomes', 'lead_id', 'stage'],
  ['golden_set', 'lead_id', 'id'],
  ['messages', 'lead_id', 'direction,idempotency_key'],
  ['conversation_states', 'lead_id', 'won_at,lost_at,last_reply_at'],
  ['action_events', 'lead_id', 'action_type'],
  ['sales_memory', 'lead_id', 'content'],
  ['signal_events', 'lead_id', 'id'],
  ['relay_runs', 'primary_entity_id', 'id,primary_entity_type,run_type', 'primary_entity_type=eq.lead'],
]

async function main() {
  const inIdx = process.argv.indexOf('--in')
  const outIdx = process.argv.indexOf('--out')
  const inv = JSON.parse(readFileSync(process.argv[inIdx + 1], 'utf8'))

  const testLeads = inv.confirmed_test.leads
  const testProspects = inv.confirmed_test.captured_prospects
  const testSamples = inv.confirmed_test.intelligence_samples

  // Phase 5: gather children of every explicitly-test lead (one batched query per table).
  const leadIds = testLeads.map((l) => l.id)
  const leadChildren = new Map()
  for (const lead of testLeads) leadChildren.set(lead.id, [])
  for (const [table, col, sel, extra] of LEAD_CHILD_TABLES) {
    const filter = `${col}=in.(${leadIds.join(',')})` + (extra ? `&${extra}` : '')
    const rows = await get(table, `${sel},${col}`, filter)
    for (const row of rows) {
      if (leadChildren.has(row[col])) leadChildren.get(row[col]).push({ table, ...row })
    }
  }

  const confirmedTestLeads = []
  const ambiguousLeads = []
  for (const lead of testLeads) {
    const children = leadChildren.get(lead.id) || []
    const realChild = children.find((c) => childIsRealLooking(c.table, c))
    if (realChild) {
      ambiguousLeads.push({ ...lead, blocker: `${realChild.table}:${realChild.is_test === false ? 'is_test=false' : realChild.source_kind || realChild.labeler_id || 'real-marker'}` })
    } else {
      confirmedTestLeads.push({ ...lead, child_count: children.length })
    }
  }

  // Prospects / samples: children are scoring rows + sample events.
  const prospectChildren = new Map()
  for (const p of testProspects) prospectChildren.set(p.id, [])
  for (const [table, col, sel] of [['scoring_feedback', 'captured_prospect_id', 'id,rep_id'], ['scoring_labels', 'captured_prospect_id', 'id,labeler_rep_id'], ['scoring_shadow_decisions', 'captured_prospect_id', 'id,is_test']]) {
    const rows = await get(table, `${sel},${col}`, `${col}=in.(${testProspects.map((p) => p.id).join(',')})`)
    for (const row of rows) if (prospectChildren.has(row[col])) prospectChildren.get(row[col]).push({ table, ...row })
  }
  const confirmedTestProspects = []
  const ambiguousProspects = []
  for (const p of testProspects) {
    const children = prospectChildren.get(p.id) || []
    const realChild = children.find((c) => childIsRealLooking(c.table, c))
    if (realChild) ambiguousProspects.push({ ...p, blocker: `${realChild.table}:${realChild.is_test}` })
    else confirmedTestProspects.push(p)
  }

  const sampleChildren = new Map()
  for (const s of testSamples) sampleChildren.set(s.id, [])
  const sampleEvents = await get('intelligence_sample_events', 'id,sample_id,event_type', `sample_id=in.(${testSamples.map((s) => s.id).join(',')})`)
  for (const row of sampleEvents) if (sampleChildren.has(row.sample_id)) sampleChildren.get(row.sample_id).push(row)
  // Sample events are unmarked but provably test-derived; they are deletable.
  const confirmedTestSamples = testSamples

  // Dependency counts for the delete manifest (children first).
  const depCounts = {}
  const delLeadIds = confirmedTestLeads.map((l) => l.id)
  const prospectIds = confirmedTestProspects.map((p) => p.id)
  const sampleIds = confirmedTestSamples.map((s) => s.id)
  const countFor = async (table, col, ids) => {
    if (!ids.length) return 0
    const res = await fetch(`${url}/rest/v1/${table}?select=id&${col}=in.(${ids.join(',')})&limit=1`, {
      method: 'HEAD', headers: { ...H, Prefer: 'count=exact' },
    })
    return Number(res.headers.get('content-range').split('/')[1])
  }
  for (const [table, col] of [['intelligence_sample_events', 'sample_id'], ['scoring_shadow_decisions', 'captured_prospect_id'], ['scoring_feedback', 'captured_prospect_id'], ['scoring_labels', 'captured_prospect_id']]) {
    depCounts[`${table}<-captured_prospects`] = await countFor(table, col, prospectIds)
  }
  for (const [table, col] of [['intelligence_sample_events', 'sample_id'], ['scoring_shadow_decisions', 'lead_id'], ['scoring_feedback', 'lead_id'], ['scoring_labels', 'lead_id'], ['messages', 'lead_id'], ['conversation_states', 'lead_id'], ['action_events', 'lead_id'], ['sales_memory', 'lead_id'], ['signal_events', 'lead_id'], ['outcomes', 'lead_id'], ['golden_set', 'lead_id'], ['intelligence_samples', 'lead_id'], ['captured_prospects', 'converted_lead_id'], ['relay_runs', 'primary_entity_id']]) {
    depCounts[`${table}<-leads`] = await countFor(table, col, delLeadIds)
  }
  depCounts['intelligence_sample_events<-samples'] = await countFor('intelligence_sample_events', 'sample_id', sampleIds)

  const manifest = {
    generated_at: new Date().toISOString(),
    source_inventory: process.argv[inIdx + 1],
    confirmed_test: {
      leads: confirmedTestLeads,
      captured_prospects: confirmedTestProspects,
      intelligence_samples: confirmedTestSamples,
    },
    ambiguous_keep: { leads: ambiguousLeads, captured_prospects: ambiguousProspects },
    dependency_counts: depCounts,
    delete_order: [
      'intelligence_sample_events',
      'scoring_shadow_decisions',
      'scoring_feedback',
      'scoring_labels',
      'action_events',
      'conversation_states',
      'messages',
      'sales_memory',
      'signal_events',
      'outcomes',
      'golden_set',
      'relay_runs',
      'intelligence_samples',
      'captured_prospects',
      'leads',
    ],
  }
  manifest.file_hash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
  manifest.confirmed_test_hash = createHash('sha256').update(JSON.stringify(manifest.confirmed_test)).digest('hex')
  writeFileSync(process.argv[outIdx + 1], JSON.stringify(manifest, null, 2))
  console.error(`CONFIRMED_TEST leads=${confirmedTestLeads.length} prospects=${confirmedTestProspects.length} samples=${confirmedTestSamples.length}`)
  console.error(`AMBIGUOUS_KEEP leads=${ambiguousLeads.length} prospects=${ambiguousProspects.length}`)
  console.error(`deps=${JSON.stringify(depCounts)}`)
  console.error(`wrote ${process.argv[outIdx + 1]}`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
