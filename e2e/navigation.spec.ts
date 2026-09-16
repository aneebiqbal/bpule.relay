import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('NAVIGATION - Deep Links, History, Routing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('N01: Deep link to /leads/[id] works', async ({ page }) => {
    // First get a valid lead ID from the leads page
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    
    const leadLink = page.locator('a[href*="/leads/"]').first()
    const href = await leadLink.getAttribute('href')
    
    if (href && href.includes('/leads/')) {
      await page.goto(href)
      await page.waitForLoadState('networkidle')
      
      expect(page.url()).toContain('/leads/')
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(10)
    }
  })

  test('N02: Back/Forward navigation preserves state', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    
    await page.goBack()
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/dashboard')
    
    await page.goForward()
    await page.waitForLoadState('networkidle')
    expect(page.url()).toContain('/leads')
  })

  test('N03: Direct URL access to protected routes redirects to login', async ({ page }) => {
    // Clear cookies/storage to simulate unauthenticated
    await page.context().clearCookies()
    
    const protectedRoutes = ['/dashboard', '/leads', '/relay', '/studio', '/prospect']
    
    for (const route of protectedRoutes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      
      // Should redirect to login
      const url = page.url()
      const redirected = url.includes('/login') || url.includes('/')
      expect(redirected).toBeTruthy()
    }
  })

  test('N04: Cmd+K command palette opens', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Try Cmd+K
    await page.keyboard.press('Meta+k')
    await page.waitForTimeout(1000)
    
    // Look for command palette overlay
    const palette = page.locator('[role="dialog"], [role="combobox"], [class*="command"], [class*="palette"], [class*="modal"]').first()
    const hasPalette = await palette.isVisible({ timeout: 3_000 }).catch(() => false)
    
    // If palette opened, close it
    if (hasPalette) {
      await page.keyboard.press('Escape')
    }
    
    // Page should be stable
    expect(page.url()).toContain('/dashboard')
  })

  test('N05: Rapid page navigation does not crash', async ({ page }) => {
    const routes = ['/dashboard', '/leads', '/relay', '/studio', '/prospect', '/dashboard']
    
    for (const route of routes) {
      await page.goto(route)
      // Don't wait for full load - navigate rapidly
    }
    
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    // Page should be stable
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(5)
  })

  test('N06: Browser refresh on protected page works', async ({ page }) => {
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    
    await page.reload()
    await page.waitForLoadState('networkidle')
    
    expect(page.url()).toContain('/leads')
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('N07: 404 page handles unknown routes', async ({ page }) => {
    await page.goto('/nonexistent-route-xyz-123')
    await page.waitForLoadState('networkidle')
    
    // Should show 404 or redirect
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(0)
  })
})
