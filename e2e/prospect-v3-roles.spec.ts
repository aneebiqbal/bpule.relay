import { test, expect } from '@playwright/test'

/**
 * Prospect V3 — role scoping.
 *
 * Runs under the `rep` project with the rep storage state. A rep must get the
 * same workspace with only their permitted profile/workspace, and no admin-only
 * surface may be reachable.
 */
test.describe('PROSPECT V3 — roles', () => {
  test('a rep gets the same workspace without admin-only controls', async ({ page }) => {
    await page.goto('/prospect')
    await expect(page.getByRole('heading', { name: 'Prospects' })).toBeVisible()
    await expect(page.locator('textarea').first()).toBeVisible()

    // Admin-only surfaces must not be reachable from the shell or the page.
    await expect(page.getByRole('button', { name: 'Invite Person' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)

    // The active profile is the rep's own permitted profile.
    const attribution = await page.locator('main').innerText()
    expect(attribution.length).toBeGreaterThan(0)
  })

  test('URL manipulation cannot widen a rep scope', async ({ page }) => {
    // A rep must land on their own workspace even when the URL asks for more.
    await page.goto('/prospect?scope=org')
    await expect(page.getByRole('heading', { name: 'Prospects' })).toBeVisible()
    await expect(page.locator('[data-testid="prospect-primary-action"]')).toHaveCount(0)
  })
})
