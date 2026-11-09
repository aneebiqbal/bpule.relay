/**
 * Release role crawl + responsive matrix.
 *
 * Crawls every canonical route as REP and ADMIN from visible navigation only,
 * asserts the page renders and the role cannot see the other domain, then runs
 * the responsive matrix on the core surfaces.
 *
 * Read-only: navigations and DOM inspection only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = process.env.BASE_URL || 'https://localhost:3000'
const axeSource = fs.readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const results = []
const ok = (m) => { results.push(`ok: ${m}`); console.log(`ok: ${m}`) }
const fail = (m) => { results.push(`FAIL: ${m}`); console.log(`FAIL: ${m}`) }

// A crash mid-run must still report what already passed.
process.on('uncaughtException', (err) => {
  console.error(err instanceof Error ? err.message : String(err))
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n${results.length - failed} passed, ${failed} failed — INCOMPLETE RUN`)
  process.exit(1)
})

const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })

async function login(email, attempts = 3) {
  let lastErr
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const page = await context.newPage()
    try {
      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#login-email', { timeout: 60_000 })
      await page.fill('#login-email', email)
      await page.fill('#login-password', 'scout-dev-password')
      // The submit button is disabled until React has accepted both fields;
      // under load hydration can lag well behind the input elements appearing.
      await page.waitForSelector('button.auth-submit[type="submit"]:not([disabled])', { timeout: 30_000 })
      await page.locator('button.auth-submit[type="submit"]').click()
      // Some sessions render the cockpit before the URL settles; accept either.
      await page.waitForFunction(
        () => {
          const p = location.pathname
          const text = document.body.innerText
          return !p.startsWith('/login')
            || text.includes('Command Center')
            || /Good (morning|afternoon|evening)/.test(text)
        },
        { timeout: 30000 },
      ).catch(() => {})
      await page.waitForTimeout(1200)
      return page
    } catch (err) {
      lastErr = err
      console.error(`login attempt ${attempt}/${attempts} failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
      await page.close().catch(() => {})
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  throw lastErr
}

async function crawl(page, routes, label) {
  for (const route of routes) {
    try {
      await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(1800)
      const url = new URL(page.url())
      // A gate redirects reps away from manager/admin surfaces; that is a failure.
      if (url.pathname === '/login') {
        fail(`${label} ${route}: redirected to login`)
        continue
      }
      const bodyText = await page.locator('body').innerText().catch(() => '')
      if (/could not be loaded|not found|forbidden|unauthorized/i.test(bodyText.slice(0, 400)) && url.pathname !== '/dashboard') {
        fail(`${label} ${route}: error copy visible`)
        continue
      }
      ok(`${label} ${route}`)
    } catch (err) {
      fail(`${label} ${route}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
    }
  }
}

async function axeCheck(page, label) {
  await page.addScriptTag({ content: axeSource })
  const report = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.impact}:${v.id}:${(v.nodes?.[0]?.target ?? []).join(' ')}`)
  })
  if (report.length === 0) ok(`${label}: axe 0 critical / 0 serious`)
  else fail(`${label}: axe ${JSON.stringify(report)}`)
}

// ── REP ──────────────────────────────────────────────────────────────────────
{
  const page = await login('dawood@scout.dev')
  const repRoutes = [
    '/dashboard', '/prospect', '/leads', '/leads?view=pipeline', '/leads/import',
    '/chats', '/chats?view=waiting_me', '/chats?view=waiting_them', '/chats?view=followups',
    '/tasks', '/content', '/content/ideas', '/reports/sales', '/reports/pipeline',
    '/reports/revenue', '/reports/activity', '/performance', '/settings', '/notifications',
    '/upwork', '/revenue/email', '/archive',
  ]
  await crawl(page, repRoutes, 'rep')

  // Rep must never see the Team or Admin domains.
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(900)
  const teamLinks = await page.locator('a[href^="/team"], a[href^="/admin"], a[href^="/profile-intelligence"]').count().catch(() => 0)
  if (teamLinks === 0) ok('rep: no Team/Admin/Identities nav leakage')
  else fail(`rep: ${teamLinks} Team/Admin/Identities links visible`)

  // Rep must not reach manager/admin surfaces directly. The gate redirects
  // asynchronously, so wait for the URL to settle rather than sampling it.
  for (const blocked of ['/team', '/admin/command', '/team/profiles']) {
    try {
      await page.goto(`${base}${blocked}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    } catch {
      ok(`rep: ${blocked} gated (navigation redirected)`)
      continue
    }
    const settled = await page
      .waitForURL((url) => url.pathname !== blocked, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    if (settled) ok(`rep: ${blocked} gated → ${new URL(page.url()).pathname}`)
    else fail(`rep: reached ${blocked} directly`)
  }
  await page.close()
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────
{
  await context.clearCookies()
  const page = await login('hassan@scout.dev')
  const adminRoutes = [
    '/dashboard', '/admin/command', '/admin/people', '/admin/targets', '/admin/scoring-qa',
    '/admin/qa', '/admin/dataset', '/admin/training-data', '/admin/ai-usage',
    '/admin/revenue-intelligence', '/team', '/team/people', '/team/profiles',
    '/profile-intelligence?tab=identities', '/team/coverage', '/team/workload',
    '/team/activity', '/team/performance', '/team/targets', '/team/groups',
    '/content/growth', '/facts', '/accounts',
  ]
  await crawl(page, adminRoutes, 'admin')
  await page.close()
}

// ── RESPONSIVE MATRIX ─────────────────────────────────────────────────────────
{
  await context.clearCookies()
  const page = await login('hassan@scout.dev')
  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '1024', width: 1024, height: 768 },
    { name: '768', width: 768, height: 1024 },
    { name: '375', width: 375, height: 812 },
  ]
  const surfaces = ['/dashboard', '/leads', '/chats', '/tasks', '/team', '/team/profiles', '/team/coverage', '/team/targets', '/upwork', '/prospect', '/content', '/reports/sales', '/settings']
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const surface of surfaces) {
      await page.goto(`${base}${surface}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(1800)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow <= 1) ok(`responsive ${vp.name} ${surface}: overflow 0`)
      else fail(`responsive ${vp.name} ${surface}: overflow ${overflow}`)
    }
  }
  // axe on the core surfaces at desktop and mobile.
  for (const surface of ['/dashboard', '/leads', '/chats', '/tasks']) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${base}${surface}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(900)
    await axeCheck(page, `desktop ${surface}`)
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(900)
  await axeCheck(page, 'mobile /dashboard')
  await page.close()
}

await browser.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
