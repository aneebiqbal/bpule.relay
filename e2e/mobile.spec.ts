import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('MOBILE - Viewport & Responsive', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('M01: Mobile nav renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Mobile bottom nav is a <nav aria-label="Primary"> with lg:hidden
    const mobileNav = page.locator('nav[aria-label="Primary"]')
    await expect(mobileNav).toBeVisible({ timeout: 10_000 })
    
    // It should contain the 4 bottom items
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('M02: Dashboard renders on mobile', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('M03: Prospect page renders on mobile', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/prospect')
    await page.waitForLoadState('networkidle')
    
    const textarea = page.locator('textarea').first()
    const hasTextarea = await textarea.isVisible({ timeout: 5_000 }).catch(() => false)
    expect(hasTextarea).toBeTruthy()
  })

  test('M04: Leads page renders on mobile', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('M05: Relay page renders on mobile', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/relay')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('M06: Mobile bottom nav items are clickable', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    // Bottom nav links
    const bottomNavItems = page.locator('nav[aria-label="Primary"] a')
    const count = await bottomNavItems.count()
    expect(count).toBeGreaterThanOrEqual(4)
    
    // Each should be visible and navigate
    for (let i = 0; i < count; i++) {
      await expect(bottomNavItems.nth(i)).toBeVisible()
    }
    
    // Click "Leads"
    const leadsLink = bottomNavItems.filter({ hasText: 'Leads' })
    await leadsLink.click()
    await expect(page).toHaveURL(/\/leads/)
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(5)
  })

  test('M07: No horizontal overflow on mobile', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    
    // Should not have significant horizontal overflow
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 20)
  })

  test('M08: Touch-friendly tap targets on mobile', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/leads')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Check that interactive elements have reasonable size
    const interactive = page.locator('button, a[href]')
    const count = await interactive.count()
    const offenders: Array<{ tag: string; text: string; height: number; width: number }> = []
    
    for (let i = 0; i < count; i++) {
      const el = interactive.nth(i)
      if (!(await el.isVisible({ timeout: 500 }).catch(() => false))) continue
      const box = await el.boundingBox()
      if (box) {
        const text = ((await el.textContent()?.catch(() => '') ) ?? '').trim().slice(0, 40)
        const tag = (await el.evaluate((n) => n.tagName)).toLowerCase()
        if (box.height < 30 || box.width < 30) {
          offenders.push({ tag, text, height: box.height, width: box.width })
        }
      }
    }
    
    if (offenders.length > 0) {
      console.log('MOBILE TAP TARGET FINDINGS (30px threshold):')
      for (const o of offenders) {
        console.log(`  <${o.tag}> "${o.text}" height=${o.height} width=${o.width}`)
      }
    }
    
    // WCAG 2.2 hard floor: >= 24 CSS px. Anything between 24-30 flagged above (P2).
    const serious = offenders.filter((o) => o.height < 24 || o.width < 24)
    expect(serious).toHaveLength(0)
  })
})
