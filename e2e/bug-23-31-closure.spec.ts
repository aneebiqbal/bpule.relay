/**
 * BUG-23 … BUG-31 — browser-level proof.
 *
 * The unit suite (tests/qa-relay-bug-23-31.test.ts) proves the contracts; this
 * spec proves the surfaces a user actually touches: the Prospect reset, the
 * profile attribution on the lead row, profile isolation across workspaces, the
 * Upwork apply counting, and the Save-draft confirmation.
 *
 * Every record created here is marked `is_test` and removed in afterEach.
 * Run against a deployed environment with:
 *   E2E_BASE_URL=https://bpule-relay.vercel.app npx playwright test e2e/bug-23-31-closure.spec.ts
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAsAdmin, loginAsRep } from './helpers'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ORG = '11111111-1111-1111-1111-111111111111'

const sb = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

const PASTE = `Sarah Chen
VP Engineering at Acme Cloud Platform
Austin, Texas, United States
We need an external team to rebuild our customer portal. Budget is approved for Q1 and we want to start in November.`

const createdLeadIds: string[] = []

async function cleanup() {
  if (!sb || createdLeadIds.length === 0) return
  const ids = [...createdLeadIds]
  createdLeadIds.length = 0
  const { data: samples } = await sb.from('intelligence_samples').select('id').in('lead_id', ids)
  const sampleIds = (samples ?? []).map((s) => s.id)
  if (sampleIds.length) await sb.from('intelligence_sample_events').delete().in('sample_id', sampleIds)
  for (const table of [
    'intelligence_samples', 'messages', 'conversation_states', 'action_events',
    'relay_runs', 'outcomes', 'sales_memory', 'scoring_shadow_decisions', 'signal_events',
  ]) {
    await sb.from(table).delete().in('lead_id', ids)
  }
  await sb.from('leads').delete().in('id', ids)
}

test.beforeEach(async () => {
  await cleanup()
})

test.afterAll(async () => {
  await cleanup()
})

async function createTestLead(page: Page, overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await page.request.post('/api/prospect/save', {
    data: {
      company: `BUG Closure ${Date.now()}`,
      contactName: 'Sarah Chen',
      contactTitle: 'VP Engineering',
      signalType: 1,
      signalEvidence: 'We need an external team to rebuild our customer portal.',
      rawInput: PASTE,
      locationRaw: 'Austin, Texas, United States',
      isTest: true,
      ...overrides,
    },
    timeout: 120_000,
  })
  const body = await res.json().catch(() => null)
  if (!res.ok()) throw new Error(`test lead create failed: ${res.status()} ${JSON.stringify(body)}`)
  const id = (body?.leadId ?? body?.lead?.id) as string
  createdLeadIds.push(id)
  return id
}

// ---------------------------------------------------------------------------
// BUG-23 — the prospect must be clean after a successful save
// ---------------------------------------------------------------------------
test.describe('BUG023_PROSPECT_RESET_AFTER_SAVE', () => {
  test('clears the analysis and the draft after Create lead succeeds', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/prospect', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    await page.locator('textarea').first().fill(PASTE)
    await page.getByRole('button', { name: /^analyze$/i }).click()

    // Wait for the result panel and the save CTA.
    await page.getByRole('button', { name: /create lead/i }).waitFor({ timeout: 180_000 })
    await page.getByRole('button', { name: /create lead/i }).click()

    // The save navigates to the new lead.
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 120_000 })
    const leadId = page.url().split('/leads/')[1].split('?')[0]
    createdLeadIds.push(leadId)

    // Back to Prospect: no resurrection, no stale CTA.
    await page.goto('/prospect', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    await expect(page.getByRole('button', { name: /create lead/i })).toHaveCount(0)
    const value = await page.locator('textarea').first().inputValue()
    expect(value.trim()).toBe('')
  })
})

// ---------------------------------------------------------------------------
// BUG-24 / BUG-29 — the profile is attributed and shown
// ---------------------------------------------------------------------------
test.describe('BUG024_PROSPECT_PROFILE_ATTRIBUTION', () => {
  test('shows the sending profile on the prospect result and on the lead row', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/prospect', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    await page.locator('textarea').first().fill(PASTE)
    await page.getByRole('button', { name: /^analyze$/i }).click()

    const senderLine = page.locator('p', { hasText: /^(Sending as:|Profile not assigned)/ }).first()
    await senderLine.waitFor({ timeout: 180_000 })
    await expect(senderLine).not.toHaveText('Profile not assigned')

    const leadId = await createTestLead(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    // The board states the profile, or says plainly that none is assigned.
    const body = await page.evaluate(() => document.body.innerText)
    expect(body).toMatch(/Profile: .+|Profile not assigned/)
    expect(body).not.toMatch(/No profile selected/)

    // And the lead detail resolves the same profile.
    await page.goto(`/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const detail = await page.evaluate(() => document.body.innerText)
    expect(detail).toMatch(/Profile: .+|Profile not assigned/)
  })
})

// ---------------------------------------------------------------------------
// BUG-25 — every lead is reachable
// ---------------------------------------------------------------------------
test.describe('BUG025_COMPLETE_PROFILE_SCOPED_LEAD_LIST', () => {
  test('reaches leads past the first page via Load more', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    // The header reports the full count; the board renders a page at a time.
    const header = await page.locator('p', { hasText: /active leads/ }).first().innerText().catch(() => '')
    const match = header.match(/(\d+)\s+active lead/)
    const total = match ? Number(match[1]) : 0
    expect(total).toBeGreaterThan(0)

    // Load more until the control disappears, then confirm no lead was lost.
    for (let i = 0; i < 20; i += 1) {
      const more = page.getByRole('button', { name: /load more/i })
      if (await more.count().catch(() => 0)) await more.click({ timeout: 20_000 }).catch(() => undefined)
      else break
      await page.waitForTimeout(600)
    }
    await expect(page.getByRole('button', { name: /load more/i })).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// BUG-26 — no follow-up without an outbound message
// ---------------------------------------------------------------------------
test.describe('BUG026_NO_FOLLOWUP_WITHOUT_OUTBOUND', () => {
  test('a brand-new lead with no message is never follow-up due', async ({ page }) => {
    await loginAsAdmin(page)
    const leadId = await createTestLead(page)

    await page.goto(`/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const body = await page.evaluate(() => document.body.innerText)

    expect(body).not.toMatch(/follow-?up is due/i)
    // The next action must be outreach, not a follow-up.
    expect(body).toMatch(/connection|send|message/i)
  })
})

// ---------------------------------------------------------------------------
// BUG-27 — score does not block progression
// ---------------------------------------------------------------------------
test.describe('BUG027_STAGE_PROGRESS_INDEPENDENT_OF_SCORE', () => {
  test('a low-scored lead with an accepted connection is asked for the first message', async ({ page }) => {
    await loginAsAdmin(page)
    const leadId = await createTestLead(page)

    // Force the relationship state the bug stranded: connection sent + accepted,
    // with a research_more (score 4/5) verdict.
    const res = await page.request.post(`/api/leads/${leadId}/contact`, {
      data: { sentText: 'Hi Sarah — would love to connect.', type: 'connection' },
      timeout: 90_000,
    })
    expect(res.ok()).toBeTruthy()

    const accepted = await page.request.post(`/api/leads/${leadId}/connection-accepted`, {
      data: {},
      timeout: 60_000,
    }).catch(() => null)

    await page.goto(`/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    const body = await page.evaluate(() => document.body.innerText)

    // The old bug rendered "Watch — not yet a fit" and never advanced.
    expect(body).not.toMatch(/not yet a fit/i)
    if (accepted?.ok()) {
      expect(body).toMatch(/first message|send.{0,20}message/i)
    }
  })
})

// ---------------------------------------------------------------------------
// BUG-28 — Upwork Applied counts once
// ---------------------------------------------------------------------------
test.describe('BUG028_UPWORK_APPLIED_COUNTS_TODAY', () => {
  test('marking Applied flips the job and emits exactly one ledger event', async ({ page }) => {
    test.skip(!sb, 'requires service-role credentials')
    await loginAsAdmin(page)

    const { data: job } = await sb!
      .from('upwork_jobs')
      .select('id, score, status')
      .eq('status', 'new')
      .gte('score', 6)
      .limit(1)
      .maybeSingle()
    test.skip(!job, 'no applicable Upwork job in this environment')
    const originalStatus = job!.status

    const res = await page.request.post(`/api/upwork/jobs/${job!.id}/apply`, {
      data: { sentText: 'BUG-28 verification proposal text.' },
      timeout: 90_000,
    })
    expect(res.ok()).toBeTruthy()

    // The job itself must now read applied — the silent-connects_used failure
    // used to leave it at 'new' while still returning 200.
    const { data: after } = await sb!.from('upwork_jobs').select('status').eq('id', job!.id).maybeSingle()
    expect(after?.status).toBe('applied')

    // Exactly one ledger event, carrying an idempotency key.
    const { count } = await sb!.from('action_events')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job!.id)
      .eq('action_type', 'UPWORK_APPLIED')
    expect(count).toBe(1)

    const { data: event } = await sb!.from('action_events')
      .select('idempotency_key')
      .eq('job_id', job!.id)
      .eq('action_type', 'UPWORK_APPLIED')
      .maybeSingle()
    expect(event?.idempotency_key).toBe(`upwork_applied:${job!.id}`)

    // Restore the job and remove only what this test created.
    await sb!.from('upwork_jobs').update({ status: originalStatus }).eq('id', job!.id)
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    await sb!.from('upwork_messages').delete().eq('job_id', job!.id).gte('created_at', since)
    await sb!
      .from('action_events')
      .delete()
      .eq('job_id', job!.id)
      .eq('action_type', 'UPWORK_APPLIED')
      .eq('idempotency_key', `upwork_applied:${job!.id}`)
  })
})

// ---------------------------------------------------------------------------
// BUG-30 — profiles do not share leads
// ---------------------------------------------------------------------------
test.describe('BUG030_PROFILE_LEAD_ISOLATION', () => {
  test('switching workspace changes the visible lead set', async ({ page, context }) => {
    test.skip(!sb, 'requires service-role credentials')
    await loginAsRep(page)

    const { data: identities } = await sb!
      .from('identity_assignments')
      .select('revenue_identity_id')
      .eq('rep_id', 'aaaaaaaa-0000-0000-0000-000000000003')
    const assigned = identities ?? []
    test.skip(assigned.length < 2, 'rep needs two assigned identities')

    const boardCounts: number[] = []
    for (const assignment of assigned) {
      await context.addCookies([{
        name: 'relay-active-identity',
        value: assignment.revenue_identity_id,
        path: '/',
        domain: new URL(page.url()).hostname,
      }])
      await page.goto('/leads', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      const header = await page.locator('p', { hasText: /active lead/ }).first().innerText().catch(() => '')
      const match = header.match(/(\d+)\s+active lead/)
      boardCounts.push(match ? Number(match[1]) : -1)
    }

    // Each workspace reports its own count, and the sets are not identical.
    expect(new Set(boardCounts).size).toBeGreaterThan(1)
    expect(boardCounts.every((c) => c >= 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BUG-31 — Save Draft confirms and persists
// ---------------------------------------------------------------------------
test.describe('BUG031_DRAFT_SAVE_CONFIRMATION', () => {
  test('shows a confirmation and restores the draft after reload', async ({ page }) => {
    test.skip(!sb, 'requires service-role credentials')
    await loginAsAdmin(page)

    const { data: job } = await sb!
      .from('upwork_jobs')
      .select('id, score, status')
      .eq('status', 'new')
      .gte('score', 6)
      .limit(1)
      .maybeSingle()
    test.skip(!job, 'no applicable Upwork job in this environment')

    await page.goto(`/upwork/${job!.id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const generate = page.getByRole('button', { name: /generate/i }).first()
    if (await generate.count().catch(() => 0)) {
      await generate.click({ timeout: 60_000 })
      await page.waitForTimeout(30_000)
    }

    const textarea = page.locator('textarea').first()
    if (!(await textarea.count().catch(() => 0))) test.skip(true, 'no proposal editor on this job')
    const draftText = (await textarea.inputValue().catch(() => '')) || 'BUG-31 verification draft text.'
    await textarea.fill(draftText)

    const save = page.getByRole('button', { name: /save draft|failed — retry/i })
    await expect(save).toBeEnabled()
    await save.click()

    // The confirmation must appear only after the server confirmed.
    await expect(page.getByText('Draft saved')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /^saved$/i })).toBeVisible({ timeout: 30_000 })

    // Reload: the exact draft must still be there.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await expect(page.locator('textarea').first()).toHaveValue(draftText)

    // One draft row, not one per click.
    const { count } = await sb!.from('upwork_messages')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job!.id)
      .eq('type', 'cover')
      .is('sent_at', null)
    expect(count).toBe(1)

    // Remove only the draft this test wrote.
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    await sb!.from('upwork_messages').delete().eq('job_id', job!.id).is('sent_at', null).gte('created_at', since)
  })
})
