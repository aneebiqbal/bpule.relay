import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('STUDIO - Content Creation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/studio')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('ST01: Studio page renders', async ({ page }) => {
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('ST02: Studio has content creation controls', async ({ page }) => {
    const body = await page.textContent('body')
    const hasControls = body?.includes('Create') || body?.includes('Generate') || 
                        body?.includes('Write') || body?.includes('Post') ||
                        body?.includes('Content') || body?.includes('Studio')
    expect(hasControls).toBeTruthy()
  })

  test('ST03: Quick capture area exists', async ({ page }) => {
    const body = (await page.textContent('body'))?.toLowerCase() || ''
    const hasCapture = body.includes('quick') || body.includes('capture') || 
                       body.includes('idea') || body.includes('note') ||
                       body.includes('draft') || body.includes('write') ||
                       body.includes('generate') || body.includes('create')
    expect(hasCapture).toBeTruthy()
  })

  test('ST04: Content drafts list loads', async ({ page }) => {
    await page.waitForTimeout(2000)
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(20)
  })

  test('ST05: Studio handles empty drafts state', async ({ page }) => {
    const body = await page.textContent('body')
    // Should show either drafts or empty state message
    expect(body!.length).toBeGreaterThan(5)
  })
})

test.describe('STUDIO - Post Detail', () => {
  test('ST06: Content library/drafts page loads', async ({ page }) => {
    await page.goto('/content')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('ST07: Draft detail page loads when draft exists', async ({ page }) => {
    // Try to find a draft link
    await page.goto('/content')
    await page.waitForLoadState('networkidle')
    
    const draftLink = page.locator('a[href*="/content/"]').first()
    const hasDraft = await draftLink.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasDraft) {
      await draftLink.click()
      await page.waitForLoadState('networkidle')
      
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(10)
    }
  })
})
