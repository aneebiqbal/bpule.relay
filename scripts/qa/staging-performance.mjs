/**
 * Authenticated staging performance sample (local PostgreSQL, single user).
 *
 *   node scripts/qa/staging-performance.mjs [base]
 *
 * Reports client-observed navigation latency p50/p95 per route. This is NOT a
 * production benchmark; production/VPS performance remains unverified.
 */
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:3000'
const PASSWORD = 'staging-password-1'
const ROUTES = ['/dashboard', '/chats', '/tasks', '/leads', '/prospect', '/jobs', '/admin/targets', '/team', '/settings']
const ROLES = { OWNER: 'owner.stg@org-a.test', ADMIN: 'admin.stg@org-a.test', MANAGER: 'manager.stg@org-a.test' }
const SAMPLES = 5

const percentiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  return { p50: Math.round(pick(0.5)), p95: Math.round(pick(0.95)) }
}

const browser = await chromium.launch()
const results = {}
for (const [role, email] of Object.entries(ROLES)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email')
  await page.waitForTimeout(600)
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASSWORD)
  await page.waitForFunction(() => { const b = document.querySelector('button.auth-submit'); return b && !b.hasAttribute('disabled') }, null, { timeout: 15_000 })
  await page.locator('button.auth-submit').click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })

  results[role] = {}
  for (const path of ROUTES) {
    const samples = []
    for (let i = 0; i < SAMPLES; i += 1) {
      const started = Date.now()
      const res = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      const ttfb = Date.now() - started
      samples.push(ttfb)
      if (!res || res.status() >= 500) samples.push(-1)
      await page.waitForTimeout(120)
    }
    results[role][path] = { ...percentiles(samples), n: samples.length }
    console.log(`${role.padEnd(7)} ${path.padEnd(20)} p50=${results[role][path].p50}ms p95=${results[role][path].p95}ms`)
  }
  await ctx.close()
}
await browser.close()

const summary = { generatedAt: new Date().toISOString(), base, samplesPerRoute: SAMPLES, caveat: 'Local disposable PostgreSQL, single concurrent user. Not a production benchmark.', results }
console.log(JSON.stringify(summary, null, 1))
