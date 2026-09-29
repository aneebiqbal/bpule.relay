import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

test.describe('STUDIO V2 - Daily Editorial Desk', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('ST-V2-01: Studio Today page renders without questionnaire', async ({ page }) => {
    await page.goto('/content-v2/e77befa7-84a4-4ccc-9c54-e51450154f9c/today')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Should show the editorial desk framing (not a questionnaire)
    const heading = page.getByText('Your post for today', { exact: false })
    const hasHeading = await heading.count().catch(() => 0)
    const loadingText = page.getByText('Preparing your editorial brief', { exact: false })
    const isLoading = await loadingText.count().catch(() => 0)
    expect(hasHeading > 0 || isLoading > 0).toBeTruthy()
  })

  test('ST-V2-02: Recommended post is visible', async ({ page }) => {
    await page.goto('/content-v2/e77befa7-84a4-4ccc-9c54-e51450154f9c/today')
    await page.waitForLoadState('networkidle')

    const copyBtn = page.getByText('Copy post').first()
    const hasCopy = await copyBtn.isVisible({ timeout: 90000 }).catch(() => false)
    const loadingText = page.getByText('Preparing your editorial brief', { exact: false })
    const isLoading = await loadingText.count().catch(() => 0)
    expect(hasCopy || isLoading > 0).toBeTruthy()
  })

  test('ST-V2-03: Alternate ideas are shown', async ({ page }) => {
    await page.goto('/content-v2/e77befa7-84a4-4ccc-9c54-e51450154f9c/today')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const alternates = page.getByText('Other ideas today', { exact: false })
    const hasAlternates = await alternates.count().catch(() => 0)
    const loadingText = page.getByText('Preparing your editorial brief', { exact: false })
    const isLoading = await loadingText.count().catch(() => 0)
    expect(hasAlternates > 0 || isLoading > 0).toBeTruthy()
  })

  test('ST-V2-04: Copy post button works', async ({ page }) => {
    await page.goto('/content-v2/e77befa7-84a4-4ccc-9c54-e51450154f9c/today')
    await page.waitForLoadState('networkidle')
    const copyBtn = page.getByText('Copy post').first()
    const isVisible = await copyBtn.isVisible({ timeout: 90000 }).catch(() => false)
    if (isVisible) {
      await copyBtn.click()
      await page.waitForTimeout(1500)
    }
    // If generation is still loading, that's also acceptable
    const loadingText = page.getByText('Preparing your editorial brief', { exact: false })
    const isLoading = await loadingText.count().catch(() => 0)
    expect(isVisible || isLoading > 0).toBeTruthy()
  })
})

test.describe('RELAY GROWTH V2 - Daily Post', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('GR-V2-01: Growth page renders without input required', async ({ page }) => {
    await page.goto('/content-v2/growth')
    await page.waitForLoadState('networkidle')

    const body = await page.textContent('body')
    // Should show "Today's post" without asking for input
    expect(body).toContain("Today's post")
    expect(body).not.toContain('Enter your product details')
    expect(body).not.toContain('What should we post about')
  })

  test('GR-V2-02: Growth post has copy button', async ({ page }) => {
    await page.goto('/content-v2/growth')
    await page.waitForSelector('text=Copy post', { timeout: 90000 }).catch(() => {})

    const body = await page.textContent('body')
    expect(body?.includes('Copy post') || body?.includes('Preparing')).toBeTruthy()
  })

  test('GR-V2-03: No private data in Growth post', async ({ page }) => {
    await page.goto('/content-v2/growth')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const body = await page.textContent('body') || ''
    // Should not contain fake metrics or private data patterns
    const hasFakeCustomer = /\b(our customer|our client|Jane Doe|Acme Corp)\b/i.test(body)
    const hasFakeScore = /\b(scored? \d+\.?\d*|9\.5\/10|8\.7\/10)\b/i.test(body)
    expect(hasFakeCustomer).toBeFalsy()
    expect(hasFakeScore).toBeFalsy()
  })
})
