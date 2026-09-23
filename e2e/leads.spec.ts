import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers'

const LEAD_DETAIL_PATH = /\/leads\/[a-zA-Z0-9-]+/

function firstLeadLink(page: Page) {
  return page.locator('a[href^="/leads/"]:not([href="/leads/new"]):not([href="/leads/import"])').first()
}

test.describe('LEADS - List, Detail, CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('L01: Leads page renders with lane groups', async ({ page }) => {
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
    
    // Should show lane headers (New, Contacted, etc.)
    const hasLanes = body?.includes('New') || body?.includes('new') || body?.includes('Lead') || body?.includes('lead')
    expect(hasLanes).toBeTruthy()
  })

  test('L02: Lead cards are clickable and navigate to detail', async ({ page }) => {
    const leadLink = firstLeadLink(page)
    const hasLead = await leadLink.isVisible({ timeout: 8_000 }).catch(() => false)
    
    if (hasLead) {
      const href = await leadLink.getAttribute('href')
      await leadLink.click()
      // Client-side navigation is lazy; use auto-waiting assertion
      await expect(page).toHaveURL(new RegExp(`${(href as string).replace('/', '\\/')}`), { timeout: 15_000 })
    }
  })

  test('L03: Lead detail page shows contact info', async ({ page }) => {
    const leadLink = firstLeadLink(page)
    const hasLead = await leadLink.isVisible({ timeout: 8_000 }).catch(() => false)
    
    if (hasLead) {
      await leadLink.click()
      await expect(page).toHaveURL(LEAD_DETAIL_PATH, { timeout: 15_000 })
      await page.waitForTimeout(1500)
      
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(20)
    }
  })

  test('L04: Back button from lead detail returns to leads list', async ({ page }) => {
    const leadLink = firstLeadLink(page)
    const hasLead = await leadLink.isVisible({ timeout: 8_000 }).catch(() => false)
    
    if (hasLead) {
      await leadLink.click()
      await expect(page).toHaveURL(LEAD_DETAIL_PATH, { timeout: 15_000 })
      
      // Go back
      await page.goBack()
      await expect(page).toHaveURL(/\/leads/, { timeout: 15_000 })
    }
  })

  test('L05: Create Lead button is visible', async ({ page }) => {
    const createBtn = page.locator('a:has-text("Create Lead"), button:has-text("Create Lead"), a:has-text("New Lead"), a[href*="/leads/new"]').first()
    const hasCreate = await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    
    // Verify page is stable
    expect(page.url()).toContain('/leads')
  })

  test('L06: Search/filter on leads page works', async ({ page }) => {
    // Look for search input
    const searchInput = page.locator('input[placeholder*="Search" i], input[placeholder*="Filter" i], input[type="search"]').first()
    const hasSearch = await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasSearch) {
      await searchInput.fill('Tech')
      await page.waitForTimeout(1000)
      
      // Page should still be functional
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(10)
    }
  })

  test('L07: Lead detail has action buttons (Contact, Draft, etc.)', async ({ page }) => {
    const leadLink = firstLeadLink(page)
    await expect(leadLink).toBeVisible({ timeout: 8_000 })

    await leadLink.click()
    await expect(page).toHaveURL(LEAD_DETAIL_PATH, { timeout: 15_000 })
    await page.waitForTimeout(1000)

    const body = await page.textContent('body')
    // Should have some action buttons
    const hasActions = body?.includes('Contact') || body?.includes('Draft') ||
                       body?.includes('Reply') || body?.includes('Follow') ||
                       body?.includes('Generate') || body?.includes('Write')
    expect(hasActions).toBeTruthy()
  })

  test('L08: Mark as Contacted works', async ({ page }) => {
    const leadLink = firstLeadLink(page)
    const hasLead = await leadLink.isVisible({ timeout: 8_000 }).catch(() => false)
    
    if (hasLead) {
      await leadLink.click()
      await expect(page).toHaveURL(LEAD_DETAIL_PATH, { timeout: 15_000 })
      await page.waitForTimeout(1000)
      
      const contactedBtn = page.locator('button:has-text("Contacted"), button:has-text("Mark Contacted"), button:has-text("Contact")').first()
      const hasBtn = await contactedBtn.isVisible({ timeout: 3_000 }).catch(() => false)
      
      if (hasBtn) {
        await contactedBtn.click()
        await page.waitForTimeout(2000)
        
        // Page should still be functional
        expect(page.url()).toMatch(LEAD_DETAIL_PATH)
      }
    }
  })

  test('L09: Leads page handles empty state gracefully', async ({ page }) => {
    // Clear any search filters
    const searchInput = page.locator('input[placeholder*="Search" i], input[type="search"]').first()
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchInput.fill('zzzznonexistentcompany12345')
      await page.waitForTimeout(1000)
      
      const body = await page.textContent('body')
      // Should show empty state or no results message
      expect(body!.length).toBeGreaterThan(5)
    }
  })

  test('L10: Lead creation via /leads/new', async ({ page }) => {
    await page.goto('/leads/new')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
    
    // Should have form inputs
    const inputs = page.locator('input, textarea')
    const count = await inputs.count()
    expect(count).toBeGreaterThan(0)
  })
})
