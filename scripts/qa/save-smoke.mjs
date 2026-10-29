/**
 * Real save-path smoke: create a test lead through the live API, verify it is
 * persisted and readable, then delete it. Everything it creates is `isTest`,
 * and it removes its own rows.
 *
 *   BASE_URL=https://bpule-relay.vercel.app SAVE_EMAIL=madiha@scout.dev \
 *     node scripts/qa/save-smoke.mjs
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE_URL || 'http://localhost:3102'
const EMAIL = process.env.SAVE_EMAIL || 'madiha@scout.dev'
const PASSWORD = process.env.SAVE_PASSWORD || 'scout-dev-password'
const ORG = '11111111-1111-1111-1111-111111111111'

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForFunction(() => {
    const el = document.querySelector('#login-email')
    return Boolean(el && '_valueTracker' in el)
  }, { timeout: 30000 })
  await page.locator('#login-email').pressSequentially(EMAIL, { delay: 3 })
  await page.locator('#login-password').pressSequentially(PASSWORD, { delay: 3 })
  await page.getByRole('button', { name: /sign in with password/i }).click()
  await page.waitForFunction(() => /^\/(dashboard|onboarding)/.test(location.pathname), { timeout: 45000 })
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env missing')
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const stamp = Date.now()
  const company = `Relay Save Check ${stamp}`
  const rawInput = `Sarah Chen\nVP Engineering at ${company}\nAustin, Texas, United States\nWe need an external team to rebuild our customer portal. Budget is approved for Q1.`

  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(90000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
  await login(page)

  const res = await page.request.post(`${BASE}/api/prospect/save`, {
    data: {
      company,
      contactName: 'Sarah Chen',
      contactTitle: 'VP Engineering',
      signalType: 1,
      signalEvidence: 'We need an external team to rebuild our customer portal.',
      rawInput,
      locationRaw: 'Austin, Texas, United States',
      isTest: true,
    },
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
  })
  const payload = await res.json().catch(() => null)
  const leadId = payload?.leadId ?? payload?.lead?.id ?? null
  const result = { company, status: res.status(), leadId, apiError: res.ok() ? null : payload?.error ?? null }

  if (!leadId) {
    console.log(JSON.stringify({ ...result, ok: false }, null, 2))
    await browser.close()
    process.exit(1)
  }

  const { data: row } = await sb.from('leads').select('id, company, owner_rep_id, is_test, source_kind, organization_id, revenue_identity_id').eq('id', leadId).maybeSingle()
  result.persisted = row

  await page.goto(`${BASE}/leads/${leadId}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  const pageText = await page.evaluate(() => document.body.innerText)
  result.readable = pageText.includes(company)
  result.pageErrors = errors

  // Remove the test lead and its children (children first).
  const childDeletes = [
    ['intelligence_sample_events', 'sample_id', await (async () => {
      const { data } = await sb.from('intelligence_samples').select('id').eq('lead_id', leadId)
      return (data ?? []).map((s) => s.id)
    })()],
  ]
  for (const [table, col, ids] of childDeletes) {
    if (ids.length) await sb.from(table).delete().in(col, ids)
  }
  for (const table of ['intelligence_samples', 'messages', 'conversation_states', 'action_events', 'relay_runs', 'outcomes', 'sales_memory', 'scoring_feedback', 'scoring_labels', 'scoring_shadow_decisions', 'signal_events', 'golden_set']) {
    await sb.from(table).delete().eq('lead_id', leadId)
  }
  await sb.from('leads').delete().eq('id', leadId)
  const { data: gone } = await sb.from('leads').select('id').eq('id', leadId).maybeSingle()
  result.cleanedUp = !gone

  result.ok = res.ok() && row?.is_test === true && row?.company === company && result.readable && result.cleanedUp
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
  if (!result.ok) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })
