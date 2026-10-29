#!/usr/bin/env node
/**
 * QA cleanup (Phase 29) — production test-data removal.
 *
 * Removes ONLY records named in an immutable CONFIRMED_TEST manifest produced by
 * scripts/qa/relay-test-manifest.mjs. Never re-runs a heuristic. Never deletes a
 * production (is_test=false / source_kind=PRODUCTION) row. Org-scoped to bpulse.
 *
 * Dry-run by default; mutation requires explicit --apply. Idempotent.
 *
 *   node scripts/qa/qa-cleanup.mjs --manifest /tmp/relay_manifest.json
 *   node scripts/qa/qa-cleanup.mjs --manifest /tmp/relay_manifest.json --apply
 *
 * Exit codes: 0 = success / nothing to do, 1 = failure or partial failure.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const TARGET_ORG = '11111111-1111-1111-1111-111111111111'

const arg = (name) => process.argv[process.argv.indexOf(name) + 1]
const apply = process.argv.includes('--apply')
const manifestPath = arg('--manifest')

const headers = () => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })

function die(msg) { console.error(`FAIL: ${msg}`); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Transient network/DNS errors are retried; real HTTP errors are not. */
async function withRetry(fn, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e) {
      const cause = e?.cause?.code || e?.code
      const transient = cause === 'EADDRNOTAVAIL' || cause === 'ECONNRESET' || cause === 'ETIMEDOUT' || /fetch failed/i.test(String(e?.message))
      if (!transient || i === tries - 1) throw e
      await sleep(700 * (i + 1))
    }
  }
}

async function count(table, filter) {
  const res = await withRetry(() => fetch(`${url}/rest/v1/${table}?select=id&${filter}&limit=1`, { method: 'HEAD', headers: { ...headers(), Prefer: 'count=exact' } }))
  if (!res.ok) die(`count ${table} failed ${res.status}`)
  return Number(res.headers.get('content-range').split('/')[1])
}

async function del(table, filter) {
  const res = await withRetry(() => fetch(`${url}/rest/v1/${table}?${filter}`, { method: 'DELETE', headers: headers() }))
  if (!res.ok) die(`delete ${table} failed ${res.status}`)
  const body = await res.json()
  return Array.isArray(body) ? body.length : 0
}

async function main() {
  if (!manifestPath) die('usage: qa-cleanup.mjs --manifest <file> [--apply]')
  if (!url || !key) die('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const hash = createHash('sha256').update(JSON.stringify(manifest.confirmed_test)).digest('hex')
  const ct = manifest.confirmed_test

  const leadIds = ct.leads.map((l) => l.id)
  const prospectIds = ct.captured_prospects.map((p) => p.id)
  const sampleIds = ct.intelligence_samples.map((s) => s.id)

  // --- SAFETY: refuse production rows and cross-org rows -------------------
  const prodLeads = ct.leads.filter((l) => l.is_test !== true || l.source_kind === 'PRODUCTION')
  if (prodLeads.length) die(`manifest contains ${prodLeads.length} production lead(s) — refusing`)
  const crossOrg = ct.leads.filter((l) => l.organization_id && l.organization_id !== TARGET_ORG)
  if (crossOrg.length) die(`manifest contains ${crossOrg.length} cross-org lead(s) — refusing`)
  const ambiguous = manifest.ambiguous_keep?.leads?.length || 0
  if (ambiguous && ct.leads.some((l) => manifest.ambiguous_keep.leads.some((a) => a.id === l.id)))
    die('manifest overlaps ambiguous_keep — refusing')

  // --- DELETE PLAN (children first) ----------------------------------------
  const inList = (ids) => `in.(${ids.join(',')})`
  const plan = []
  const push = (table, filter, expected) => { if (expected > 0) plan.push({ table, filter, expected }) }
  push('intelligence_sample_events', `sample_id=${inList(sampleIds)}`, sampleIds.length ? await count('intelligence_sample_events', `sample_id=${inList(sampleIds)}`) : 0)
  push('scoring_shadow_decisions', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('scoring_shadow_decisions', `lead_id=${inList(leadIds)}`) : 0)
  push('scoring_shadow_decisions', `captured_prospect_id=${inList(prospectIds)}`, prospectIds.length ? await count('scoring_shadow_decisions', `captured_prospect_id=${inList(prospectIds)}`) : 0)
  push('scoring_feedback', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('scoring_feedback', `lead_id=${inList(leadIds)}`) : 0)
  push('scoring_feedback', `captured_prospect_id=${inList(prospectIds)}`, prospectIds.length ? await count('scoring_feedback', `captured_prospect_id=${inList(prospectIds)}`) : 0)
  push('scoring_labels', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('scoring_labels', `lead_id=${inList(leadIds)}`) : 0)
  push('scoring_labels', `captured_prospect_id=${inList(prospectIds)}`, prospectIds.length ? await count('scoring_labels', `captured_prospect_id=${inList(prospectIds)}`) : 0)
  push('action_events', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('action_events', `lead_id=${inList(leadIds)}`) : 0)
  push('conversation_states', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('conversation_states', `lead_id=${inList(leadIds)}`) : 0)
  push('messages', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('messages', `lead_id=${inList(leadIds)}`) : 0)
  push('sales_memory', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('sales_memory', `lead_id=${inList(leadIds)}`) : 0)
  push('signal_events', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('signal_events', `lead_id=${inList(leadIds)}`) : 0)
  push('outcomes', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('outcomes', `lead_id=${inList(leadIds)}`) : 0)
  push('golden_set', `lead_id=${inList(leadIds)}`, leadIds.length ? await count('golden_set', `lead_id=${inList(leadIds)}`) : 0)
  push('relay_runs', `primary_entity_id=${inList(leadIds)}`, leadIds.length ? await count('relay_runs', `primary_entity_id=${inList(leadIds)}`) : 0)
  push('intelligence_samples', `id=${inList(sampleIds)}`, sampleIds.length ? await count('intelligence_samples', `id=${inList(sampleIds)}`) : 0)
  push('captured_prospects', `id=${inList(prospectIds)}`, prospectIds.length ? await count('captured_prospects', `id=${inList(prospectIds)}`) : 0)
  push('leads', `id=${inList(leadIds)}`, leadIds.length ? await count('leads', `id=${inList(leadIds)}`) : 0)

  const total = plan.reduce((s, p) => s + p.expected, 0)
  console.log(`manifest sha256: ${hash}`)
  console.log(`org: ${TARGET_ORG} | confirmed_test: ${leadIds.length} leads, ${prospectIds.length} prospects, ${sampleIds.length} samples`)
  console.log(`plan: ${plan.length} statements, ${total} row(s)`)
  for (const p of plan) console.log(`  ${p.table}  expected=${p.expected}`)
  if (process.argv.includes('--ids')) {
    console.log(`lead ids: ${leadIds.join(',')}`)
    console.log(`sample ids: ${sampleIds.join(',')}`)
    console.log(`prospect ids: ${prospectIds.join(',')}`)
  }
  if (!apply) { console.log('DRY-RUN — pass --apply to execute.'); return }

  // --- APPLY ---------------------------------------------------------------
  let failed = 0
  for (const p of plan) {
    const before = await count(p.table, p.filter)
    const deleted = await del(p.table, p.filter)
    const after = await count(p.table, p.filter)
    const ok = deleted === before && after === 0
    if (!ok) failed++
    console.log(`${ok ? 'ok' : 'MISMATCH'} ${p.table}: before=${before} deleted=${deleted} after=${after}`)
  }

  // --- INVARIANTS ----------------------------------------------------------
  const remainLeads = await count('leads', `id=${inList(leadIds)}`)
  const orphanMsgs = await count('messages', `lead_id=${inList(leadIds)}`)
  const orphanCs = await count('conversation_states', `lead_id=${inList(leadIds)}`)
  const orphanRuns = await count('relay_runs', `primary_entity_id=${inList(leadIds)}`)
  const remainSamples = await count('intelligence_samples', `id=${inList(sampleIds)}`)
  const prodStillThere = await count('leads', `is_test=eq.false&source_kind=eq.PRODUCTION`)
  console.log(`invariants: remaining manifest leads=${remainLeads} orphan messages=${orphanMsgs} orphan conv=${orphanCs} orphan runs=${orphanRuns} remaining samples=${remainSamples}`)
  console.log(`production leads still present: ${prodStillThere}`)

  if (failed || remainLeads || orphanMsgs || orphanCs || orphanRuns || remainSamples) {
    die(`partial failure (failed=${failed}) — review before re-running`)
  }
  console.log('APPLY COMPLETE. Re-run relay-test-manifest.mjs to confirm 0 additional CONFIRMED_TEST.')
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
