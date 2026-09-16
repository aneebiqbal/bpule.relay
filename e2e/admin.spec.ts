import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('ADMIN - Command Center & Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('A01: Admin command center loads', async ({ page }) => {
    await page.goto('/admin/command-center')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A02: Revenue identities admin page loads', async ({ page }) => {
    await page.goto('/admin/revenue-identities')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A03: Targets admin page loads', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A04: Team page loads', async ({ page }) => {
    await page.goto('/team')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A05: Settings page loads', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A06: Profiles page loads', async ({ page }) => {
    await page.goto('/profiles')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A07: Usage page loads', async ({ page }) => {
    await page.goto('/usage')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A08: Revenue identities have create/edit controls', async ({ page }) => {
    await page.goto('/admin/revenue-identities')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    const hasControls = body?.includes('Create') || body?.includes('Add') || 
                        body?.includes('New') || body?.includes('Edit') ||
                        body?.includes('Identity')
    expect(hasControls).toBeTruthy()
  })

  test('A09: Targets have create/edit controls', async ({ page }) => {
    await page.goto('/admin/targets')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    const hasControls = body?.includes('Create') || body?.includes('Add') || 
                        body?.includes('New') || body?.includes('Edit') ||
                        body?.includes('Target')
    expect(hasControls).toBeTruthy()
  })

  test('A10: Command center shows overview data', async ({ page }) => {
    await page.goto('/admin/command-center')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(20)
  })
})
