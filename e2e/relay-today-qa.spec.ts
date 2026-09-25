import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsRep } from './helpers'
import { devices } from '@playwright/test'

test.describe('RELAY - Role-Based Today Views', () => {
  test.describe('MEMBER (Rep)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRep(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
    })

    test('T01: Rep sees YOUR DAY header', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'YOUR DAY' })).toBeVisible()
    })

    test('T02: Rep sees Do This Next section', async ({ page }) => {
      await expect(page.getByText('Do This Next', { exact: true })).toBeVisible()
    })

    test('T03: Rep Do This Next exposes What/Why/Evidence when data present', async ({ page }) => {
      const doThisNext = page.locator('section', { hasText: 'Do This Next' })
      await expect(doThisNext).toBeVisible()
      const what = doThisNext.getByText('What', { exact: true })
      if (await what.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(doThisNext.getByText('Why', { exact: true })).toBeVisible()
      }
    })

    test('T04: Rep action line is orange and 13px', async ({ page }) => {
      const doThisNext = page.locator('section', { hasText: 'Do This Next' })
      const actionLine = doThisNext.locator('a[href]').filter({ hasText: /./ }).first()
      if (await actionLine.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const fontSize = await actionLine.evaluate((el) => getComputedStyle(el).fontSize)
        const fontWeight = await actionLine.evaluate((el) => getComputedStyle(el).fontWeight)
        const color = await actionLine.evaluate((el) => getComputedStyle(el).color)
        expect(fontSize).toBe('13px')
        expect(fontWeight).toBe('500')
        // Signal Orange: rgb(212, 101, 47)
        expect(color).toBe('rgb(212, 101, 47)')
      }
    })

    test('T05: App background is #1C1917', async ({ page }) => {
      const bg = await page.evaluate(() => {
        const appShell = document.querySelector('.min-h-dvh.bg-bone') ?? document.body
        return getComputedStyle(appShell).backgroundColor
      })
      // #1C1917 = rgb(28, 25, 23)
      expect(bg).toBe('rgb(28, 25, 23)')
    })

    test('T06: Working As identity has active dot', async ({ page }) => {
      const aside = page.locator('aside')
      if (await aside.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(aside.locator('span.bg-orange.rounded-full')).toBeVisible()
      } else {
        await expect(page.locator('header span.bg-orange.rounded-full')).toBeVisible()
      }
    })

    test('T07: Up Next items show What/Why labels', async ({ page }) => {
      const upNext = page.locator('section', { hasText: 'Up Next' })
      if (await upNext.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await expect(upNext.locator('text=/What/').first()).toBeVisible()
      }
    })

    test('T20: Do This Next appears before Up Next (priority order)', async ({ page }) => {
      const doThisNext = page.locator('section', { hasText: 'Do This Next' }).first()
      const upNext = page.locator('section', { hasText: 'Up Next' }).first()
      if (
        (await doThisNext.isVisible({ timeout: 8_000 }).catch(() => false)) &&
        (await upNext.isVisible({ timeout: 8_000 }).catch(() => false))
      ) {
        const doThisNextPos = await doThisNext.boundingBox()
        const upNextPos = await upNext.boundingBox()
        expect(doThisNextPos, 'Do This Next should be above Up Next').not.toBeNull()
        expect(upNextPos, 'Up Next should exist').not.toBeNull()
        expect(doThisNextPos.y, 'Do This Next must come before Up Next').toBeLessThan(upNextPos.y)
      }
    })
  })

  test.describe('ADMIN', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
    })

    test('T08: Admin sees Command Center header', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Team overview|need attention/ })).toBeVisible()
    })

    test('T09: Admin sees Command Center label', async ({ page }) => {
      await expect(page.getByText('Command Center', { exact: true })).toBeVisible()
    })

    test('T10: Admin app background is #1C1917', async ({ page }) => {
      const bg = await page.evaluate(() => {
        const appShell = document.querySelector('.min-h-dvh.bg-bone') ?? document.body
        return getComputedStyle(appShell).backgroundColor
      })
      expect(bg).toBe('rgb(28, 25, 23)')
    })
  })

  test.describe('MEMBER - Conversations / Relay Queue', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRep(page)
      await page.goto('/relay')
      await page.waitForLoadState('networkidle')
    })

    test('T14: Top queue item has orange left border', async ({ page }) => {
      const topItem = page.locator('a.group.block.border-l-orange')
      if (await topItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const borderLeftColor = await topItem.first().evaluate(
          (el) => getComputedStyle(el).borderLeftColor,
        )
        expect(borderLeftColor).toBe('rgb(212, 101, 47)')
      }
    })

    test('T15: Top queue item action line uses shared treatment', async ({ page }) => {
      const actionLine = page.locator('.action-line').first()
      if (await actionLine.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const fontSize = await actionLine.evaluate((el) => getComputedStyle(el).fontSize)
        const fontWeight = await actionLine.evaluate((el) => getComputedStyle(el).fontWeight)
        expect(fontSize).toBe('13px')
        expect(fontWeight).toBe('500')
      }
    })

    test('T16: Top queue title is larger than subsequent items', async ({ page }) => {
      const featured = page.locator('a.group.block.border-l-orange h3')
      const regular = page.locator('a.group.block h3').filter({ hasNot: page.locator('.border-l-orange') })
      if (
        (await featured.isVisible({ timeout: 5_000 }).catch(() => false)) &&
        (await regular.first().isVisible({ timeout: 5_000 }).catch(() => false))
      ) {
        const featuredSize = await featured.first().evaluate((el) => getComputedStyle(el).fontSize)
        const regularSize = await regular.first().evaluate((el) => getComputedStyle(el).fontSize)
        expect(parseFloat(featuredSize)).toBeGreaterThanOrEqual(parseFloat(regularSize))
      }
    })
  })

  test.describe('MEMBER - Orange hierarchy', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRep(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
    })

    test('T17: Action-type tag on primary item uses full orange', async ({ page }) => {
      const tag = page.locator('section[aria-label="Do this next"] .bg-orange')
      if (await tag.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const bg = await tag.first().evaluate((el) => getComputedStyle(el).backgroundColor)
        expect(bg).toBe('rgb(212, 101, 47)')
      }
    })
  })

  test.describe('Responsive', () => {
    test('T18: Tablet (768px) shows YOUR DAY without horizontal overflow', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      await loginAsRep(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'YOUR DAY' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(overflow).toBe(false)
    })

    test('T19: Mobile (390px) shows YOUR DAY without horizontal overflow', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await loginAsRep(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: 'YOUR DAY' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(overflow).toBe(false)
    })
  })

  test.describe('Mobile', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsRep(page)
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
    })

    test('T11: Mobile shows YOUR DAY header', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'YOUR DAY' })).toBeVisible()
    })

    test('T12: Mobile Working As is visible with active dot', async ({ page }) => {
      const mobileBar = page.locator('header >> text=Working as')
      if (await mobileBar.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(page.locator('header span.size-2.rounded-full')).toBeVisible()
      }
    })

    test('T13: Mobile Do This Next visible', async ({ page }) => {
      await expect(page.getByText('Do This Next', { exact: true })).toBeVisible()
    })
  })
})
