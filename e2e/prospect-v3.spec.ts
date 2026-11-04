import { test, expect, type Page } from '@playwright/test'

/**
 * Prospect V3 — browser contract for the four-view workspace.
 *
 * The session comes from globalSetup via storageState (one sign-in per role);
 * this file never logs in. Selectors follow the real V3 surface: role/label
 * first, `data-testid` only where semantics are insufficient
 * (`prospect-primary-action`, `decision-why`, `sender-section`,
 * `prospect-created`). No legacy "Create lead"/"Save as Lead" text is depended
 * upon.
 *
 *   E2E_BASE_URL=https://localhost:3000 npx playwright test -c playwright.prospect-v3.config.ts
 */

const RUN = Date.now().toString(36).slice(-5)

/** A controlled buyer signal — the classifier needs a real commercial intent. */
const FIXTURE = `Maya Lindqvist ${RUN}
Head of Product at Northwind Freight ${RUN} | Stockholm, Sweden
500+ connections · 1st · Message
About
We run a logistics SaaS for mid-size freight forwarders.
Posts
Maya Lindqvist ${RUN} posted this • 3d
We are looking for a development agency to rebuild our customer portal in React and Node. Budget around 60k EUR, need to start within 6 weeks. DM me or email maya@northwindfreight.example`

const TAB_LABELS = ['Analyze', 'Recent', 'Saved', 'Watchlist'] as const

async function openProspect(page: Page) {
  await page.goto('/prospect')
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await expect(page.getByRole('heading', { name: 'Prospects' })).toBeVisible()
  for (const label of TAB_LABELS) {
    await expect(page.getByRole('tab', { name: label, exact: true })).toBeVisible()
  }
  // Wait until React has attached handlers: the submit control is live.
  await expect(page.getByRole('button', { name: /^Analyze$/ })).toBeEnabled()
}

async function analyzeFixture(page: Page, text: string) {
  await page.locator('textarea').first().fill(text)
  await page.getByRole('button', { name: /^Analyze$/ }).click()
}

/**
 * Analyze until the decision panel appears.
 *
 * The classifier occasionally returns `inputStatus: "not_prospect"` for the same
 * synthetic profile (observed across runs), which renders the qualification
 * message instead of a result. That is classifier variance, not a UI regression,
 * so the contract retries once before failing.
 */
async function analyzeForResult(page: Page, text: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await analyzeFixture(page, text)
    const appeared = await page
      .locator('[data-testid="decision-why"]')
      .waitFor({ timeout: 90_000 })
      .then(() => true)
      .catch(() => false)
    if (appeared) return
  }
  throw new Error("analysis produced no decision panel after two attempts")
}

test.describe('PROSPECT V3 — Analyze', () => {
  test('default route renders Analyze with the profile selector', async ({ page }) => {
    await openProspect(page)
    await expect(page.locator('textarea').first()).toBeVisible()
    // Sending identity is part of the Analyze context, never global chrome.
    await expect(page.getByText(/Analyzed for|Working as|Sending as/i).first()).toBeVisible()
  })

  test('result renders a readable hierarchy with one primary action', async ({ page }) => {
    test.setTimeout(360_000)
    await openProspect(page)
    await analyzeForResult(page, FIXTURE)
    await expect(page.locator('[data-testid="prospect-primary-action"]')).toBeVisible()
    await expect(page.locator('[data-testid="prospect-primary-action"]')).toBeEnabled()
  })

  test('profile attribution stays visible on the result', async ({ page }) => {
    test.setTimeout(360_000)
    await openProspect(page)
    await analyzeForResult(page, FIXTURE)
    await expect(page.locator('[data-testid="sender-section"]')).toBeVisible()
  })

  test('primary action produces an explicit created/confirmation state', async ({ page }) => {
    test.setTimeout(360_000)
    await openProspect(page)
    await analyzeFixture(page, FIXTURE)
    const action = page.locator('[data-testid="prospect-primary-action"]')
    await expect(action).toBeEnabled({ timeout: 180_000 })
    await action.click()
    await expect(page.locator('[data-testid="prospect-created"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Open Lead' })).toBeVisible()
  })
})

test.describe('PROSPECT V3 — performance', () => {
  test('initial Analyze triggers no board/message/task/state request', async ({ page }) => {
    const heavy: string[] = []
    page.on('request', (req) => {
      if (/board|messages|conversation_states|assigned_tasks|activity_events/i.test(req.url())) {
        heavy.push(req.url())
      }
    })
    await page.goto('/prospect')
    await expect(page.locator('textarea').first()).toBeVisible()
    await page.waitForTimeout(2500)
    expect(heavy).toEqual([])
  })

  test('the Analyze response contains no lead-board rows', async ({ page }) => {
    await page.goto('/prospect')
    await expect(page.locator('textarea').first()).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
  })
})

test.describe('PROSPECT V3 — tabs and URL contract', () => {
  test('each tab is reachable and updates the URL', async ({ page }) => {
    await openProspect(page)
    for (const [label, tab] of [['Recent', 'recent'], ['Saved', 'saved'], ['Watchlist', 'watchlist']] as const) {
      await page.getByRole('tab', { name: label, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`[?&]tab=${tab}`))
      await expect(page.locator('table').first()).toBeVisible()
    }
  })

  test('refresh preserves the active tab', async ({ page }) => {
    await openProspect(page)
    await page.getByRole('tab', { name: 'Recent', exact: true }).click()
    await expect(page).toHaveURL(/tab=recent/)
    await page.reload()
    await expect(page).toHaveURL(/tab=recent/)
    await expect(page.getByRole('tab', { name: 'Recent' })).toBeVisible()
  })

  test('back and forward restore the previous view', async ({ page }) => {
    await openProspect(page)
    await page.getByRole('tab', { name: 'Recent', exact: true }).click()
    await expect(page).toHaveURL(/tab=recent/)
    await page.goBack()
    await expect(page).toHaveURL(/\/prospect$/)
    await page.goForward()
    await expect(page).toHaveURL(/tab=recent/)
  })

  test('an invalid tab falls back safely to Analyze', async ({ page }) => {
    await page.goto('/prospect?tab=bogus')
    await expect(page.locator('textarea').first()).toBeVisible()
  })

  test('tabs do not contaminate each other', async ({ page }) => {
    await openProspect(page)
    await page.getByRole('tab', { name: 'Watchlist', exact: true }).click()
    await expect(page).toHaveURL(/tab=watchlist/)
    await expect(page.locator('table').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Saved', exact: true }).click()
    await expect(page).toHaveURL(/tab=saved/)
    await expect(page.locator('table').first()).toBeVisible()
  })
})

test.describe('PROSPECT V3 — responsive', () => {
  for (const vp of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }, { w: 768, h: 1024 }, { w: 375, h: 812 }]) {
    test(`no horizontal overflow and usable CTA at ${vp.w}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await page.goto('/prospect')
      await expect(page.locator('textarea').first()).toBeVisible()
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
      await expect(page.getByRole('button', { name: /^Analyze$/ })).toBeVisible()
      for (const label of TAB_LABELS) {
        await expect(page.getByRole('tab', { name: label, exact: true })).toBeVisible()
      }
    })
  }

  test('at 375 the intake form is not squeezed into a desktop table', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/prospect')
    await expect(page.locator('textarea').first()).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
  })
})

test.describe('PROSPECT V3 — accessibility', () => {
  test('Analyze form controls are labelled', async ({ page }) => {
    await openProspect(page)
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeEditable()
    const labelled =
      (await textarea.getAttribute('aria-label')) ||
      (await textarea.getAttribute('aria-labelledby')) ||
      (await textarea.getAttribute('placeholder'))
    expect(labelled).toBeTruthy()
    await expect(page.getByRole('button', { name: /^Analyze$/ })).toBeEnabled()
  })

  test('tabs expose selected semantics', async ({ page }) => {
    await openProspect(page)
    await page.getByRole('tab', { name: 'Recent', exact: true }).click()
    await expect(page).toHaveURL(/tab=recent/)
    const selected = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role="tab"]'))
        .filter((b) => ['Analyze', 'Recent', 'Saved', 'Watchlist'].includes(b.textContent?.trim() ?? ''))
        .map((b) => ({
          label: b.textContent?.trim(),
          ariaCurrent: b.getAttribute('aria-current'),
          ariaSelected: b.getAttribute('aria-selected'),
          dataState: b.getAttribute('data-state'),
        })),
    )
    const recent = selected.find((s) => s.label === 'Recent')
    expect(recent).toBeTruthy()
    expect(
      recent?.ariaCurrent === 'page' || recent?.ariaSelected === 'true' || recent?.dataState === 'active',
    ).toBe(true)
  })

  test('result heading hierarchy is intact', async ({ page }) => {
    test.setTimeout(360_000)
    await openProspect(page)
    await analyzeForResult(page, FIXTURE)
    const order = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => h.tagName),
    )
    expect(order).toContain('H1')
    expect(order.length).toBeGreaterThanOrEqual(2)
  })
})
