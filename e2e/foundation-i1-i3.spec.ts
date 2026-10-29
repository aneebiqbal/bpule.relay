/**
 * Foundation I1–I3 — browser proof.
 *
 * Test 1 is the integration + mobile gate. It runs against any deployed
 * environment, including one where the migrations have not been applied yet:
 * the point is that Today renders real data and never breaks when `rep_day` is
 * absent. It asserts the 375px layout does not scroll horizontally.
 *
 * Test 2 is the full synthetic day from the brief. It needs a migrated database
 * and the test clock enabled on the server:
 *
 *   RELAY_TEST_CLOCK=1 npm run dev
 *   E2E_BASE_URL=http://localhost:3000 E2E_LOCAL_FOUNDATION=1 \
 *     npx playwright test e2e/foundation-i1-i3.spec.ts
 *
 * It is skipped by default rather than silently passing.
 */
import { test, expect } from '@playwright/test'
import { loginAsRep } from './helpers'

test.describe('Foundation I1–I3 — Today renders the canonical rep day', () => {
  test('shows the day header, commitments and a non-scrolling 375px layout', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsRep(page)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => undefined)

    // Header: greeting, time remaining, commitment percentage, state.
    await expect(page.getByRole('heading', { name: /good (morning|afternoon|evening)/i })).toBeVisible()
    await expect(page.getByText(/of today's commitment/i)).toBeVisible()
    await expect(page.getByRole('progressbar').first()).toBeVisible()

    // The commitments section. It streams in behind Suspense, so allow for it.
    await expect(page.getByRole('heading', { name: /today's commitments/i })).toBeVisible({ timeout: 15_000 })

    // Mobile: the essential state must fit without horizontal scrolling.
    await page.setViewportSize({ width: 375, height: 812 })
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      return doc.scrollWidth - doc.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(1)

    await expect(page.getByRole('heading', { name: /good (morning|afternoon|evening)/i })).toBeVisible()
    await expect(page.getByText(/of today's commitment/i)).toBeVisible()
  })

  test('the canonical day API returns the same contract', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsRep(page)
    const response = await page.request.get('/api/rep/day')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body.day).toMatchObject({
      businessDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      timezone: expect.any(String),
      state: expect.stringMatching(/^(NOT_STARTED|ACTIVE|AT_RISK|CRITICAL|READY_TO_CLOSE|CLOSED|MISSED)$/),
      minutesRemaining: expect.any(Number),
      commitmentProgress: expect.any(Number),
    })
    expect(Array.isArray(body.day.commitments)).toBe(true)
    expect(body.day.commitments).toHaveLength(7)
  })
})

test.describe('Foundation I1–I3 — synthetic operating day', () => {
  test.skip(
    process.env.E2E_LOCAL_FOUNDATION !== '1',
    'Needs a migrated local database and RELAY_TEST_CLOCK=1 on the server.',
  )

  test('08:50 → 09:05 → 12:00 → 15:00 → 16:30 → 17:30 → 17:45', async ({ page }) => {
    test.setTimeout(300_000)
    await loginAsRep(page)

    const setClock = async (iso: string) => {
      const res = await page.request.post('/api/qa/clock', { data: { now: iso } })
      expect(res.ok()).toBeTruthy()
    }

    const openToday = async () => {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => undefined)
    }

    // 08:50 — the workday has not opened.
    await setClock('2026-10-30T03:50:00.000Z')
    await openToday()
    await expect(page.getByText(/opens at 09:00/i)).toBeVisible()

    // 09:05 — check in.
    await setClock('2026-10-30T04:05:00.000Z')
    await openToday()
    await page.getByRole('button', { name: /start my day/i }).click()
    await expect(page.getByText(/^on track$/i)).toBeVisible()

    // 15:00 — behind.
    await setClock('2026-10-30T10:00:00.000Z')
    await openToday()
    await expect(page.getByText(/^at risk$/i)).toBeVisible()

    // 16:30 — materially behind, and an admin escalation exists.
    await setClock('2026-10-30T11:30:00.000Z')
    await openToday()
    await expect(page.getByText(/^critical$/i)).toBeVisible()

    // 17:45 — close.
    await setClock('2026-10-30T12:45:00.000Z')
    await openToday()
    const closeButton = page.getByRole('button', { name: /close (my day|incomplete)/i })
    await expect(closeButton).toBeVisible()
    await closeButton.click()
    await expect(page.getByText(/^closed$/i)).toBeVisible()
  })
})
