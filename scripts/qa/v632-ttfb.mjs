/**
 * V6.3.2 — production TTFB + provider-call isolation (§13).
 *
 * Measures authenticated page timings and asserts no ordinary page load makes a
 * Prospeo/Snov API request. Usage:
 *   node scripts/qa/v632-ttfb.mjs <baseUrl>
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? process.env.RELAY_BASE_URL ?? 'https://bpule-relay.vercel.app'
const EMAIL = process.env.A11Y_ADMIN_EMAIL ?? 'hassan@scout.dev'
const PASSWORD = process.env.A11Y_ADMIN_PASSWORD ?? 'scout-dev-password'
const PAGES = ['/prospect', '/prospect?tab=fresh', '/leads', '/admin/providers', '/admin/health']
const RUNS = 3

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const browser = await chromium.launch({ ignoreHTTPSErrors: true })
const context = await browser.newContext({ ignoreHTTPSErrors: true })
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

const results = {}
for (const path of PAGES) {
  results[path] = []
  for (let i = 0; i < RUNS; i += 1) {
    let providerCalls = 0
    const onRequest = (request) => {
      const url = request.url()
      if (url.includes('api.prospeo.io') || url.includes('api.snov.io')) providerCalls += 1
    }
    page.on('request', onRequest)
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle').catch(() => {})
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      return nav
        ? { ttfb: Math.round(nav.responseStart - nav.startTime), loaded: Math.round(nav.loadEventEnd - nav.startTime) }
        : null
    })
    page.off('request', onRequest)
    results[path].push({ ...timing, providerCalls })
  }
}

await browser.close()

console.log(`base: ${BASE}`)
for (const [path, runs] of Object.entries(results)) {
  const ttfb = median(runs.map((r) => r.ttfb))
  const loaded = median(runs.map((r) => r.loaded))
  const providerCalls = runs.reduce((sum, r) => sum + r.providerCalls, 0)
  console.log(`${path.padEnd(24)} ttfb=${ttfb}ms loaded=${loaded}ms providerCalls=${providerCalls}`)
}
const anyProviderCalls = Object.values(results).some((runs) => runs.some((r) => r.providerCalls > 0))
console.log(anyProviderCalls ? 'FAIL: a page load made a provider API call' : 'PASS: no page load made a provider API call')
process.exit(anyProviderCalls ? 1 : 0)
