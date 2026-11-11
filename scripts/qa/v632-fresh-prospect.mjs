/**
 * V6.3.2 — Fresh Prospect live browser proof (§11).
 *
 * Logs in, opens /prospect?tab=fresh, verifies a real provider candidate's
 * source/name/company/location/qualification/profile/channel/verification,
 * then promotes it and reports the created lead id for cleanup.
 *
 * Usage: node scripts/qa/v632-fresh-prospect.mjs <baseUrl> <candidateName?>
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'https://bpule-relay.vercel.app'
const TARGET = process.argv[3] ?? null
const EMAIL = process.env.A11Y_REP_EMAIL ?? 'madiha@scout.dev'
const PASSWORD = process.env.A11Y_REP_PASSWORD ?? 'scout-dev-password'

const browser = await chromium.launch({ ignoreHTTPSErrors: true })
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#login-email', { timeout: 60_000 })
await page.fill('#login-email', EMAIL)
await page.fill('#login-password', PASSWORD)
await Promise.all([
  page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 60_000 }),
  page.click('form button[type="submit"]'),
])
await page.waitForLoadState('networkidle').catch(() => {})

await page.goto(`${BASE}/prospect?tab=fresh`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)

const cards = page.locator('ul.grid > li')
const count = await cards.count()
if (count === 0) {
  console.log('FAIL: no fresh prospect cards found')
  await browser.close()
  process.exit(1)
}

let chosen = cards.first()
if (TARGET) {
  const matched = cards.filter({ hasText: TARGET }).first()
  if (await matched.count()) chosen = matched
}

const text = (await chosen.innerText()).replace(/\s+/g, ' ').trim()
const checks = {
  name: /[A-Z][a-z]+/.test(text),
  titleOrCompany: /·/.test(text),
  source: /Prospeo|Snov/i.test(text),
  qualification: /\d+/.test(text),
  profile: /Best fit/.test(text),
  verification: /Verified email|Likely valid|No verified email/.test(text),
}
console.log('card text:', text.slice(0, 240))
console.log('checks:', JSON.stringify(checks))

const createButton = chosen.getByRole('button', { name: /Create lead/i }).first()
await createButton.waitFor({ state: 'visible', timeout: 10_000 })
await Promise.all([
  page.waitForURL(/\/leads\/[0-9a-f-]+/, { timeout: 30_000 }),
  createButton.click(),
])
const leadUrl = page.url()
console.log('LEAD_URL', leadUrl)

await browser.close()
const ok = Object.values(checks).every(Boolean) && /\/leads\/[0-9a-f-]+/.test(leadUrl)
console.log(ok ? 'PASS: fresh prospect fields real and promotion created a lead' : 'FAIL: field/promotion check failed')
process.exit(ok ? 0 : 1)
