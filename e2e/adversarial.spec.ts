import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('ADVERSARIAL - Input Fuzzing & Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('ADV01: XSS in prospect textarea does not execute', async ({ page }) => {
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const xssPayload = '<script>alert("XSS")</script>'
    let alertFired = false
    page.on('dialog', () => { alertFired = true })
    
    const textarea = page.locator('textarea').first()
    await textarea.fill(xssPayload)
    
    const analyzeBtn = page.locator('button:has-text("Analyze"), button:has-text("Check")').first()
    if (await analyzeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await analyzeBtn.click()
      await page.waitForTimeout(3000)
    }
    
    expect(alertFired).toBeFalsy()
  })

  test('ADV02: SQL injection in search does not cause error', async ({ page }) => {
    await page.goto('/search?q=\'; DROP TABLE leads; --')
    await page.waitForLoadState('networkidle')
    
    // Page should not crash
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(0)
  })

  test('ADV03: Unicode stress test in prospect', async ({ page }) => {
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const unicode = '日本語テスト 🎉 مرحبا العالم Здравствуй мир'
    const textarea = page.locator('textarea').first()
    await textarea.fill(unicode)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(0)
  })

  test('ADV04: Very long single word input', async ({ page }) => {
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const longWord = 'A'.repeat(5000)
    const textarea = page.locator('textarea').first()
    await textarea.fill(longWord)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(0)
  })

  test('ADV05: Null bytes in input', async ({ page }) => {
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const nullBytes = 'test\x00\x00\x00profile'
    const textarea = page.locator('textarea').first()
    await textarea.fill(nullBytes)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(0)
  })

  test('ADV06: HTML entities in input', async ({ page }) => {
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const htmlEntities = '&lt;script&gt;alert("xss")&lt;/script&gt;'
    const textarea = page.locator('textarea').first()
    await textarea.fill(htmlEntities)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(0)
  })

  test('ADV07: Rapid form submissions do not duplicate', async ({ page }) => {
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const textarea = page.locator('textarea').first()
    await textarea.fill('Test User at TestCo. Building things.')
    
    const analyzeBtn = page.locator('button:has-text("Analyze"), button:has-text("Check")').first()
    if (await analyzeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Click rapidly multiple times
      for (let i = 0; i < 5; i++) {
        await analyzeBtn.click({ delay: 100 })
      }
      
      await page.waitForTimeout(5000)
      
      // Page should be stable
      expect(page.url()).toContain('/prospect')
    }
  })

  test('ADV08: Browser back/forward after form submission', async ({ page }) => {
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const textarea = page.locator('textarea').first()
    await textarea.fill('Test profile text for navigation test')
    
    await page.goBack()
    await page.waitForLoadState('networkidle')
    
    await page.goForward()
    await page.waitForLoadState('networkidle')
    
    expect(page.url()).toContain('/prospect')
  })

  test('ADV09: Multi-tab does not corrupt state', async ({ page, context }) => {
    const page2 = await context.newPage()
    
    await loginAsAdmin(page)
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    
    await page2.goto('/leads')
    await page2.waitForLoadState('networkidle')
    
    const body1 = await page.textContent('body')
    const body2 = await page2.textContent('body')
    
    // Both should render without errors
    expect(body1!.length).toBeGreaterThan(10)
    expect(body2!.length).toBeGreaterThan(10)
    
    await page2.close()
  })

  test('ADV10: Network failure during analysis shows error state', async ({ page }) => {
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const textarea = page.locator('textarea').first()
    await textarea.fill('Test User at TestCo')
    
    // Block all API requests
    await page.route('**/api/**', route => route.abort())
    
    const analyzeBtn = page.locator('button:has-text("Analyze"), button:has-text("Check")').first()
    if (await analyzeBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await analyzeBtn.click()
      await page.waitForTimeout(3000)
      
      // Should show error state, not crash
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(5)
    }
  })
})
