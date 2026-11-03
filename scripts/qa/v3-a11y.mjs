/**
 * Sprint 1.6 accessibility + responsive audit for the V3 shell.
 *
 * Usage:
 *   node scripts/qa/v3-a11y.mjs <baseUrl> [outDir]
 *
 * Signs in as one rep and one admin, then for each viewport (1440, 375):
 *   - injects axe-core and records violations grouped by impact
 *   - records console errors / page errors
 *   - captures a screenshot
 *
 * axe-core is loaded from a CDN so no dependency is added to the project. If
 * the CDN is unreachable the run reports that instead of failing silently.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? process.env.RELAY_BASE_URL
const OUT = process.argv[3] ?? 'artifacts/a11y'
if (!BASE) {
  console.error('usage: node scripts/qa/v3-a11y.mjs <baseUrl> [outDir]')
  process.exit(1)
}

const USERS = [
  { role: 'rep', email: 'ahmad@scout.dev', password: 'scout-dev-password' },
  { role: 'admin', email: 'aneeb@scout.dev', password: 'scout-dev-password' },
]
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '375', width: 375, height: 812 },
]
const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'

mkdirSync(OUT, { recursive: true })
const report = { base: BASE, startedAt: new Date().toISOString(), runs: [] }

const browser = await chromium.launch()

for (const user of USERS) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`.slice(0, 300)))

  // Sign in through the real auth flow. Fill through the React value tracker so
  // the submit button actually enables, then click once it is live.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
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

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)

    const entry = {
      role: user.role,
      viewport: vp.name,
      url: page.url(),
      title: await page.title(),
      axe: null,
      consoleErrors: [...consoleErrors],
      overflow: null,
    }

    // Horizontal overflow: nothing may scroll sideways.
    entry.overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    try {
      const injected = await page.addScriptTag({ url: AXE_CDN })
      if (!injected) throw new Error('axe script tag rejected')
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

    const shot = join(OUT, `${user.role}-${vp.name}.png`)
    await page.screenshot({ path: shot, fullPage: false })
    entry.screenshot = shot

    report.runs.push(entry)
    console.log(
      `${user.role} @${vp.name}: axe=${entry.axe?.total ?? 'n/a'} overflow=${entry.overflow.scrollWidth > entry.overflow.clientWidth} consoleErrors=${entry.consoleErrors.length}`,
    )
    consoleErrors.length = 0
  }

  await context.close()
}

await browser.close()
report.finishedAt = new Date().toISOString()
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(`report: ${join(OUT, 'report.json')}`)
