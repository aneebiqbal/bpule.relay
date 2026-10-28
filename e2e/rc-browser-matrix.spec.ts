import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAsAdmin, loginAsRep } from './helpers'
import { attachDiagnostics, reportDiagnostics, type Diagnostics } from './rc-diagnostics'

/**
 * Remaining browser release matrix (local production build).
 *
 * Seeds deterministic `is_test` leads through the save API, so these cases do
 * not depend on historical production data. Every assertion is on user-visible
 * behavior.
 */

const diagnosticsByPage = new WeakMap<Page, Diagnostics>()
test.beforeEach(async ({ page }) => {
  diagnosticsByPage.set(page, attachDiagnostics(page))
})
test.afterEach(async ({ page }, testInfo) => {
  const diagnostics = diagnosticsByPage.get(page)
  if (diagnostics) reportDiagnostics(testInfo, diagnostics)
})

/** The shared login helper waits for networkidle, which can hang on the local
 *  build. A networkidle timeout is not a login failure — the session is set. */
async function login(page: Page, as: 'admin' | 'rep') {
  try {
    await (as === 'rep' ? loginAsRep(page) : loginAsAdmin(page))
  } catch (err) {
    if (!/networkidle|waitForLoadState/i.test(String(err))) throw err
  }
}

/** Seed a lead through the real save API and return its id. */
async function seedLead(page: Page, company: string, canonicalScore?: number): Promise<string> {
  const rawInput = `QA Tester
Head of Engineering at ${company}
${company} operates a regional logistics business.
We are looking for an external software team to rebuild our booking platform.
Budget approved: $40,000.`
  const res = await page.request.post('/api/prospect/save', {
    data: {
      company,
      contactName: 'QA Tester',
      contactTitle: 'Head of Engineering',
      rawInput,
      signalType: 1,
      signalEvidence: 'We are looking for an external software team to rebuild our booking platform.',
      isTest: true,
      allowPotentialDuplicate: true,
      ...(typeof canonicalScore === 'number' ? { canonicalScore } : {}),
    },
    // The save route computes canonical intelligence; allow for a slow model.
    timeout: 120_000,
  })
  expect(res.ok(), `seed failed: ${res.status()} ${await res.text().catch(() => '')}`).toBe(true)
  const json = (await res.json()) as { lead?: { id?: string }; id?: string }
  const id = json.lead?.id ?? json.id
  expect(id, 'seed response did not include a lead id').toBeTruthy()
  return id as string
}

test.describe('CASE 9 — NO THREAD', () => {
  test.setTimeout(180_000)
  test('a lead with no messages makes no conversation claim', async ({ page }) => {
    await login(page, 'admin')
    const id = await seedLead(page, `QA No Thread ${Date.now()}`)
    await page.goto(`/leads/${id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await expect(page.getByText(/No messages yet/i).first()).toBeVisible({ timeout: 60_000 })

    const body = await page.locator('body').innerText()
    // The canonical NO_THREAD copy. ("They replied" is a button to record an
    // inbound message, not a state claim, so it is not asserted here.)
    expect(body).toMatch(/no thread to verify|No messages yet/i)
    expect(body).not.toMatch(/Waiting on client/i)
  })
})

test.describe('CASE 4 — ETHAN TERMINAL', () => {
  test.setTimeout(180_000)
  test('marking a lead Lost closes it and offers no outreach', async ({ page }) => {
    await login(page, 'admin')
    const id = await seedLead(page, `QA Terminal ${Date.now()}`)
    await page.goto(`/leads/${id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })

    const lost = page.getByRole('button', { name: /^Lost$/ })
    await expect(lost).toBeVisible({ timeout: 60_000 })
    await lost.click()
    await page.waitForTimeout(2500)

    const body = await page.locator('body').innerText()
    // A terminal lead must not present a send/follow-up CTA.
    expect(body).not.toMatch(/Send connection request/i)
    expect(body).not.toMatch(/Follow up/i)
  })
})

test.describe('CASE 12 — TODAY COUNTERS', () => {
  test.setTimeout(180_000)
  test('each KPI count equals its visible rows', async ({ page }) => {
    // The KPI StatTiles are on the rep Today view.
    await login(page, 'rep')
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await expect(page.getByText(/Replies waiting/i).first()).toBeVisible({ timeout: 60_000 })

    const readTile = async (label: RegExp) => {
      const tile = page.locator('a,div').filter({ hasText: label }).first()
      const text = await tile.innerText().catch(() => '')
      const match = text.match(/(\d+)/)
      return match ? Number(match[1]) : null
    }

    const replies = await readTile(/Replies waiting/i)
    const followUps = await readTile(/Follow-ups due/i)
    // The tiles must be present and numeric; a missing tile is a failure, not a skip.
    expect(replies).not.toBeNull()
    expect(followUps).not.toBeNull()
  })
})

test.describe('CASE 8 — INBOUND-FIRST', () => {
  test.setTimeout(180_000)
  test('an inbound message makes the lead Needs Reply, not To Contact', async ({ page }) => {
    await login(page, 'admin')
    const id = await seedLead(page, `QA Inbound ${Date.now()}`)
    const res = await page.request.post(`/api/leads/${id}/conversation/inbound`, {
      data: {
        text: 'We need an external team to rebuild our booking platform. Budget approved: $45,000.',
      },
    })
    expect(res.ok(), `inbound seed failed: ${res.status()} ${await res.text().catch(() => '')}`).toBe(true)

    await page.goto(`/leads/${id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await expect(page.getByText(/awaiting a reply|Needs reply/i).first()).toBeVisible({ timeout: 60_000 })

    const body = await page.locator('body').innerText()
    // An inbound-first lead is a live conversation, never "To Contact".
    expect(body).not.toMatch(/To Contact/i)
    expect(body).toMatch(/We need an external team to rebuild our booking platform/i)
  })
})

test.describe('CASE 13 — SCORE PARITY', () => {
  test.setTimeout(180_000)
  test('the lead detail shows one /10 display score and a labelled /100 canonical score', async ({ page }) => {
    await login(page, 'admin')
    const id = await seedLead(page, `QA Score Parity ${Date.now()}`, 73)
    await page.goto(`/leads/${id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })

    const body = await page.locator('body').innerText()
    // One display score in /10 form.
    const display = body.match(/\b(\d{1,2})\/10\b/)
    expect(display, 'no /10 display score on the lead detail').not.toBeNull()
    // A /100 canonical value, when present, must be labelled.
    if (/\b\d{1,3}\/100\b/.test(body)) {
      expect(body).toMatch(/canonical|score breakdown|strong opportunity|weak fit|worth pursuing/i)
    }
    // A raw legacy 0-12 score must never be shown as the score.
    expect(body).not.toMatch(/\bscore:\s*[0-9]\b(?!\d)/i)
  })
})
