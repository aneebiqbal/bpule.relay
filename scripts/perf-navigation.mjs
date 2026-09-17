/**
 * Navigation latency probe for Relay surfaces.
 *
 * Measures, for each target route, a client-side (warm) navigation from the
 * shared app shell: click → RSC request → first meaningful content. Also
 * counts RSC requests issued per navigation and reports the RSC server wait.
 *
 * Usage: BASE_URL=http://localhost:3100 node scripts/perf-navigation.mjs [label]
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'http://localhost:3100'
const LABEL = process.argv[2] || 'run'
const ADMIN_EMAIL = 'hassan@scout.dev'
const PASSWORD = 'scout-dev-password'

const DASH_READY = 'text=Your Relay / Today'
const LEADS_READY = 'text=Work the highest-intent leads first.'

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 15000 })
  await page.fill('#login-email', ADMIN_EMAIL)
  await page.fill('#login-password', PASSWORD)
  page.click('button[type="submit"]').catch(() => {})
  await page.waitForURL(/dashboard|onboarding/, { timeout: 30000 })
  if (page.url().includes('/onboarding')) throw new Error('Admin landed on /onboarding — seed a voice profile first')
  await page.waitForSelector(DASH_READY, { timeout: 30000 })
}

async function warmNav(page, { href, content, urlPattern }) {
  const rsc = []
  const onReq = (req) => {
    if (req.url().includes('_rsc=')) {
      const entry = { serverMs: null }
      rsc.push(entry)
      req.response().then((res) => {
        if (!res) return
        const t = req.timing()
        if (t && t.responseEnd >= 0) entry.serverMs = Math.round(t.responseEnd - t.requestStart)
      }).catch(() => {})
    }
  }
  page.on('request', onReq)
  const t0 = Date.now()
  await page.click(`a[href="${href}"]`, { timeout: 10000 })
  if (content) await page.waitForSelector(content, { timeout: 60000 })
  else await page.waitForURL(urlPattern, { timeout: 60000 })
  const total = Date.now() - t0
  await page.waitForTimeout(250)
  page.off('request', onReq)
  return { total, serverMs: rsc.find((r) => r.serverMs != null)?.serverMs ?? null, rscCount: rsc.length }
}

async function run() {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(60000)

  await login(page)

  // Discover a lead id + company for the Lead Detail route.
  await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(LEADS_READY, { timeout: 30000 })
  const leadLink = page.locator('a[href^="/leads/"]:not([href="/leads/new"]):not([href="/leads/import"])').first()
  const leadHref = await leadLink.getAttribute('href')
  const leadCompany = (await leadLink.locator('span.truncate').first().textContent().catch(() => null))?.trim()

  // origin: where the click happens. Every route is reached from /leads except
  // Leads itself (from /dashboard) and Lead Detail (from /leads).
  const ROUTES = [
    { name: 'Dashboard', path: '/dashboard', origin: '/leads', originReady: LEADS_READY, content: DASH_READY },
    { name: 'Leads', path: '/leads', origin: '/dashboard', originReady: DASH_READY, content: LEADS_READY },
    { name: 'Relay', path: '/relay', origin: '/leads', originReady: LEADS_READY, content: 'text=Full action queue across your operating system.' },
    { name: 'Jobs', path: '/upwork', origin: '/leads', originReady: LEADS_READY, content: 'text=Spend Connects where win probability is real.' },
    { name: 'Studio', path: '/content', origin: '/leads', originReady: LEADS_READY, urlPattern: /\/content/ },
    { name: 'Prospect', path: '/prospect', origin: '/relay', originReady: 'text=Full action queue across your operating system.', content: 'text=Decide if this prospect is worth your next outreach.' },
  ]
  if (leadHref && leadCompany) {
    ROUTES.splice(2, 0, { name: 'Lead Detail', path: leadHref, origin: '/leads', originReady: LEADS_READY, content: `h1:has-text(${JSON.stringify(leadCompany)})` })
  }

  console.log(`\n[${LABEL}] warm client navigation from the shared shell @ ${BASE}`)
  console.log(`lead: ${leadHref ?? 'none'} (${leadCompany ?? '—'})\n`)

  const rows = []
  for (const route of ROUTES) {
    const pass = async () => {
      await page.goto(`${BASE}${route.origin}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector(route.originReady, { timeout: 30000 })
      return warmNav(page, { href: route.path, content: route.content, urlPattern: route.urlPattern })
    }
    const p1 = await pass()
    const p2 = await pass()
    rows.push({
      Route: route.name,
      'Pass 1 (ms)': p1.total,
      'Pass 2 (ms)': p2.total,
      'Server wait (ms)': p2.serverMs ?? p1.serverMs ?? '—',
      'RSC reqs': p2.rscCount,
    })
  }

  console.table(rows)
  await browser.close()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
