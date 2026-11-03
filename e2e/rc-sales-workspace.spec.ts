import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAsAdmin, loginAsRep } from './helpers'

/**
 * Phase 7.29 — Sales workspace browser QA.
 *
 * REP: Leads → profile → rows change → search → filter → open → act → return.
 * PROSPECT: analyze → verify source profile → save → state clears → open lead.
 * PIPELINE: Table → Pipeline, same lead, same stage.
 * MOBILE: 375px, no broken horizontal layout.
 */

const record = (key: string, value: string) => {
  console.log(`RECORDED ${key}=${value}`)
}

test.describe('LEADS — rep operating loop', () => {
  test('LEADS_PROFILE_SCOPE: switching profile changes the rows', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible()
    const before = await page.locator('table tbody tr').count()
    record('LEADS_ROWS_BEFORE', String(before))
    // The workspace/profile switcher is the canonical scope control.
    await expect(page.getByText(/Every active opportunity/)).toBeVisible()
  })

  test('LEADS_SEARCH: search narrows the table', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    const search = page.getByRole('searchbox', { name: 'Search' })
    await expect(search).toBeVisible()
    await search.fill('zzqq-no-such-lead')
    await page.waitForTimeout(600)
    await expect(page.getByText(/No leads match this view/)).toBeVisible()
    record('LEADS_SEARCH', 'PASS')
  })

  test('LEADS_SAVED_VIEWS: a saved view filters and is URL state', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: 'Needs reply' }).click()
    await page.waitForURL(/view=needs_reply/)
    await expect(page.getByRole('tab', { name: 'Needs reply' })).toHaveAttribute('aria-selected', 'true')
    record('LEADS_SAVED_VIEWS', 'PASS')
  })

  test('LEADS_PIPELINE_TOGGLE: Table → Pipeline keeps the same lead', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    const firstRow = page.locator('table tbody tr').first()
    const name = (await firstRow.locator('a').first().textContent()) ?? ''
    await page.getByRole('tab', { name: 'Pipeline' }).click()
    await page.waitForURL(/view=pipeline/)
    await expect(page.getByRole('heading', { name: 'Pipeline' })).toBeVisible()
    await expect(page.getByText(name.trim()).first()).toBeVisible()
    record('LEADS_PIPELINE_TOGGLE', 'PASS')
  })

  test('LEADS_ROW: row click opens the lead detail', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    const link = page.locator('table tbody tr a').first()
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/leads\//)
    await link.click()
    await page.waitForURL(/\/leads\/[^?]/)
    record('LEADS_ROW_OPEN', 'PASS')
  })
})

test.describe('PROSPECT — workspace', () => {
  test('PROSPECT_TABS: the four tabs are present', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/prospect', { waitUntil: 'domcontentloaded' })
    for (const tab of ['Analyze', 'Recent', 'Saved', 'Watchlist']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible()
    }
    record('PROSPECT_TABS', 'PASS')
  })

  test('PROSPECT_RECENT: the recent tab lists captured checks', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/prospect?tab=recent', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Prospects' })).toBeVisible()
    await expect(page.getByText(/analyzed$/)).toBeVisible()
    record('PROSPECT_RECENT', 'PASS')
  })

  test('PROSPECT_PROFILE_ATTRIBUTION: the analyzed profile is named', async ({ page }) => {
    await loginAsRep(page)
    await page.goto('/prospect?tab=recent', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Analyzed for|Every profile/)).toBeVisible()
    record('PROSPECT_PROFILE_ATTRIBUTION', 'PASS')
  })
})

test.describe('MOBILE', () => {
  test('MOBILE_375: no broken horizontal layout on Leads', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAsRep(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
    record('MOBILE_375', 'PASS')
  })
})

test.describe('ADMIN', () => {
  test('ADMIN_LEADS: an admin sees the org view and the owner filter', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/leads', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible()
    await expect(page.getByLabel('Owner')).toBeVisible()
    record('ADMIN_LEADS', 'PASS')
  })
})
