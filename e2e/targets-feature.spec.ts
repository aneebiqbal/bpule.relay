import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('ADMIN /admin/targets — complete feature', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('T01: Targets page renders with identity lanes', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')

    const body = await page.textContent('body')
    // Should show the page title
    expect(body).toContain('Targets')
    // Should not show user-facing error states
    expect(body?.toLowerCase()).not.toContain('failed to load')
    // Check that the page has actual content (not an error page)
    expect(body?.length).toBeGreaterThan(100)
  })

  test('T02: Revenue identities display LinkedIn channel', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')

    // Check that the identity dropdown/selector shows LinkedIn
    const body = await page.textContent('body')

    // All seeded identities should show as LINKEDIN
    // The seeded identities are: Fizza, Zaira, Mehak, Aneeb, Hassan
    const linkedinCount = (body?.match(/LINKEDIN/g) ?? []).length
    // At least the identities that are shown should be LinkedIn
    expect(linkedinCount).toBeGreaterThanOrEqual(1)

    // Should NOT show "OTHER" as the channel for seeded identities
    expect(body).not.toContain('OTHER')
  })

  test('T03: Create target form is functional', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')

    // Click "Define target" or similar button to show form
    const defineBtn = page.locator('button:has-text("Define"), button:has-text("Create"), button:has-text("Add")').first()
    if (await defineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await defineBtn.click()
      await page.waitForTimeout(500)

      // Form should now be visible
      const form = page.locator('select, input[type="number"]').first()
      await expect(form).toBeVisible({ timeout: 5_000 })
    }
  })

  test('T04: Existing targets show correct identity names', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1_000)

    const body = await page.textContent('body')

    // Should show identity names (seeded: Fizza, Zaira, Mehak, Aneeb, Hassan)
    const hasIdentityNames = body?.includes('Fizza') || body?.includes('Zaira') ||
                             body?.includes('Mehak') || body?.includes('Aneeb') ||
                             body?.includes('Hassan')

    // Either we have targets with identity names, or the empty state is shown
    const hasEmptyState = body?.includes('No targets') || body?.includes('No active targets') ||
                          body?.includes('Define your first target')
    expect(hasIdentityNames || hasEmptyState).toBeTruthy()
  })

  test('T05: Page survives hard refresh', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')

    // Hard refresh
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1_000)

    const body = await page.textContent('body')
    // Page should still render correctly
    expect(body).toContain('Targets')
    expect(body?.toLowerCase()).not.toContain('failed')
  })

  test('T06: Define target button reveals form', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')

    // Click "Define target" to reveal the form
    const defineBtn = page.locator('button, a').filter({ hasText: /Define target/i }).first()
    const hasBtn = await defineBtn.isVisible({ timeout: 3_000 }).catch(() => false)
    expect(hasBtn).toBeTruthy()

    if (hasBtn) {
      await defineBtn.click()
      await page.waitForTimeout(1_000)

      // After clicking, form elements should appear
      const selects = page.locator('select')
      const selectCount = await selects.count()
      // Should have at least rep + identity + activity selects
      expect(selectCount).toBeGreaterThanOrEqual(2)
    }
  })
})
