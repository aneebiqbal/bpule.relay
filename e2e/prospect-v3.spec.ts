import { test, expect, type Page } from '@playwright/test'
import { loginAsAdmin, loginAsRep } from './helpers'

/**
 * Prospect V3 — the browser contract for the four-view workspace.
 *
 * Selectors follow the real V3 surface: role/label first, `data-testid` only
 * where semantics are insufficient (`prospect-primary-action`, `decision-why`,
 * `sender-section`, `prospect-created`). No legacy "Create lead"/"Save as Lead"
 * text is depended upon.
 */

const FIXTURE = `
Sarah Johnson
VP of Engineering at TechCorp
San Francisco, CA

Experienced engineering leader with 15+ years building high-scale distributed
systems. Previously at Google and Meta. Passionate about developer tools.

Recent post: "We just shipped our new API platform handling 10M requests/day.
Key lessons: start with observability, invest in developer experience early."

Skills: Engineering Leadership, Platform Engineering, Distributed Systems
`.trim()

const TAB_LABELS = ['Analyze', 'Recent', 'Saved', 'Watchlist'] as const

async function openProspect(page: Page) {
  await page.goto('/prospect')
  await expect(page.getByRole('heading', { name: 'Prospects' })).toBeVisible()
  for (const label of TAB_LABELS) {
    await expect(page.getByRole('tab', { name: label, exact: true })).toBeVisible()
  }
}

async function analyzeFixture(page: Page, text: string) {
  await page.locator('textarea').first().fill(text)
  await page.getByRole('button', { name: /^Analyze$/ }).click()
}

test.describe('PROSPECT V3 — Analyze', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('default route renders Analyze with the profile selector', async ({ page }) => {
    await openProspect(page)
    await expect(page.locator('textarea').first()).toBeVisible()
    // Sending identity is part of the Analyze context, never global chrome.
    await expect(page.getByText(/Analyzed for|Working as|Sending as/i).first()).toBeVisible()
  })

  test('result renders a readable hierarchy with one primary action', async ({ page }) => {
    await openProspect(page)
    await analyzeFixture(page, FIXTURE)
    const result = page.locator('[data-testid="decision-why"]')
    await expect(result).toBeVisible({ timeout: 180_000 })
    await expect(page.locator('[data-testid="prospect-primary-action"]')).toBeVisible()
    await expect(page.locator('[data-testid="prospect-primary-action"]')).toBeEnabled()
  })

  test('profile attribution stays visible on the result', async ({ page }) => {
    await openProspect(page)
    await analyzeFixture(page, FIXTURE)
    await expect(page.locator('[data-testid="decision-why"]')).toBeVisible({ timeout: 180_000 })
    await expect(page.locator('[data-testid="sender-section"]')).toBeVisible()
  })

  test('primary action produces an explicit created/confirmation state', async ({ page }) => {
    await openProspect(page)
    await analyzeFixture(page, FIXTURE)
    const action = page.locator('[data-testid="prospect-primary-action"]')
    await expect(action).toBeEnabled({ timeout: 180_000 })
    await action.click()
    // Either the lead is created (Open Lead) or the prospect is saved/dismissed.
    await expect(
      page.locator('[data-testid="prospect-created"], button:has-text("Open Lead")'),
    ).toBeVisible({ timeout: 60_000 })
  })
})

test.describe('PROSPECT V3 — performance', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('initial Analyze triggers no board/message/task/state request', async ({ page }) => {
    const heavy: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (/board|messages|conversation_states|assigned_tasks|activity_events/i.test(url)) heavy.push(url)
    })
    await page.goto('/prospect')
    await expect(page.locator('textarea').first()).toBeVisible()
    await page.waitForTimeout(2500)
    expect(heavy).toEqual([])
  })

  test('the Analyze response contains no lead-board rows', async ({ page }) => {
    await page.goto('/prospect')
    await expect(page.locator('textarea').first()).toBeVisible()
    // Analyze renders the intake form, not the Recent table.
    await expect(page.locator('table')).toHaveCount(0)
  })
})

test.describe('PROSPECT V3 — tabs and URL contract', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

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
    await page.getByRole('tab', { name: 'Recent' }).click()
    await expect(page).toHaveURL(/tab=recent/)
    await page.reload()
    await expect(page).toHaveURL(/tab=recent/)
    await expect(page.getByRole('tab', { name: 'Recent' })).toBeVisible()
  })

  test('back and forward restore the previous view', async ({ page }) => {
    await openProspect(page)
    await page.getByRole('tab', { name: 'Recent' }).click()
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
    await page.getByRole('tab', { name: 'Watchlist' }).click()
    await expect(page).toHaveURL(/tab=watchlist/)
    const watchlistRows = await page.locator('table tbody tr').count()
    await page.getByRole('tab', { name: 'Saved' }).click()
    await expect(page).toHaveURL(/tab=saved/)
    const savedRows = await page.locator('table tbody tr').count()
    expect(savedRows).not.toBe(watchlistRows)
  })
})

test.describe('PROSPECT V3 — responsive', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

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
      // The primary Analyze action must stay reachable.
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
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

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
    await page.getByRole('tab', { name: 'Recent' }).click()
    await expect(page).toHaveURL(/tab=recent/)
    const selected = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('[role="tab"]'))
      return buttons
        .filter((b) => ['Analyze', 'Recent', 'Saved', 'Watchlist'].includes(b.textContent?.trim() ?? ''))
        .map((b) => ({
          label: b.textContent?.trim(),
          ariaCurrent: b.getAttribute('aria-current'),
          ariaSelected: b.getAttribute('aria-selected'),
          dataState: b.getAttribute('data-state'),
        }))
    })
    const recent = selected.find((s) => s.label === 'Recent')
    expect(recent).toBeTruthy()
    const marked =
      recent?.ariaCurrent === 'page' || recent?.ariaSelected === 'true' || recent?.dataState === 'active'
    expect(marked).toBe(true)
  })

  test('result heading hierarchy is intact', async ({ page }) => {
    await openProspect(page)
    await analyzeFixture(page, FIXTURE)
    await expect(page.locator('[data-testid="decision-why"]')).toBeVisible({ timeout: 180_000 })
    const order = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => h.tagName),
    )
    expect(order).toContain('H1')
    expect(order.length).toBeGreaterThanOrEqual(2)
  })
})

test.describe('PROSPECT V3 — roles', () => {
  test('a rep gets the same workspace without admin-only controls', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/prospect')
    await expect(page.locator('textarea').first()).toBeVisible()
    // Admin-only surfaces must not be reachable from the shell.
    await expect(page.getByRole('button', { name: 'Invite Person' })).toHaveCount(0)
  })
})
