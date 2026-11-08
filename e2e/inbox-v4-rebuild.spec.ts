import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import axeCore from 'axe-core'

/**
 * Inbox V4 rebuild certification on the deterministic fixture.
 *
 * No auth, no database, no writes. Run with:
 *   INBOX_FIXTURE_E2E=1 E2E_BASE_URL=http://localhost:3939 npx playwright test e2e/inbox-v4-rebuild.spec.ts
 *
 * Covers: 10-second comprehension, 0 horizontal overflow at 1440/1280/1024/768/375,
 * axe critical/serious, collapsed AI reasoning / notes / history, and the mobile
 * queue → thread → details flow.
 */

test.skip(process.env.INBOX_FIXTURE_E2E !== '1', 'Deterministic fixture run only (set INBOX_FIXTURE_E2E=1).')

const WIDTHS = [1440, 1280, 1024, 768, 375]
const OUT = path.resolve('test-results/inbox-v4-rebuild')
const SHOTS = path.join(OUT, 'screenshots')

async function axe(page: Page) {
  await page.addScriptTag({ content: axeCore.source })
  return page.evaluate(async () => {
    // @ts-expect-error injected axe
    const r = await window.axe.run(document, { resultTypes: ['violations'] })
    const v = r.violations as Array<{ id: string; impact: string; nodes?: Array<{ target?: string[] }> }>
    return {
      critical: v.filter((x) => x.impact === 'critical').length,
      serious: v.filter((x) => x.impact === 'serious').length,
      rules: v
        .filter((x) => x.impact === 'critical' || x.impact === 'serious')
        .map(
          (x) =>
            `${x.impact}:${x.id}:${(x.nodes ?? [])
              .flatMap((n) => n.target ?? [])
              .slice(0, 2)
              .join(' ')}`,
        ),
    }
  })
}

test.describe('INBOX_V4_REBUILD', () => {
  for (const width of WIDTHS) {
    test(`fixture @${width}: 0 overflow, axe clean, comprehension`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(e.message))
      await page.setViewportSize({ width, height: width <= 768 ? 900 : 1000 })
      await page.goto('/inbox-fixture', { waitUntil: 'networkidle' })
      await expect(page.getByLabel('Conversation queue')).toBeVisible()
      // Mobile is list-first; open the first conversation before asserting the
      // thread comprehension. Desktop auto-selects.
      if (width < 768) {
        await page.locator('[aria-label="Conversations"] button').first().click()
      }
      await expect(page.getByText('Why this needs attention')).toBeVisible()

      const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect.soft(overflowPx, `overflow @${width}`).toBeLessThanOrEqual(1)

      const result = await axe(page)
      expect.soft(result.critical, `axe critical @${width}: ${result.rules.join(', ')}`).toBe(0)
      expect.soft(result.serious, `axe serious @${width}: ${result.rules.join(', ')}`).toBe(0)

      const text = await page.locator('body').innerText()
      // 10-second comprehension: who, where from, sending as, why.
      for (const needle of ['Sarah Chen', 'LinkedIn', 'Waiting on rep', 'WHY THIS NEEDS ATTENTION']) {
        expect.soft(text, `comprehension @${width}: ${needle}`).toContain(needle)
      }
      // Collapsed by default: the rationale body is not on screen.
      expect.soft(text.includes('Goal:'), `AI reasoning exposed @${width}`).toBe(false)
      // The context pane is a drawer below xl; only assert its sections there.
      if (width >= 1280) {
        for (const needle of ['Next action', 'Internal notes', 'Lead history']) {
          expect.soft(text, `context comprehension @${width}: ${needle}`).toContain(needle)
        }
      }

      fs.mkdirSync(SHOTS, { recursive: true })
      await page.screenshot({ path: path.join(SHOTS, `inbox-fixture-${width}.png`), fullPage: true })
      expect.soft(pageErrors, `uncaught errors @${width}`).toEqual([])
    })
  }

  test('mobile: queue → thread → details drawer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/inbox-fixture', { waitUntil: 'networkidle' })

    // List-first: the queue is visible, the thread is not.
    await expect(page.getByLabel('Conversation queue')).toBeVisible()
    await expect(page.getByLabel('Thread')).toBeHidden()

    await page.locator('[aria-label="Conversations"] button').first().click()
    await expect(page.getByLabel('Thread')).toBeVisible()
    await expect(page.getByLabel('Conversation queue')).toBeHidden()
    await expect(page.getByText('Why this needs attention')).toBeVisible()

    // Context lives behind Details.
    const details = page.getByRole('button', { name: 'Details' })
    await expect(details).toBeVisible()
    await details.click()
    const drawer = page.getByRole('dialog', { name: 'Lead context' })
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText('Related work')).toBeVisible()
  })

  test('desktop: context pane is visible, Details is not', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/inbox-fixture', { waitUntil: 'networkidle' })
    await expect(page.getByLabel('Lead context')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Details' })).toBeHidden()
  })
})
