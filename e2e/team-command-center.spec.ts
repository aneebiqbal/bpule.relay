import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

/**
 * Team Command Center journey.
 *
 * Default run is read-only: it opens the command center, reviews an assignment
 * with the dry-run endpoint, and inspects the Setup Assistant. Set E2E_WRITE=1
 * to also apply the change — never run that against production assignments.
 */
const WRITE = process.env.E2E_WRITE === '1'

test.describe('TEAM → Command Center', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('C01: the command center answers the operating questions', async ({ page }) => {
    await page.goto('/team')
    await page.waitForLoadState('networkidle')
    const body = await page.textContent('body')
    for (const label of ['Command Center', 'Action queue', 'Who works what', 'Target progress', 'Coverage exceptions']) {
      expect(body).toContain(label)
    }
  })

  test('C02: an assignment can be reviewed before it is written', async ({ page }) => {
    await page.goto('/team')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Assign people' }).click()
    await page.getByText('Select profiles to begin').waitFor()

    const firstProfile = page.locator('input[type="checkbox"]').first()
    await firstProfile.check()
    const primarySelect = page.locator('select').first()
    await primarySelect.selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Review access' }).click()
    await page.getByText('Effective access').waitFor()
  })

  test('C03: the setup assistant offers describe and form modes', async ({ page }) => {
    await page.goto('/team')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Setup assistant' }).click()
    await page.getByText('Describe the outcome, review the change, then apply it.').waitFor()
    await page.getByRole('button', { name: 'Form' }).click()
    await page.getByText('Schedule days').waitFor()
  })

  test('C04: apply path (fixture org only)', async ({ page }) => {
    test.skip(!WRITE, 'E2E_WRITE is not set; write path is disabled outside a fixture org')
    await page.goto('/team')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Assign people' }).click()
    const firstProfile = page.locator('input[type="checkbox"]').first()
    await firstProfile.check()
    await page.locator('select').first().selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByText('Saved').first().waitFor()
  })
})
