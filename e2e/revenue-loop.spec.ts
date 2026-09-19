import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

const HIRING_PROFILE = `
Abdulhakim Ali
Founder at Northstar
Lahore, Pakistan

Building Northstar, a B2B operations product.

We're hiring a full-stack engineer this month to own the product build.
"We are hiring a full-stack engineer — need someone who can take the product from here."

Current: Founder, Northstar
`

const THIN_FOUNDER = `
Sam Patel
Founder
Quiet Labs
`

const LOGIN_GARBAGE = `
Sign in
Email
Password
Forgot password
Log in to your account
`

test.describe('Revenue loop browser QA', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/prospect')
    await page.waitForLoadState('domcontentloaded')
  })

  test('FLOW E: login/UI garbage fails immediately without a message', async ({ page }) => {
    const started = Date.now()
    await page.locator('textarea').first().fill(LOGIN_GARBAGE)
    await page.getByRole('button', { name: /analyze/i }).click()
    await expect(page.getByText(/login|product page|not a prospect|no message/i).first()).toBeVisible({ timeout: 15_000 })
    const elapsed = Date.now() - started
    expect(elapsed).toBeLessThan(12_000)
    await expect(page.getByText(/saw your post|would love to connect/i)).toHaveCount(0)
  })

  test('FLOW B: thin founder does not invent intent or force a message', async ({ page }) => {
    await page.locator('textarea').first().fill(THIN_FOUNDER)
    await page.getByRole('button', { name: /analyze/i }).click()
    await expect(page.getByText(/fit/i).first()).toBeVisible({ timeout: 45_000 })
    const body = (await page.textContent('body')) ?? ''
    expect(body).toMatch(/UNKNOWN|RESEARCH_MORE|CONNECT_OR_OBSERVE|No message|not enough/i)
    expect(body).not.toMatch(/I can write a quick analysis/i)
  })

  test('FLOW A: explicit hiring shows contact decision and a short note when recommended', async ({ page }) => {
    await page.locator('textarea').first().fill(HIRING_PROFILE)
    await page.getByRole('button', { name: /analyze/i }).click()
    await expect(page.getByText(/Fit/i).first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText(/Intent/i).first()).toBeVisible()
    await expect(page.getByText(/Confidence/i).first()).toBeVisible()
    const body = (await page.textContent('body')) ?? ''
    expect(body).toMatch(/CONTACT_NOW|EXPLICIT_NEED|hiring|High/i)
    expect(body).not.toMatch(/over the past 8 years|we specialize in|would that be useful/i)
  })
})
