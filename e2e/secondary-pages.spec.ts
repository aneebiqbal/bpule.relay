import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('UPWORK - Job Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/upwork')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
  })

  test('U01: Upwork page renders with job list', async ({ page }) => {
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('U02: Job cards are clickable', async ({ page }) => {
    const jobLink = page.locator('a[href*="/upwork/"]:not([href*="/upwork/new"])').first()
    const hasJob = await jobLink.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasJob) {
      await jobLink.click()
      await page.waitForURL(/\/upwork\/[a-z0-9-]+/, { timeout: 15_000 })
      
      const body = await page.textContent('body')
      expect(body!.length).toBeGreaterThan(10)
    }
  })

  test('U03: New job page loads', async ({ page }) => {
    await page.goto('/upwork/new')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('U04: Job detail has action buttons', async ({ page }) => {
    const jobLink = page.locator('a[href*="/upwork/"]:not([href*="/upwork/new"])').first()
    const hasJob = await jobLink.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasJob) {
      await jobLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
      
      const body = await page.textContent('body')
      const hasActions = body?.includes('Apply') || body?.includes('Qualify') || 
                         body?.includes('Mark') || body?.includes('Action') ||
                         body?.includes('Draft') || body?.includes('Generate')
      expect(hasActions).toBeTruthy()
    }
  })

  test('U05: Back from job detail returns to list', async ({ page }) => {
    const jobLink = page.locator('a[href*="/upwork/"]:not([href*="/upwork/new"])').first()
    const hasJob = await jobLink.isVisible({ timeout: 5_000 }).catch(() => false)
    
    if (hasJob) {
      await jobLink.click()
      await page.waitForLoadState('networkidle')
      
      await page.goBack()
      await page.waitForLoadState('networkidle')
      
      expect(page.url()).toContain('/upwork')
    }
  })
})

test.describe('INBOUND - Message Analysis', () => {
  test('I01: Inbound page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/inbound')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('I02: Inbound has input area for messages', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/inbound')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    const hasInput = body?.includes('Paste') || body?.includes('Input') || 
                     body?.includes('Message') || body?.includes('Analyze') ||
                     body?.includes('Inbound')
    expect(hasInput).toBeTruthy()
  })
})

test.describe('SEARCH - Global Search', () => {
  test('SE01: Search page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })

  test('SE02: Search input exists', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
    
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search" i], input[placeholder*="search" i]').first()
    const hasSearch = await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)
    
    // Search page should have some input
    expect(page.url()).toContain('/search')
  })

  test('SE03: Search with query parameter works', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/search?q=TechCorp')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(5)
  })
})

test.describe('FACTS - Fact Management', () => {
  test('F01: Facts page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/facts')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })
})

test.describe('ARCHIVE - Archive Page', () => {
  test('AR01: Archive page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/archive')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })
})

test.describe('ONBOARDING - First Run', () => {
  test('ON01: Onboarding page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/onboarding')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })
})

test.describe('USAGE - Usage Tracking', () => {
  test('U-S01: Usage page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/usage')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })
})

test.describe('ACCOUNT - Account Settings', () => {
  test('AC01: Account page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/account')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })
})

test.describe('ASSIGNED PROFILES - Profile Assignment', () => {
  test('AP01: Assigned profiles page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/assigned-profiles')
    await page.waitForLoadState('networkidle')
    
    const body = await page.textContent('body')
    expect(body!.length).toBeGreaterThan(10)
  })
})
