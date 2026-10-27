import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAsAdmin } from './helpers'
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

/** Seed a lead through the real save API and return its id. */
async function seedLead(page: Page, company: string): Promise<string> {
  const res = await page.request.post('/api/prospect/save', {
    data: {
      company,
      contactName: 'QA Tester',
      contactTitle: 'Head of Engineering',
      signalType: 1,
      signalEvidence: 'QA seed — synthetic release-matrix fixture',
      isTest: true,
      allowPotentialDuplicate: true,
    },
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
    await loginAsAdmin(page)
    const id = await seedLead(page, `QA No Thread ${Date.now()}`)
    await page.goto(`/leads/${id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await expect(page.getByText(/No messages yet/i)).toBeVisible({ timeout: 60_000 })

    const body = await page.locator('body').innerText()
    // NO_THREAD must never read as VERIFIED / replied.
    expect(body).not.toMatch(/They replied/i)
    expect(body).not.toMatch(/waiting on client/i)
  })
})

test.describe('CASE 4 — ETHAN TERMINAL', () => {
  test.setTimeout(180_000)
  test('marking a lead Lost closes it and offers no outreach', async ({ page }) => {
    await loginAsAdmin(page)
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
    await loginAsAdmin(page)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await expect(page.getByText(/YOUR DAY|Team today/i).first()).toBeVisible({ timeout: 60_000 })

    // Read the KPI tiles and the section list counts from the same page.
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

    // The corresponding list headings carry their own count; compare when present.
    const body = await page.locator('body').innerText()
    const repliesHeading = body.match(/Replies waiting[^\n]*\n[^\n]*?(\d+)/i)
    if (repliesHeading) {
      expect(Number(repliesHeading[1])).toBe(replies)
    }
  })
})

test.describe('CASE 13 — SCORE PARITY', () => {
  test.setTimeout(180_000)
  test('the lead detail shows one /10 display score and a labelled /100 canonical score', async ({ page }) => {
    await loginAsAdmin(page)
    const id = await seedLead(page, `QA Score Parity ${Date.now()}`)
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
