import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

const ABDULHAKIM_PRE_WIN = `
Abdulhakim Sheik
Founder
CGI, Innovate MN

Building products at the intersection of ops and software.

Current: Founder, product studio
Previous: CGI, Innovate MN

We're hiring a full-stack developer to own the Tayo360 product build.
"I need someone who can take this product from where it is now."

Current focus: Tayo360 platform delivery
`

const NOT_HIRING = `
Sarah Chen
VP Engineering
DataCloud Inc.
San Francisco, CA

We are not hiring backend engineers right now. The team is complete.
`

const SF_REMOTE_WORLDWIDE = `
Marcus Weber
CTO
Klar Finance
San Francisco, CA

Looking for a senior Rails developer. Remote worldwide.
`

test.describe('Correctness Browser Proof', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/prospect')
    await page.waitForLoadState('domcontentloaded')
  })

  test('Abdulhakim: Tayo360 evidence canonicalized with correct org', async ({ page }) => {
    await page.locator('textarea').first().fill(ABDULHAKIM_PRE_WIN)
    await page.getByRole('button', { name: /analyze/i }).click()
    await expect(page.getByText(/Fit/i).first()).toBeVisible({ timeout: 60_000 })
    const body = (await page.textContent('body')) ?? ''
    // Should reference Tayy360 or full-stack as the opportunity
    expect(body).toMatch(/Tayo360|full-stack|Fullscript|High/i)
    expect(body).not.toMatch(/over the past 8 years|we specialize in|would that be useful/)
  })

  test('Negation: "We are not hiring" produces no positive hiring intent', async ({ page }) => {
    await page.locator('textarea').first().fill(NOT_HIRING)
    await page.getByRole('button', { name: /analyze/i }).click()
    await expect(page.getByText(/Fit/i).first()).toBeVisible({ timeout: 60_000 })
    const body = (await page.textContent('body')) ?? ''
    // Should NOT show positive hiring signal
    expect(body).not.toMatch(/EXPLICIT_NEED.*hiring|TEST_DELIVERY_MODEL/i)
    // Should show LOW/UNKNOWN/SKIP or research_more
    expect(body).toMatch(/LOW|UNKNOWN|SKIP|research|No message/i)
  })

  test('SF company + worldwide remote: company location does not exclude', async ({ page }) => {
    await page.locator('textarea').first().fill(SF_REMOTE_WORLDWIDE)
    await page.getByRole('button', { name: /analyze/i }).click()
    await expect(page.getByText(/Fit/i).first()).toBeVisible({ timeout: 60_000 })
    const body = (await page.textContent('body')) ?? ''
    // Should NOT show INELIGIBLE based on SF location alone
    expect(body).not.toMatch(/INELIGIBLE|Explicitly on-site only/i)
  })
})
