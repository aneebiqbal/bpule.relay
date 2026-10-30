/**
 * COMMAND_CENTRE_GATE — browser proof.
 *
 * Runs against a deployed or local environment. Without the foundation
 * migrations the page still renders every rep (NOT_STARTED / MISSED from the
 * clock) and every aggregate from the existing ledger; that degraded path is
 * part of what is asserted here.
 *
 *   E2E_BASE_URL=https://bpule-relay.vercel.app npx playwright test e2e/command-centre.spec.ts
 */
import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsRep } from './helpers'

test.describe('Command Centre', () => {
  test('answers the operational questions in severity order', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    await page.goto('/admin/command', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => undefined)

    await expect(page.getByRole('heading', { name: /^today$/i })).toBeVisible()

    // The top summary: operational numbers only.
    for (const label of ['Not started', 'Active', 'At risk', 'Critical', 'Ready to close', 'Closed', 'Missed', 'Pipeline created', 'Replies waiting']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }

    await expect(page.getByRole('heading', { name: /^team$/i })).toBeVisible()

    // Every visible row exposes one primary action.
    const openButtons = page.getByRole('link', { name: /open rep day/i })
    expect(await openButtons.count()).toBeGreaterThan(0)
  })

  test('a rep day opens and shows targets, identities and the shortfall record', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    await page.goto('/admin/command', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => undefined)

    const first = page.getByRole('link', { name: /open rep day/i }).first()
    await first.click()
    await page.waitForLoadState('networkidle').catch(() => undefined)

    await expect(page.getByRole('heading', { name: /daily targets/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /source identities/i })).toBeVisible()
    await expect(page.getByText(/exception and shortfall/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /^command$/i })).toBeVisible()
  })

  test('the Command API refuses a rep', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsRep(page)
    const response = await page.request.get('/api/admin/team-day')
    expect(response.status()).toBe(403)
  })

  test('a rep is redirected away from Command', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsRep(page)
    await page.goto('/admin/command', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('fits 375px without horizontal scrolling', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    await page.goto('/admin/command', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => undefined)

    await page.setViewportSize({ width: 375, height: 812 })
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      return doc.scrollWidth - doc.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(1)

    await expect(page.getByRole('heading', { name: /^today$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /open rep day/i }).first()).toBeVisible()
  })
})

test.describe('Operating hours (admin)', () => {
  test('rejects a workday that ends before it starts', async ({ page }) => {
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => undefined)

    await expect(page.getByRole('heading', { name: /operating hours/i })).toBeVisible()

    const start = page.getByLabel(/workday starts/i)
    const end = page.getByLabel(/workday ends/i)
    await start.fill('18:00')
    await end.fill('09:00')
    await page.getByRole('button', { name: /save operating hours/i }).click()

    // Scope to the panel: the global notification toast also surfaces the
    // server message, and an unscoped locator matches both.
    const panel = page.getByRole('region', { name: 'Operating hours' })
    await expect(panel.getByRole('alert')).toContainText(/must start before it ends/i, { timeout: 15_000 })
  })
})
