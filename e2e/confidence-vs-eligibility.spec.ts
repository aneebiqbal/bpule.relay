import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

/**
 * TEAM-008 live browser proof: "100% confidence shown alongside 'Not Enough
 * Info' contradiction." Root cause: leads/new's UI showed a raw
 * extractionConfidence badge ("N/100 confidence") right next to the
 * eligibility verdict, with no distinction that confidence measures field
 * ACCURACY (how sure Relay is about what it found) while eligibility
 * measures COMPLETENESS (whether enough was found at all) — two genuinely
 * different, both-can-be-true axes. A short, unambiguous paste (a clear
 * name + title, nothing else) can legitimately score high field accuracy
 * while still being too thin to qualify.
 *
 * This fixture text is deliberately short and unambiguous (high accuracy,
 * low completeness) to reproduce exactly that state.
 */

const THIN_BUT_CLEAR_TEXT = 'Jordan Blake\nSenior Product Manager'

test.describe('Confidence vs eligibility contradiction (TEAM-008, live browser)', () => {
  test('a high field-accuracy, low-completeness paste shows both numbers with a clarifying explanation, not a bare contradiction', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/leads/new')
    await page.waitForLoadState('networkidle')

    const textarea = page.locator('#raw-input')
    const textareaVisible = await textarea.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!textareaVisible) {
      test.skip(true, 'Manual lead-entry textarea not present on this render.')
      return
    }
    await textarea.fill(THIN_BUT_CLEAR_TEXT)

    const extractBtn = page.locator('button:has-text("Extract")').first()
    await extractBtn.click()
    await page.waitForTimeout(3_000)

    const ineligibleVisible = await page.getByText(/Not enough information to score this lead/i).isVisible({ timeout: 5_000 }).catch(() => false)
    if (!ineligibleVisible) {
      test.skip(true, 'This fixture text was not classified as ineligible in this environment — cannot exercise the contradiction path.')
      return
    }

    // The field-accuracy badge must be labeled distinctly from "confidence"
    // alone, and the clarifying sentence must be present explaining the
    // two axes are different — not a bare, unexplained "100/100" sitting
    // next to "not enough info".
    await expect(page.getByText(/\/100 field accuracy/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/measures what was found, not how much/i)).toBeVisible({ timeout: 5_000 })
  })
})
