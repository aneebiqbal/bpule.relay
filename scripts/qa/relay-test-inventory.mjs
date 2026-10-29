#!/usr/bin/env node
/**
 * Relay production test-data inventory (read-only).
 *
 * Classifies every lead / captured prospect / intelligence sample against
 * AUTHORITATIVE test provenance only. Never name-based. Emits a JSON manifest
 * consumed by qa-cleanup.mjs and the dry-run report.
 *
 *   node scripts/qa/relay-test-inventory.mjs            # stdout JSON
 *   node scripts/qa/relay-test-inventory.mjs --out FILE
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { writeFileSync } from 'node:fs'

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const TEST_SOURCE_KINDS = new Set(['E2E', 'TEST', 'DEMO', 'QA', 'SYNTHETIC'])
const headers = () => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(table, select, filter, limit = 2000) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?select=${select}&${filter}&limit=${limit}`, { headers: headers() })
      if (!res.ok) throw new Error(`GET ${table} failed ${res.status}`)
      return await res.json()
    } catch (e) {
      const cause = e?.cause?.code || e?.code
      const transient = cause === 'EADDRNOTAVAIL' || cause === 'ECONNRESET' || cause === 'ETIMEDOUT' || /fetch failed/i.test(String(e?.message))
      if (!transient || i === 4) throw e
      await sleep(700 * (i + 1))
    }
  }
}

async function exactCount(table, filter) {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&${filter}&limit=1`, {
    method: 'HEAD',
    headers: { ...headers(), Prefer: 'count=exact' },
  })
  const cr = res.headers.get('content-range')
  return cr ? Number(cr.split('/')[1]) : -1
}

/** A record is CONFIRMED_TEST only with explicit provenance. */
function classify({ is_test, source_kind }) {
  if (is_test === true || TEST_SOURCE_KINDS.has(source_kind)) return 'CONFIRMED_TEST'
  if (is_test === false && source_kind === 'PRODUCTION') return 'CONFIRMED_REAL'
  return 'AMBIGUOUS_KEEP'
}

const DEPENDENTS = {
  leads: [
    ['action_events', 'lead_id'], ['captured_prospects', 'converted_lead_id'],
    ['contact_points', 'lead_id'], ['conversation_states', 'lead_id'],
    ['email_messages', 'lead_id'], ['email_send_attempts', 'lead_id'],
    ['email_suppressions', 'lead_id'], ['few_shot_wins', 'lead_id'],
    ['golden_set', 'lead_id'], ['help_requests', 'lead_id'],
    ['intelligence_samples', 'lead_id'], ['messages', 'lead_id'],
    ['outcomes', 'lead_id'], ['prepared_email_drafts', 'lead_id'],
    ['profile_opportunity_matches', 'lead_id'], ['sales_memory', 'lead_id'],
    ['scoring_feedback', 'lead_id'], ['scoring_labels', 'lead_id'],
    ['scoring_shadow_decisions', 'lead_id'], ['signal_events', 'lead_id'],
  ],
  captured_prospects: [
    ['scoring_feedback', 'captured_prospect_id'], ['scoring_labels', 'captured_prospect_id'],
    ['scoring_shadow_decisions', 'captured_prospect_id'],
  ],
  intelligence_samples: [['intelligence_sample_events', 'sample_id']],
}

async function dependencyCounts(table, ids) {
  const out = {}
  for (const [dep, col] of DEPENDENTS[table]) {
    if (ids.length === 0) { out[dep] = 0; continue }
    const filter = `${col}=in.(${ids.join(',')})`
    out[dep] = await exactCount(dep, filter)
  }
  return out
}

async function main() {
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')

  const [leads, prospects, samples, orgs, reps] = await Promise.all([
    get('leads', 'id,company,owner_rep_id,organization_id,created_at,is_test,source_kind,decision_run_id', 'limit=2000'),
    get('captured_prospects', 'id,extracted_company,owner_rep_id,organization_id,created_at,is_test,source_kind', 'limit=5000'),
    get('intelligence_samples', 'id,lead_id,organization_id,created_at,is_test,source_kind,label_status,review_status', 'limit=2000'),
    get('organizations', 'id,name', 'limit=100'),
    get('reps', 'id,name,organization_id,role', 'limit=500'),
  ])

  const orgName = new Map(orgs.map((o) => [o.id, o.name]))
  const repName = new Map(reps.map((r) => [r.id, r.name]))

  const leadClass = leads.map((l) => ({ ...l, classification: classify(l) }))
  const prospectClass = prospects.map((p) => ({ ...p, classification: classify(p) }))
  const sampleClass = samples.map((s) => ({ ...s, classification: classify(s) }))

  const confirmedTestLeadIds = leadClass.filter((l) => l.classification === 'CONFIRMED_TEST').map((l) => l.id)
  const confirmedTestProspectIds = prospectClass.filter((p) => p.classification === 'CONFIRMED_TEST').map((p) => p.id)
  const confirmedTestSampleIds = sampleClass.filter((s) => s.classification === 'CONFIRMED_TEST').map((s) => s.id)

  const leadDeps = await dependencyCounts('leads', confirmedTestLeadIds)
  const prospectDeps = await dependencyCounts('captured_prospects', confirmedTestProspectIds)
  const sampleDeps = await dependencyCounts('intelligence_samples', confirmedTestSampleIds)

  const report = {
    generated_at: new Date().toISOString(),
    url,
    organizations: orgs.map((o) => ({ id: o.id, name: o.name })),
    reps: reps.map((r) => ({ id: r.id, name: r.name, org: r.organization_id })),
    before_counts: {
      leads: await exactCount('leads', 'limit=1'),
      captured_prospects: await exactCount('captured_prospects', 'limit=1'),
      intelligence_samples: await exactCount('intelligence_samples', 'limit=1'),
      intelligence_sample_events: await exactCount('intelligence_sample_events', 'limit=1'),
      messages: await exactCount('messages', 'limit=1'),
      conversation_states: await exactCount('conversation_states', 'limit=1'),
      conversation_facts: await exactCount('conversation_facts', 'limit=1'),
      outcomes: await exactCount('outcomes', 'limit=1'),
      action_events: await exactCount('action_events', 'limit=1'),
      relay_runs: await exactCount('relay_runs', 'limit=1'),
      ai_traces: await exactCount('ai_traces', 'limit=1'),
      scoring_feedback: await exactCount('scoring_feedback', 'limit=1'),
      scoring_labels: await exactCount('scoring_labels', 'limit=1'),
      scoring_pairwise_labels: await exactCount('scoring_pairwise_labels', 'limit=1'),
      scoring_shadow_decisions: await exactCount('scoring_shadow_decisions', 'limit=1'),
      sales_memory: await exactCount('sales_memory', 'limit=1'),
      signal_events: await exactCount('signal_events', 'limit=1'),
      facts: await exactCount('facts', 'limit=1'),
      notifications: await exactCount('notifications', 'limit=1'),
      email_messages: await exactCount('email_messages', 'limit=1'),
      golden_set: await exactCount('golden_set', 'limit=1'),
    },
    classification: {
      leads: {
        CONFIRMED_REAL: leadClass.filter((l) => l.classification === 'CONFIRMED_REAL').length,
        CONFIRMED_TEST: confirmedTestLeadIds.length,
        AMBIGUOUS_KEEP: leadClass.filter((l) => l.classification === 'AMBIGUOUS_KEEP').length,
      },
      captured_prospects: {
        CONFIRMED_REAL: prospectClass.filter((p) => p.classification === 'CONFIRMED_REAL').length,
        CONFIRMED_TEST: confirmedTestProspectIds.length,
        AMBIGUOUS_KEEP: prospectClass.filter((p) => p.classification === 'AMBIGUOUS_KEEP').length,
      },
      intelligence_samples: {
        CONFIRMED_REAL: sampleClass.filter((s) => s.classification === 'CONFIRMED_REAL').length,
        CONFIRMED_TEST: confirmedTestSampleIds.length,
        AMBIGUOUS_KEEP: sampleClass.filter((s) => s.classification === 'AMBIGUOUS_KEEP').length,
      },
    },
    confirmed_test: {
      leads: leadClass.filter((l) => l.classification === 'CONFIRMED_TEST'),
      captured_prospects: prospectClass.filter((p) => p.classification === 'CONFIRMED_TEST'),
      intelligence_samples: sampleClass.filter((s) => s.classification === 'CONFIRMED_TEST'),
    },
    ambiguous: {
      leads: leadClass.filter((l) => l.classification === 'AMBIGUOUS_KEEP'),
      captured_prospects: prospectClass.filter((p) => p.classification === 'AMBIGUOUS_KEEP'),
      intelligence_samples: sampleClass.filter((s) => s.classification === 'AMBIGUOUS_KEEP'),
    },
    dependencies: {
      leads: leadDeps,
      captured_prospects: prospectDeps,
      intelligence_samples: sampleDeps,
    },
  }
  // orgName/repName are Maps; JSON.stringify drops them. Attach lookup tables.
  report.org_lookup = Object.fromEntries(orgName)
  report.rep_lookup = Object.fromEntries(repName)

  const outIdx = process.argv.indexOf('--out')
  if (outIdx !== -1 && process.argv[outIdx + 1]) {
    writeFileSync(process.argv[outIdx + 1], JSON.stringify(report, null, 2))
    console.error(`wrote ${process.argv[outIdx + 1]}`)
  } else {
    console.log(JSON.stringify(report, null, 2))
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
