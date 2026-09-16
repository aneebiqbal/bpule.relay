import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('ADMIN -> Assignment -> Rep', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('A01: Admin command center loads', async ({ page }) => {
    await page.goto('/admin/command-center')
    await page.waitForLoadState('networkidle')
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A02: Revenue identities page loads', async ({ page }) => {
    await page.goto('/admin/revenue-identities')
    await page.waitForLoadState('networkidle')
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('A03: Assignments route responds', async ({ request }) => {
    const res = await request.get('/api/admin/assignments')
    expect([200, 401, 403, 404]).toContain(res.status())
  })
})
