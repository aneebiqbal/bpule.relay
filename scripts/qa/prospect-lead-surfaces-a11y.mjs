/**
 * V6.1.2 §25/§26 — responsive + axe over the four certified surfaces:
 *   /prospect · /leads · /leads/[id] · /chats
 * at 1440 / 1280 / 1024 / 768 / 375, for a rep and an admin.
 *
 *   node scripts/qa/prospect-lead-surfaces-a11y.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] ?? process.env.RELAY_BASE_URL ?? 'https://relay.bpulse.dev'
const OUT = process.argv[3] ?? 'artifacts/v612-surfaces-a11y'
const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js'

const USERS = [
  { role: 'rep', email: process.env.A11Y_REP_EMAIL ?? 'ahmad@scout.dev', password: process.env.A11Y_REP_PASSWORD ?? 'scout-dev-password' },
  { role: 'admin', email: process.env.A11Y_ADMIN_EMAIL ?? 'hassan@scout.dev', password: process.env.A11Y_ADMIN_PASSWORD ?? 'scout-dev-password' },
]

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '375', width: 375, height: 812 },
]

const SURFACES = [
  { name: 'prospect', path: '/prospect' },
  { name: 'leads', path: '/leads' },
  { name: 'chats', path: '/chats' },
]

mkdirSync(OUT, { recursive: true })
const report = { base: BASE, startedAt: new Date().toISOString(), runs: [], failures: [] }
const results = []
const record = (id, ok, detail) => {
  results.push({ id, ok, detail })
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${id}  ${detail ?? ''}`)
  if (!ok) report.failures.push({ id, detail })
}

const browser = await chromium.launch({ ignoreHTTPSErrors: true })

async function signIn(page, user) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  if (!page.url().includes('/login')) return
  await page.waitForSelector('#login-email', { timeout: 60_000 })
  await page.waitForFunction(
    () => Boolean(document.querySelector('#login-email') && '_valueTracker' in document.querySelector('#login-email')),
    { timeout: 30_000 },
  ).catch(() => {})
  await page.locator('#login-email').pressSequentially(user.email, { delay: 3 })
  await page.locator('#login-password').pressSequentially(user.password, { delay: 3 })
  const signInButton = page.getByRole('button', { name: /sign in with password/i })
  await signInButton.waitFor({ state: 'visible', timeout: 30_000 })
  await signInButton.click({ timeout: 30_000 })
  await page.waitForFunction(() => /^\/(dashboard|onboarding|chats)/.test(location.pathname), { timeout: 60_000 })
}

for (const user of USERS) {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)
  try {
    await signIn(page, user)
  } catch (e) {
    record(`${user.role} sign-in`, false, e.message.slice(0, 120))
    await context.close()
    continue
  }
  record(`${user.role} sign-in`, true, user.email)

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const surface of SURFACES) {
      const id = `${user.role} ${vp.name} ${surface.name}`
      try {
        await page.goto(`${BASE}${surface.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.waitForTimeout(1800)

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        record(`${id} overflow 0`, overflow.scrollWidth <= overflow.clientWidth + 1,
          `${overflow.scrollWidth}/${overflow.clientWidth}`)

        await page.addScriptTag({ url: AXE_CDN }).catch(() => null)
        const axe = await page.evaluate(async () => {
          if (typeof window.axe === 'undefined') return { unavailable: true }
          const result = await window.axe.run(document, { resultTypes: ['violations'] })
          return {
            critical: result.violations.filter((v) => v.impact === 'critical'),
            serious: result.violations.filter((v) => v.impact === 'serious'),
          }
        }).catch(() => ({ unavailable: true }))
        if (axe.unavailable) {
          record(`${id} axe`, false, 'axe unavailable')
        } else {
          record(`${id} axe 0 critical / 0 serious`,
            axe.critical.length === 0 && axe.serious.length === 0,
            axe.critical.length + axe.serious.length
              ? JSON.stringify([...axe.critical, ...axe.serious].map((v) => ({ id: v.id, impact: v.impact, target: v.nodes?.[0]?.target })))
              : 'clean')
        }

        report.runs.push({ role: user.role, viewport: vp.name, surface: surface.name, overflow, axe })
      } catch (e) {
        record(`${id}`, false, e.message.slice(0, 120))
      }
    }
  }

  // A real lead detail page for this rep.
  try {
    await page.goto(`${BASE}/leads`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(2000)
    const href = await page.locator('table tbody tr a[href^="/leads/"]').first().getAttribute('href').catch(() => null)
    const leadId = href?.match(/^\/leads\/([0-9a-f-]{36})/)?.[1] ?? null
    if (leadId) {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        const id = `${user.role} ${vp.name} lead-detail`
        await page.goto(`${BASE}/leads/${leadId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.waitForTimeout(1800)
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        record(`${id} overflow 0`, overflow.scrollWidth <= overflow.clientWidth + 1,
          `${overflow.scrollWidth}/${overflow.clientWidth}`)
        await page.addScriptTag({ url: AXE_CDN }).catch(() => null)
        const axe = await page.evaluate(async () => {
          if (typeof window.axe === 'undefined') return { unavailable: true }
          const result = await window.axe.run(document, { resultTypes: ['violations'] })
          return {
            critical: result.violations.filter((v) => v.impact === 'critical'),
            serious: result.violations.filter((v) => v.impact === 'serious'),
          }
        }).catch(() => ({ unavailable: true }))
        record(`${id} axe 0 critical / 0 serious`,
          Boolean(axe) && !axe.unavailable && axe.critical.length === 0 && axe.serious.length === 0,
          axe?.unavailable ? 'axe unavailable' : JSON.stringify([...(axe?.critical ?? []), ...(axe?.serious ?? [])].map((v) => ({ id: v.id, impact: v.impact }))))
      }
    } else {
      record(`${user.role} lead-detail`, false, 'no lead id from /leads')
    }
  } catch (e) {
    record(`${user.role} lead-detail`, false, e.message.slice(0, 120))
  }

  await context.close()
}

const failed = results.filter((r) => !r.ok)
report.summary = { passed: results.length - failed.length, failed: failed.length }
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\nSURFACES: ${results.length - failed.length}/${results.length} checks passed`)
console.log(`report: ${join(OUT, 'report.json')}`)
await browser.close()
process.exit(failed.length ? 1 : 0)
