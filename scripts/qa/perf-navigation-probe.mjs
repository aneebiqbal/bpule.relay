/**
 * BUG-001 navigation probe (cold authenticated render).
 *
 * Measures the server response and document time for each surface named in the
 * bug report. Cold render is the reproducible part; warm client navigation is
 * reported separately by the browser matrix. Run against a local server with a
 * seeded account:
 *
 *   BASE_URL=http://localhost:3102 node scripts/qa/perf-navigation-probe.mjs after
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3100'
const LABEL = process.argv[2] || 'run'
const EMAIL = process.env.PERF_EMAIL || 'hassan@scout.dev'
const PASSWORD = process.env.PERF_PASSWORD || 'scout-dev-password'

const ROUTES = [
  { name: 'Today', path: '/dashboard' },
  { name: 'Leads', path: '/leads' },
  { name: 'Chats', path: '/chats' },
  { name: 'Prospect', path: '/prospect' },
  { name: 'Studio', path: '/content' },
  { name: 'Admin QA', path: '/admin/qa' },
]

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 20000 })
  // Wait for React hydration: a controlled input gets a `_valueTracker` only
  // after React attaches. Filling before hydration leaves React state empty.
  await page.waitForFunction(() => {
    const el = document.querySelector('#login-email')
    return Boolean(el && '_valueTracker' in el)
  }, { timeout: 30000 })
  await page.locator('#login-email').pressSequentially(EMAIL, { delay: 5 })
  await page.locator('#login-password').pressSequentially(PASSWORD, { delay: 5 })
  await page.getByRole('button', { name: /sign in with password/i }).click()
  await page.waitForFunction(() => /^\/(dashboard|onboarding)/.test(location.pathname), { timeout: 40000 })
  if (new URL(page.url()).pathname.startsWith('/onboarding')) throw new Error('account landed on /onboarding')
  await page.waitForTimeout(800)
}

async function measure(page, path) {
  const t0 = Date.now()
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const total = Date.now() - t0
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    if (!n) return null
    return {
      ttfb: Math.round(n.responseStart),
      html: Math.round(n.responseEnd - n.responseStart),
      dcl: Math.round(n.domContentLoadedEventEnd),
    }
  }).catch(() => null)
  return { total, ...nav }
}

async function run() {
  const browser = await chromium.launch()
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(45000)
  await login(page)
  console.error('logged in')

  const rows = []
  for (const route of ROUTES) {
    try {
      const p1 = await measure(page, route.path)
      const p2 = await measure(page, route.path)
      rows.push({
        Route: route.name,
        'Pass 1 (ms)': p1.total,
        'Pass 2 (ms)': p2.total,
        'TTFB (ms)': p2.ttfb ?? '—',
        'HTML (ms)': p2.html ?? '—',
        'DCL (ms)': p2.dcl ?? '—',
      })
      console.error(`measured ${route.name}`)
    } catch (err) {
      rows.push({ Route: route.name, 'Pass 1 (ms)': 'n/a', 'Pass 2 (ms)': 'n/a', 'TTFB (ms)': String(err).slice(0, 50), 'HTML (ms)': '—', 'DCL (ms)': '—' })
      console.error(`failed ${route.name}: ${String(err).slice(0, 120)}`)
    }
  }

  console.log(`\n[${LABEL}] cold authenticated render @ ${BASE}`)
  console.table(rows)
  await browser.close()
}

run().catch((err) => { console.error(err); process.exit(1) })
