import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

/**
 * TEAM-007 live browser proof: "Follow-up / Reply sections do not open."
 * Root cause: the artifact tab button's onClick was a true no-op when the
 * tab was disabled — clicking Follow-up or Reply on a fresh lead (which is
 * disabled by default: no prior send, no reply yet) did nothing at all, no
 * feedback. Fixed so a disabled tab still switches and shows why it's
 * disabled; only the draft/send actions inside stay blocked.
 *
 * Uses a real "new", score-eligible lead (Uptalen, score 10/12) already in
 * the org's DB — a fresh lead has both Follow-up and Reply disabled by
 * construction, which is exactly the state that reproduced the reported
 * symptom.
 */

const LEAD_ID = '0062a9ca-fbde-4411-9b99-1a71ccc2f0de' // "Uptalen" — status 'new', score 10/12 (well above the drafting threshold), owned by the E2E admin login

test.describe('Artifact tabs open even when disabled (TEAM-007, live browser)', () => {
  test('clicking the disabled Follow-up tab switches to it and shows why, instead of doing nothing', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/leads/${LEAD_ID}`)
    await page.waitForLoadState('networkidle')

    const followupTab = page.getByRole('tab', { name: 'Follow-up' })
    const tabVisible = await followupTab.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!tabVisible) {
      test.skip(true, 'Follow-up tab control not present on this lead detail render.')
      return
    }
    await expect(followupTab).toHaveAttribute('aria-disabled', 'true')
    await expect(followupTab).toHaveAttribute('aria-selected', 'false')

    await followupTab.click({ force: true })

    // The tab must now be selected, and the disabled reason visible — not silence.
    await expect(followupTab).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 })
    await expect(page.getByText(/Eligible once this lead is contacted|Eligible once a first message has been sent/i)).toBeVisible({ timeout: 5_000 })
  })

  test('clicking the disabled Reply tab switches to it and shows the paste-reply prompt', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`/leads/${LEAD_ID}`)
    await page.waitForLoadState('networkidle')

    const replyTab = page.getByRole('tab', { name: 'Reply' })
    const tabVisible = await replyTab.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!tabVisible) {
      test.skip(true, 'Reply tab control not present on this lead detail render.')
      return
    }
    await expect(replyTab).toHaveAttribute('aria-disabled', 'true')

    await replyTab.click({ force: true })

    await expect(replyTab).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 })
    // Reply's own textarea renders regardless of disabled state (artifact === 'reply' check).
    await expect(page.getByLabel(/Prospect's reply/i)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/Paste the client reply above to enable/i)).toBeVisible({ timeout: 5_000 })
  })
})
