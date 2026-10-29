/**
 * Read-only data smoke (no writes). Verifies the board count, the analytics
 * heatmap, the activity heatmap and (for an admin) the command center.
 *
 *   BASE_URL=http://localhost:3102 SMOKE_EMAIL=madiha@scout.dev node scripts/qa/data-smoke.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3102'
const EMAIL = process.env.SMOKE_EMAIL || 'hassan@scout.dev'
const PASSWORD = process.env.SMOKE_PASSWORD || 'scout-dev-password'
const IS_ADMIN = /hassan|aneeb/i.test(EMAIL)

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const el = document.querySelector('#login-email')
    return Boolean(el && '_valueTracker' in el)
  }, { timeout: 30000 })
  await page.locator('#login-email').pressSequentially(EMAIL, { delay: 3 })
  await page.locator('#login-password').pressSequentially(PASSWORD, { delay: 3 })
  await page.getByRole('button', { name: /sign in with password/i }).click()
  await page.waitForFunction(() => /^\/(dashboard|onboarding)/.test(location.pathname), { timeout: 45000 })
}

const out = []
const errors = []

async function run() {
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(60000)
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
  await login(page)

  try {
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    const leadsText = await page.evaluate(() => document.body.innerText.slice(0, 700))
    const orgHeader = /active leads in the organisation/i.test(leadsText)
    const ownHeader = /active leads? you own/i.test(leadsText)
    const countMatch = leadsText.match(/(\d+)\s+active leads? (?:in the organisation|you own)/i)
    out.push(['leads', { orgHeader, ownHeader, count: countMatch ? Number(countMatch[1]) : null, text: leadsText.split('\n').filter(Boolean).slice(0, 10).join(' | ') }])
  } catch (e) { out.push(['leads', String(e).slice(0, 120)]) }

  try {
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('[data-testid="pipeline-analytics"]', { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(3000)
    const analytics = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="pipeline-analytics"]')
      if (!root) return null
      const labels = [...root.querySelectorAll('button[aria-label]')]
        .map((b) => b.getAttribute('aria-label') || '')
        .filter((s) => /messages|actions/i.test(s))
      return { cells: labels.length, nonzero: labels.filter((s) => !/· 0 /.test(s)).length, sample: labels.slice(-3) }
    })
    out.push(['dashboard analytics heatmap', analytics])
  } catch (e) { out.push(['dashboard analytics heatmap', String(e).slice(0, 120)]) }

  try {
    await page.goto(`${BASE}/performance`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    const perf = await page.evaluate(() => {
      const text = document.body.innerText
      const m = text.match(/(\d+)\s*\n\s*Total actions/i)
      const cells = [...document.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label') || '').filter((s) => /actions/i.test(s))
      return { totalActions: m ? Number(m[1]) : null, cells: cells.length, nonzero: cells.filter((s) => !/· 0 /.test(s)).length }
    })
    out.push(['performance heatmap', perf])
  } catch (e) { out.push(['performance heatmap', String(e).slice(0, 120)]) }

  if (IS_ADMIN) {
    try {
      await page.goto(`${BASE}/admin/command-center`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(2500)
      const command = await page.evaluate(() => ({
        error: /application error|something went wrong/i.test(document.body.innerText),
        heading: document.querySelector('h1')?.textContent?.trim() ?? null,
        hasTeam: /team|rep|operator/i.test(document.body.innerText),
      }))
      out.push(['command center', command])
    } catch (e) { out.push(['command center', String(e).slice(0, 120)]) }
  }

  console.log(JSON.stringify({ user: EMAIL, checks: out, pageErrors: errors }, null, 2))
  await browser.close()
}

run().catch((err) => { console.error(err); process.exit(1) })
