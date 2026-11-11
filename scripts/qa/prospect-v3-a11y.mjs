/**
 * Prospect V3 — accessibility, responsive and visual audit.
 *
 * Usage:
 *   node scripts/qa/prospect-v3-a11y.mjs <baseUrl> [outDir]
 *
 * For each role × viewport (1440/1024/768/375) × Prospect route (Analyze,
 * Recent, Saved, Watchlist):
 *   - injects axe-core (CDN) and records violations grouped by impact
 *   - measures horizontal overflow
 *   - records console/page errors
 *   - captures a screenshot for manual review
 *
 * axe-core loads from a CDN so no dependency is added; if the CDN is
 * unreachable the run says so rather than failing silently.
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? process.env.RELAY_BASE_URL
const OUT = process.argv[3] ?? 'artifacts/prospect-v3'
if (!BASE) {
  console.error('usage: node scripts/qa/prospect-v3-a11y.mjs <baseUrl> [outDir]')
  process.exit(1)
}

const USERS = [
  { role: 'admin', email: process.env.A11Y_ADMIN_EMAIL ?? 'hassan@scout.dev', password: process.env.A11Y_ADMIN_PASSWORD ?? 'scout-dev-password' },
  { role: 'rep', email: process.env.A11Y_REP_EMAIL ?? 'madiha@scout.dev', password: process.env.A11Y_REP_PASSWORD ?? 'scout-dev-password' },
]

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '375', width: 375, height: 812 },
]

const ROUTES = [
  { name: 'analyze', path: '/prospect' },
  { name: 'recent', path: '/prospect?tab=recent' },
  { name: 'saved', path: '/prospect?tab=saved' },
  { name: 'watchlist', path: '/prospect?tab=watchlist' },
  { name: 'fresh', path: '/prospect?tab=fresh' },
  { name: 'leads', path: '/leads' },
  { name: 'lead-detail', path: '/leads' },
  { name: 'admin-providers', path: '/admin/providers' },
  { name: 'admin-health', path: '/admin/health' },
]

const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'

mkdirSync(OUT, { recursive: true })
const report = { base: BASE, startedAt: new Date().toISOString(), runs: [] }

const browser = await chromium.launch({ ignoreHTTPSErrors: true })

async function signIn(page, user) {
  // Reuse the one-time session captured by globalSetup when available.
  const stored = join(process.cwd(), 'e2e/.auth', `${user.role}.json`)
  if (existsSync(stored)) {
    try {
      const state = JSON.parse(readFileSync(stored, 'utf8'))
      if (state.cookies?.length) {
        await page.context().addCookies(state.cookies)
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
        if (!page.url().includes('/login')) return
      }
    } catch {
      // fall through to an interactive sign-in
    }
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  if (!page.url().includes('/login')) return // demo mode auto-authenticates
  await page.waitForSelector('#login-email', { timeout: 60_000 })
  await page.evaluate(
    ({ email, password }) => {
      const set = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        if (el._valueTracker) el._valueTracker.setValue('')
        setter.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      set(document.querySelector('#login-email'), email)
      set(document.querySelector('#login-password'), password)
    },
    { email: user.email, password: user.password },
  )
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('form button[type="submit"]')
      return btn instanceof HTMLButtonElement && !btn.disabled
    },
    { timeout: 60_000 },
  )
  await Promise.all([
    page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 60_000 }),
    page.evaluate(() => document.querySelector('form button[type="submit"]').click()),
  ])
  await page.waitForLoadState('networkidle').catch(() => {})
}

for (const user of USERS) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(60_000)
  page.setDefaultTimeout(60_000)
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`.slice(0, 300)))

  try {
    await signIn(page, user)
  } catch (err) {
    console.log(`${user.role}: sign-in failed — ${(err).message?.slice(0, 160)}`)
    await context.close()
    continue
  }

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const route of ROUTES) {
      consoleErrors.length = 0
      let routePath = route.path
      if (route.name === 'lead-detail') {
        // A lead detail surface needs a real lead id; discover the first one.
        await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1500)
        const href = await page.evaluate(() => {
          const anchor = [...document.querySelectorAll('a[href^="/leads/"]')][0]
          return anchor?.getAttribute('href') ?? null
        })
        if (!href) {
          report.runs.push({
            role: user.role,
            viewport: vp.name,
            route: route.name,
            url: `${BASE}/leads`,
            axe: null,
            consoleErrors: [],
            overflow: null,
            ctaVisible: false,
            skipped: 'no lead link found',
          })
          console.log(`${user.role} ${vp.name} ${route.name}: SKIPPED (no lead link)`)
          continue
        }
        routePath = href
      }
      try {
        await page.goto(`${BASE}${routePath}`, { waitUntil: 'domcontentloaded' })
      } catch (err) {
        // A stalled dev server must not abort the whole matrix.
        report.runs.push({
          role: user.role,
          viewport: vp.name,
          route: route.name,
          url: `${BASE}${route.path}`,
          axe: { error: `navigation failed: ${(err).message?.slice(0, 160)}` },
          consoleErrors: [],
          overflow: null,
          ctaVisible: false,
        })
        console.log(`${user.role} ${vp.name} ${route.name}: NAV FAILED`)
        continue
      }
      await page.waitForTimeout(2000)

      const entry = {
        role: user.role,
        viewport: vp.name,
        route: route.name,
        url: page.url(),
        axe: null,
        consoleErrors: [...consoleErrors],
        overflow: null,
        ctaVisible: false,
      }

      entry.overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      // The Analyze CTA must never be hidden behind the mobile bottom nav.
      entry.ctaVisible = await page
        .locator('text=Analyze Prospect')
        .first()
        .isVisible()
        .catch(() => false)

      try {
        await page.addScriptTag({ url: AXE_CDN })
        entry.axe = await page.evaluate(async () => {
          const results = await window.axe.run(document, {
            resultTypes: ['violations'],
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          })
          const byImpact = {}
          for (const v of results.violations) {
            const key = v.impact ?? 'unknown'
            byImpact[key] ??= []
            byImpact[key].push({
              id: v.id,
              help: v.help,
              nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
              all: v.nodes.length,
            })
          }
          return { total: results.violations.length, byImpact }
        })
      } catch (err) {
        entry.axe = { error: `axe unavailable: ${(err).message?.slice(0, 200)}` }
      }

      // §28 — keyboard: Tab must move focus, Escape must be safe.
      try {
        const before = await page.evaluate(() => document.activeElement?.tagName ?? null)
        await page.keyboard.press('Tab')
        await page.waitForTimeout(120)
        const after = await page.evaluate(() => document.activeElement?.tagName ?? null)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(120)
        const afterEscape = await page.evaluate(() => document.activeElement?.tagName ?? null)
        entry.keyboard = { before, after, afterEscape, tabMovedFocus: before !== after }
      } catch (err) {
        entry.keyboard = { error: (err).message?.slice(0, 160) }
      }

      const shot = join(OUT, `${user.role}-${vp.name}-${route.name}.png`)
      await page.screenshot({ path: shot, fullPage: false })
      entry.screenshot = shot

      report.runs.push(entry)
      const serious = (entry.axe?.byImpact?.critical?.length ?? 0) + (entry.axe?.byImpact?.serious?.length ?? 0)
      console.log(
        `${user.role} ${vp.name} ${route.name}: axeSerious=${serious} overflow=${entry.overflow.scrollWidth > entry.overflow.clientWidth} tab=${entry.keyboard?.tabMovedFocus} cta=${entry.ctaVisible} errors=${entry.consoleErrors.length}`,
      )
    }
  }

  await context.close()
}

await browser.close()
report.finishedAt = new Date().toISOString()
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(`report: ${join(OUT, 'report.json')}`)
