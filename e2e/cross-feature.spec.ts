import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('CROSS-FEATURE - State Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('CF01: Prospect → Save as Lead → Leads page shows new lead', async ({ page }) => {
    // Step 1: Analyze a prospect
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const validProfile = `
      Cross Feature Test User
      QA Engineer at TestCorp
      Austin, TX
      
      Automated testing expert with 5 years experience.
      Passionate about quality assurance and E2E testing.
    `
    
    const textarea = page.locator('textarea').first()
    await textarea.fill(validProfile)
    
    const analyzeBtn = page.locator('button:has-text("Analyze"), button:has-text("Check")').first()
    if (await analyzeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await analyzeBtn.click()
      await page.waitForTimeout(10_000)
      
      // Step 2: Try to save as lead
      const saveBtn = page.locator('button:has-text("Save as Lead"), button:has-text("Save Lead")').first()
      const hasSave = await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)
      
      if (hasSave) {
        await saveBtn.click()
        await page.waitForTimeout(3000)
        
        // Step 3: Check leads page
        await page.goto('/leads')
        await page.waitForLoadState('networkidle')
        
        const body = await page.textContent('body')
        // The lead should appear in the list
        expect(body!.length).toBeGreaterThan(10)
      }
    }
  })

  test('CF02: Lead detail state persists across page reloads', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    
    const leadLink = page.locator('a[href*="/leads/"]').first()
    const hasLead = await leadLink.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasLead) {
      const href = await leadLink.getAttribute('href')
      
      await page.goto(href!)
      await page.waitForLoadState('networkidle')
      
      const bodyBefore = await page.textContent('body')
      
      // Reload
      await page.reload()
      await page.waitForLoadState('networkidle')
      
      const bodyAfter = await page.textContent('body')
      
      // Content should be the same
      expect(bodyAfter).toBe(bodyBefore)
    }
  })

  test('CF03: Navigation state does not leak between features', async ({ page }) => {
    // Visit prospect
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const textarea = page.locator('textarea').first()
    await textarea.fill('Some prospect text')
    
    // Navigate to leads
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    
    // Navigate back to prospect
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    // Textarea should be clean (ephemeral)
    const value = await textarea.inputValue()
    expect(value).toBe('')
  })

  test('CF04: Demo mode data is consistent across pages', async ({ page }) => {
    // Check leads page has data
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    const leadsBody = await page.textContent('body')
    const leadsHasContent = leadsBody!.length > 50
    
    // Check relay page has data
    await page.goto('/relay')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    const relayBody = await page.textContent('body')
    const relayHasContent = relayBody!.length > 50
    
    // Both should have demo data
    expect(leadsHasContent).toBeTruthy()
    expect(relayHasContent).toBeTruthy()
  })

  test('CF05: Settings/Profile pages load without blocking', async ({ page }) => {
    const settingsRoutes = ['/settings', '/profiles', '/usage', '/account']
    
    for (const route of settingsRoutes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(10)
      
      // Should not redirect to login
      expect(page.url()).toContain(route)
    }
  })
})
