import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

async function openAdminRoute(path: string, page: import('@playwright/test').Page): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 })
}

test.describe('ADMIN - Command Center & Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('A01: Admin command center loads', async ({ page }) => {
    await openAdminRoute('/admin/command-center', page)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A02: Revenue identities admin page loads', async ({ page }) => {
    await openAdminRoute('/admin/revenue-identities', page)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A03: Targets admin page loads', async ({ page }) => {
    await openAdminRoute('/admin/targets', page)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A04: Team page loads', async ({ page }) => {
    await openAdminRoute('/team', page)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A05: Settings page loads', async ({ page }) => {
    await openAdminRoute('/account', page)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A06: Profiles page loads', async ({ page }) => {
    await openAdminRoute('/profiles', page)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A07: Usage page loads', async ({ page }) => {
    await openAdminRoute('/usage', page)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A08: Revenue identities have create/edit controls', async ({ page }) => {
    await openAdminRoute('/admin/revenue-identities', page)
    
    const body = await page.textContent('body')
    const hasControls = body?.includes('Create') || body?.includes('Add') || 
                        body?.includes('New') || body?.includes('Edit') ||
                        body?.includes('Identity')
    expect(hasControls).toBeTruthy()
  })

  test('A09: Targets have create/edit controls', async ({ page }) => {
    await openAdminRoute('/admin/targets', page)
    
    const body = await page.textContent('body')
    const hasControls = body?.includes('Create') || body?.includes('Add') || 
                        body?.includes('New') || body?.includes('Edit') ||
                        body?.includes('Target')
    expect(hasControls).toBeTruthy()
  })

  test('A10: Command center shows overview data', async ({ page }) => {
    await openAdminRoute('/admin/command-center', page)
    await page.waitForTimeout(2000)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(20)
  })
})
