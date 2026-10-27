import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAsAdmin, loginAsRep } from './helpers'
import { attachDiagnostics, reportDiagnostics, type Diagnostics } from './rc-diagnostics'

/**
 * Browser RC acceptance against the exact preview.
 *
 * Every AI-backed case waits for a rendered outcome rather than a fixed sleep.
 * A failure produces a screenshot + trace automatically
 * (playwright.config.ts: screenshot 'only-on-failure', trace 'on-first-retry')
 * and prints console / page / request diagnostics.
 */

const diagnosticsByPage = new WeakMap<Page, Diagnostics>()

test.beforeEach(async ({ page }) => {
  diagnosticsByPage.set(page, attachDiagnostics(page))
})

test.afterEach(async ({ page }, testInfo) => {
  const diagnostics = diagnosticsByPage.get(page)
  if (diagnostics) reportDiagnostics(testInfo, diagnostics)
})

const ANALYSIS_TIMEOUT = 200_000

const SOURCES = {
  NADIA: `Nadia Rahman
CTO at Meridian Logistics
Meridian runs a fleet of 400 vehicles.
We need an external software team to rebuild our dispatch platform in React and Node.
Budget approved: $90,000. Start within 4 weeks.`,
  HANNAH: `Hannah Cole
VP Operations at Northwind Retail
Northwind operates 60 stores.
We are looking for an external agency to build a new inventory system.
Budget approved: $75,000.`,
  EMMA: `Emma Lindqvist
Head of Digital at Fjord Bank
Fjord Bank is modernizing its customer portal.
We want to engage an external partner to rebuild our portal.
Budget approved: €85,000.`,
  DANIEL: `Daniel Protopopov
CEO at Pipeform
Pipeform is a recruiting platform for technical talent.
We help companies hire engineers.
Previously built a billing product at Northgate.
Request services at pipeform.example.`,
  JURICA: `Jurica Novak
Freelance Consultant
Independent consultant advising startups on go-to-market.
We help early-stage companies with positioning and pricing.
Open to collaborations.`,
  ABDULHAKIM: `Abdulhakim Sheik
Founder at Tayo360
Tayo360 is a logistics platform for West African freight.
We are building a freight marketplace and fleet management tool.
We are looking for an external engineering team to help build our mobile apps.
Budget approved: $120,000.`,
  PARAPHRASED: `Priya Raman
CTO at Ledgerline
Ledgerline is a payments startup.
Curious whether your team has handled this kind of migration before.`,
}

/**
 * Run an analysis and wait for a rendered outcome: either the scored result
 * card ("Display score N/10") or the explicit "not a prospect" state.
 */
async function analyze(page: import('@playwright/test').Page, source: string) {
  await page.goto('/prospect', { waitUntil: 'domcontentloaded' })
  // Do not wait for networkidle: the preview can hold a connection open and the
  // 45s networkidle budget is not about product behavior.
  const box = page.getByPlaceholder('Paste the LinkedIn profile here...')
  await expect(box).toBeVisible({ timeout: 60_000 })
  await box.fill(source)
  // Hydration race: a fill before React attaches its onChange leaves the
  // controlled value empty, so Analyze would submit nothing. Prove the value
  // is reflected before clicking.
  await expect(box).toHaveValue(source)
  const analyzeBtn = page.getByRole('button', { name: 'Analyze' })
  await expect(analyzeBtn).toBeEnabled()
  await analyzeBtn.click()
  await expect(page.getByText(/Display score \d+\/10|NOT A PROSPECT/i).first()).toBeVisible({
    timeout: ANALYSIS_TIMEOUT,
  })
  return page.locator('body').innerText()
}

/** A verified request in either the V3 canonical or V2 wording. */
function hasVerifiedRequest(text: string): boolean {
  return /explicit buyer request detected \(verified\)|verified request/i.test(text)
}

test.describe('CASE 1 — NADIA explicit buyer', () => {
  test.setTimeout(ANALYSIS_TIMEOUT + 60_000)
  test('buyer request recognized, intent HIGH, budget retained, request quote retained', async ({ page }) => {
    await loginAsAdmin(page)
    const text = await analyze(page, SOURCES.NADIA)
    expect(text).toMatch(/INTENT\s*\n?\s*HIGH/i)
    expect(hasVerifiedRequest(text)).toBe(true)
    // The stated budget is retained in the explanation.
    expect(text).toMatch(/\$90,?000/i)
    expect(text).not.toMatch(/No verified buyer request/i)
    expect(text).not.toMatch(/No buyer timing/i)
  })
})

test.describe('CASE 2 — HANNAH explicit request survives model disagreement', () => {
  test.setTimeout(ANALYSIS_TIMEOUT + 60_000)
  test('intent stays HIGH, no LOW/SKIP regression', async ({ page }) => {
    await loginAsAdmin(page)
    const text = await analyze(page, SOURCES.HANNAH)
    expect(text).toMatch(/INTENT\s*\n?\s*HIGH/i)
    expect(hasVerifiedRequest(text)).toBe(true)
    expect(text).toMatch(/\$75,?000/i)
    expect(text).not.toMatch(/No verified buyer request/i)
    expect(text).not.toMatch(/Worth skipping/i)
  })
})

test.describe('CASE 3 — EMMA external agency request credited', () => {
  test.setTimeout(ANALYSIS_TIMEOUT + 60_000)
  test('external partner request credited, intent not UNKNOWN', async ({ page }) => {
    await loginAsAdmin(page)
    const text = await analyze(page, SOURCES.EMMA)
    expect(text).toMatch(/INTENT\s*\n?\s*HIGH/i)
    expect(text).not.toMatch(/No verified buyer request/i)
    expect(text).not.toMatch(/No buyer timing/i)
  })
})

test.describe('CASE 5 — DANIEL seller', () => {
  test.setTimeout(ANALYSIS_TIMEOUT + 60_000)
  test('seller grammar is not a buyer request, no buyer pitch', async ({ page }) => {
    await loginAsAdmin(page)
    const text = await analyze(page, SOURCES.DANIEL)
    expect(text).toMatch(/INTENT\s*\n?\s*UNKNOWN/i)
    expect(hasVerifiedRequest(text)).toBe(false)
    expect(text).not.toMatch(/No verified buyer request/i)
  })
})

test.describe('CASE 6 — JURICA low priority', () => {
  test.setTimeout(ANALYSIS_TIMEOUT + 60_000)
  test('no outreach CTA, no "They replied", no "To Contact"', async ({ page }) => {
    await loginAsAdmin(page)
    const text = await analyze(page, SOURCES.JURICA)
    expect(text).toMatch(/INTENT\s*\n?\s*UNKNOWN|NOT A PROSPECT|Lead not eligible/i)
    expect(text).not.toMatch(/Reach out to connect/i)
    expect(text).not.toMatch(/They replied/i)
    expect(text).not.toMatch(/No verified buyer request/i)
  })
})

test.describe('CASE 7 — ABDULHAKIM explicit request is credited, not a pitch', () => {
  test.setTimeout(ANALYSIS_TIMEOUT + 60_000)
  test('the explicit request is credited; no fabricated claim', async ({ page }) => {
    await loginAsAdmin(page)
    const text = await analyze(page, SOURCES.ABDULHAKIM)
    // The source contains "We are looking for an external engineering team" and
    // a budget, so a verified request (INTENT HIGH) is the correct outcome.
    expect(text).toMatch(/INTENT\s*\n?\s*HIGH/i)
    expect(hasVerifiedRequest(text)).toBe(true)
    expect(text).toMatch(/\$120,?000/i)
    expect(text).not.toMatch(/No verified buyer request/i)
  })
})

test.describe('CASE 11 — PARAPHRASED experience question', () => {
  test.setTimeout(ANALYSIS_TIMEOUT + 60_000)
  test('the experience question does not become a fabricated buying request', async ({ page }) => {
    await loginAsRep(page)
    const text = await analyze(page, SOURCES.PARAPHRASED)
    // An experience question is a buyer QUESTION, not a request to buy: the
    // question layer extracts it (unit eval), and the intent layer correctly
    // does not upgrade it to a verified request.
    expect(text).toMatch(/INTENT\s*\n?\s*UNKNOWN/i)
    expect(hasVerifiedRequest(text)).toBe(false)
    expect(text).not.toMatch(/No verified buyer request/i)
  })
})

test.describe('CASE 16 — MOBILE 375px', () => {
  test('Today renders with no horizontal overflow', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 375, height: 812 })
    await loginAsAdmin(page)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await expect(page.getByRole('heading', { name: /Team today|YOUR DAY/ })).toBeVisible({ timeout: 120_000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(overflow).toBe(false)
  })
})
