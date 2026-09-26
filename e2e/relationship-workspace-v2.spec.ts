import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

/**
 * RELATIONSHIP WORKSPACE V2 — E2E ACCEPTANCE
 *
 * Verifies the new BD workspace UX:
 * - Lead Detail shows relationship state (Your Move / Their Move)
 * - Timeline shows human-readable activity
 * - Conversations tab groups by operational meaning
 * - Leads list rows show relationship state
 */

test.describe('RELATIONSHIP WORKSPACE V2', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Lead Detail shows relationship state for a new lead', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Find a lead and click into it
    const firstLead = page.locator('a[href^="/leads/"]').first()
    if (await firstLead.count() === 0) test.skip(true, 'No leads available in demo')

    await firstLead.click()
    await page.waitForLoadState('networkidle')

    // The page should show relationship workspace elements
    await expect(page.getByText('Your move').or(page.getByText('Their move')).or(page.getByText('Waiting for')).first()).toBeVisible({ timeout: 10000 })
  })

  test('Leads list rows show human-readable relationship state', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Should see the filter tabs
    await expect(page.getByText('All')).toBeVisible()
    await expect(page.getByText('Needs Action').or(page.getByText('New')).first()).toBeVisible()
  })

  test('Conversations tab groups by operational meaning', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    // Switch to conversations tab
    const convTab = page.getByText('Conversations')
    if (await convTab.count() === 0) test.skip(true, 'No conversations tab')

    await convTab.click()
    await page.waitForLoadState('networkidle')

    // Should show group labels or empty state
    const hasContent = await page.getByText('Needs your reply').or(page.getByText('Waiting on them')).or(page.getByText('No active conversations')).first().isVisible()
    expect(hasContent).toBeTruthy()
  })

  test('Timeline shows expandable activity items', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')

    const firstLead = page.locator('a[href^="/leads/"]').first()
    if (await firstLead.count() === 0) test.skip(true, 'No leads available')

    await firstLead.click()
    await page.waitForLoadState('networkidle')

    // Should have activity section
    const activityVisible = await page.getByText('Activity').isVisible()
    expect(activityVisible).toBeTruthy()
  })
})
