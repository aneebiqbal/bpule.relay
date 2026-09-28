import { test, expect } from '@playwright/test'

/**
 * Landing page — Convergence system smoke tests.
 *
 * Verifies the page renders, the signature interactions work,
 * the Studio→Relay sequence completes, no horizontal overflow
 * exists, reduced motion shows final states, and authenticated
 * routes are untouched.
 */

test.describe('Landing — renders', () => {
  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`hero settles at ${vp.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      await page.goto('/', { waitUntil: 'networkidle' })

      // Headline is server-rendered and immediately visible
      await expect(page.getByRole('heading', { level: 1, name: /know what to do next/i })).toBeVisible()

      // After the convergence sequence, the Do This Next card is visible
      await expect(page.locator('.lg3-dtn').first()).toBeVisible({ timeout: 8000 })
      await expect(page.getByText('Reply to Sarah').first()).toBeVisible()

      // Featured signal node turned orange
      const featured = page.locator('[data-field="hero"] .lg3-node--featured')
      await expect(featured).toHaveCount(1)

      await context.close()
    })
  }

  test('all seven sections present', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    for (const id of ['product', 'priority', 'moves', 'conversation', 'studio-relay', 'close']) {
      await expect(page.locator(`[data-section="${id}"]`)).toBeAttached()
    }
    await expect(page.locator('#hero')).toBeAttached()
  })
})

test.describe('Landing — CTAs', () => {
  test('hero CTA links to signup', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const cta = page.locator('[data-landing-cta="hero-primary"]')
    await expect(cta).toHaveAttribute('href', '/signup')
  })

  test('nav CTA links to signup', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-landing-cta="nav"]')).toHaveAttribute('href', '/signup')
  })

  test('close CTA links to signup', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-landing-cta="close-primary"]')).toHaveAttribute('href', '/signup')
  })
})

test.describe('Landing — YOUR MOVE transition', () => {
  test('move card transfers from yours to theirs on click', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-section="moves"]').scrollIntoViewIfNeeded()

    // Wait for the auto-demo transfer to finish (mv-sarah moves at ~1.2s)
    await page.waitForTimeout(2600)

    const card = page.locator('[data-move="mv-followup"]')
    await expect(card).toBeAttached()
    await expect(card).toHaveAttribute('data-stack', 'yours')

    await card.locator('[data-move-action]').click()
    await expect(card).toHaveAttribute('data-stack', 'theirs', { timeout: 5000 })
    await expect(card.getByText('Their move')).toBeVisible()
    await expect(card.getByText(/waiting/i)).toBeVisible()
  })

  test('conversation send flips ownership to their move', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-section="conversation"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(2400)

    const send = page.locator('[data-convo-send]')
    await expect(send).toBeVisible()
    await send.click()
    await expect(send).toContainText(/their move/i)
    await expect(page.getByText('YOUR MOVE → THEIR MOVE')).toBeVisible()
  })
})

test.describe('Landing — Studio → Relay sequence', () => {
  test('handoff reaches final state', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-section="studio-relay"]').scrollIntoViewIfNeeded()

    // Sequence: studio in → attention → path draws → dot travels → capture rows
    await expect(page.locator('[data-attention]')).toBeVisible({ timeout: 5000 })

    const captureRows = page.locator('[data-capture-row]')
    await expect(captureRows).toHaveCount(3)
    // All three rows resolve visible
    for (const row of await captureRows.all()) {
      await expect(row).toBeVisible({ timeout: 8000 })
    }

    // The final row is the action
    await expect(page.locator('[data-capture-row="rc-action"]')).toContainText('Reply to Sarah')

    // Dot arrived and dissolved into the capture
    await expect(page.locator('[data-handoff-dot]')).toHaveClass(/is-arrived/)
  })
})

test.describe('Landing — layout integrity', () => {
  for (const vp of [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '1024', width: 1024, height: 768 },
    { name: '768', width: 768, height: 1024 },
    { name: '390', width: 390, height: 844 },
  ]) {
    test(`no horizontal overflow at ${vp.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
      const page = await context.newPage()
      await page.goto('/', { waitUntil: 'networkidle' })
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      await context.close()
    })
  }
})

test.describe('Landing — reduced motion', () => {
  test('final states shown immediately', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)

    // Card visible without waiting for the sequence
    await expect(page.locator('.lg3-dtn').first()).toBeVisible()

    // Nodes at final positions with content visible
    const visibleNodes = await page.evaluate(() =>
      [...document.querySelectorAll('[data-field="hero"] .lg3-node')].filter(
        (n) => parseFloat(getComputedStyle(n).opacity) > 0.1,
      ).length,
    )
    expect(visibleNodes).toBeGreaterThanOrEqual(10)

    // Studio→Relay shows final state on scroll without the sequence
    await page.locator('[data-section="studio-relay"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    for (const row of await page.locator('[data-capture-row]').all()) {
      await expect(row).toBeVisible()
    }

    await context.close()
  })
})

test.describe('Landing — authenticated routes unaffected', () => {
  test('dashboard still routes to the app (login redirect or app shell)', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    // Either the app shell renders or it redirects to /login —
    // but it must never render the landing page.
    expect(page.url()).not.toMatch(/^https?:\/\/[^/]+\/$/)
    await expect(page.locator('.lg3')).toHaveCount(0)
  })

  test('public pages keep the light canvas and old nav', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.public-canvas')).toBeVisible()
    await expect(page.locator('.marketing-nav')).toBeVisible()
    await expect(page.locator('.lg3-nav')).toHaveCount(0)
  })
})
