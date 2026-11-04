/**
 * Rep + Admin dashboard visual QA matrix.
 *
 * Usage:
 *   node scripts/qa/dashboard-v3-qa.mjs <baseUrl> [outDir]
 *
 * Signs in as one rep and one admin, then for every viewport captures a
 * full-page screenshot, records console/page errors and flags horizontal
 * overflow (charts must resize, never widen the document).
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? process.env.RELAY_BASE_URL
const OUT = process.argv[3] ?? 'artifacts/dashboards'
if (!BASE) {
  console.error('usage: node scripts/qa/dashboard-v3-qa.mjs <baseUrl> [outDir]')
  process.exit(1)
}

/** axe-core is loaded from a CDN so no dependency is added to the project. */
const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'

const USERS = [
  { role: 'rep', email: 'ahmad@scout.dev' },
  { role: 'admin', email: 'aneeb@scout.dev' },
]
const PASSWORD = 'scout-dev-password'
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '375', width: 375, height: 812 },
]

mkdirSync(OUT, { recursive: true })
const report = { base: BASE, startedAt: new Date().toISOString(), runs: [] }

const browser = await chromium.launch({ ignoreHTTPSErrors: true })

async function signIn(email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  if (!page.url().includes('/login')) return context

  await page.waitForSelector('#login-email', { timeout: 60_000 })
  await page.evaluate(
    ({ email: e, password }) => {
      const set = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        if (el._valueTracker) el._valueTracker.setValue('')
        setter.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      set(document.querySelector('#login-email'), e)
      set(document.querySelector('#login-password'), password)
    },
    { email, password: PASSWORD },
  )
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('form button[type="submit"]')
      return btn instanceof HTMLButtonElement && !btn.disabled
    },
    undefined,
    { timeout: 60_000 },
  )
  await Promise.all([
    page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 60_000 }),
    page.evaluate(() => document.querySelector('form button[type="submit"]').click()),
  ])
  return context
}

for (const user of USERS) {
  // One real sign-in per role; the session is replayed to every viewport.
  const session = await signIn(user.email).catch((err) => {
    console.log(`[${user.role}] sign-in failed: ${err.message?.slice(0, 160)}`)
    return null
  })
  if (!session) continue
  const state = await session.storageState()
  await session.close()

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      storageState: state,
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    const consoleErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const location = msg.location()
        consoleErrors.push(`${msg.text().slice(0, 300)}${location?.url ? ` @ ${location.url}` : ''}`)
      }
    })
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`.slice(0, 300)))

    try {
      await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 90_000 })
      await page.waitForTimeout(1500)

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      const title = await page.title()

      const file = `${user.role}-${viewport.name}.png`
      await page.screenshot({ path: join(OUT, file), fullPage: true })

      // Accessibility audit on the live DOM.
      let axeResult
      try {
        await page.addScriptTag({ url: AXE_CDN })
        axeResult = await page.evaluate(async () => {
          const results = await window.axe.run(document, {
            resultTypes: ['violations'],
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          })
          return results.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.length,
            help: violation.help,
          }))
        })
      } catch (err) {
        axeResult = { error: err.message?.slice(0, 200) }
      }

      const run = {
        role: user.role,
        viewport: viewport.name,
        status: 'captured',
        file,
        title,
        horizontalOverflow: overflow.scrollWidth > overflow.clientWidth + 1,
        scrollWidth: overflow.scrollWidth,
        clientWidth: overflow.clientWidth,
        consoleErrors,
        axe: axeResult,
      }
      report.runs.push(run)
      const violations = Array.isArray(run.axe) ? run.axe.length : 1
      console.log(
        `[${user.role} ${viewport.name}] ${run.horizontalOverflow ? 'OVERFLOW ' : 'ok'} ` +
          `${overflow.scrollWidth}/${overflow.clientWidth} errors=${consoleErrors.length} a11y=${violations}`,
      )
    } catch (err) {
      report.runs.push({
        role: user.role,
        viewport: viewport.name,
        status: 'failed',
        error: err.message?.slice(0, 300),
        consoleErrors,
      })
      console.log(`[${user.role} ${viewport.name}] FAILED ${err.message?.slice(0, 160)}`)
    } finally {
      await page.close()
      await context.close()
    }
  }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(report, null, 2))
await browser.close()

const failed = report.runs.filter((run) => run.status !== 'captured')
const overflow = report.runs.filter((run) => run.horizontalOverflow)
const noisy = report.runs.filter((run) => run.consoleErrors?.length > 0)
const a11y = report.runs.filter((run) => Array.isArray(run.axe) ? run.axe.length > 0 : Boolean(run.axe?.error))
console.log(`\ncaptured=${report.runs.length - failed.length} failed=${failed.length} overflow=${overflow.length} consoleErrors=${noisy.length} a11yViolations=${a11y.length}`)
for (const run of a11y) {
  if (Array.isArray(run.axe)) {
    for (const violation of run.axe) {
      console.log(`  [${run.role} ${run.viewport}] ${violation.impact} ${violation.id}: ${violation.help} (${violation.nodes} nodes)`)
    }
  } else {
    console.log(`  [${run.role} ${run.viewport}] axe error: ${run.axe?.error}`)
  }
}
console.log(`screenshots: ${OUT}`)
