#!/usr/bin/env node
/**
 * Reclassify the children of E2E leads so the lead manifest can delete them.
 *
 * Safety: only rows whose parent lead is `is_test = true`, and (for samples)
 * whose raw input is a QA fixture, are touched. Anything else aborts.
 *
 *   node --env-file=.env.local scripts/qa/e2e-child-reclassify.mjs
 *   node --env-file=.env.local scripts/qa/e2e-child-reclassify.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY = process.argv.includes('--apply')
if (!url || !key) { console.error('Supabase env missing'); process.exit(1) }

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const QA_FIXTURE = /QA Tester|QA (Inbound|Terminal|No Thread|Score Parity)|NorthPeak/i

async function main() {
  const { data: leads, error } = await sb.from('leads').select('id, company').eq('is_test', true)
  if (error) throw error
  const ids = (leads ?? []).map((l) => l.id)
  if (ids.length === 0) { console.log('No E2E leads.'); return }

  const { data: samples, error: sErr } = await sb
    .from('intelligence_samples')
    .select('id, lead_id, is_test, raw_input')
    .in('lead_id', ids)
    .eq('is_test', false)
  if (sErr) throw sErr

  const unsafe = (samples ?? []).filter((s) => !QA_FIXTURE.test(String(s.raw_input ?? '')))
  const report = {
    e2eLeads: ids.length,
    samplesToReclassify: (samples ?? []).length - unsafe.length,
    samplesBlocked: unsafe.map((s) => ({ id: s.id, lead: s.lead_id, raw: String(s.raw_input ?? '').slice(0, 80) })),
  }

  const { data: shadows, error: shErr } = await sb
    .from('scoring_shadow_decisions')
    .select('id, lead_id, is_test')
    .in('lead_id', ids)
    .eq('is_test', false)
  if (shErr) throw shErr
  report.shadowsToReclassify = (shadows ?? []).length

  console.log(JSON.stringify(report, null, 2))
  if (unsafe.length > 0) { console.error('Refusing: a sample is not a QA fixture.'); process.exit(1) }
  if (!APPLY) { console.log('DRY-RUN — pass --apply.'); return }

  const safeIds = (samples ?? []).map((s) => s.id)
  if (safeIds.length > 0) {
    const { error: e } = await sb.from('intelligence_samples').update({ is_test: true, source_kind: 'E2E' }).in('id', safeIds)
    if (e) throw e
  }
  const shadowIds = (shadows ?? []).map((s) => s.id)
  if (shadowIds.length > 0) {
    const { error: e } = await sb.from('scoring_shadow_decisions').update({ is_test: true }).in('id', shadowIds)
    if (e) throw e
  }
  console.log(`APPLIED — samples=${safeIds.length} shadows=${shadowIds.length}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
