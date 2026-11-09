/** Team operating surfaces — responsive + axe smoke (Neon production, HTTPS proxy). */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const axeSource = fs.readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '375', width: 375, height: 812 },
]

const REP_ID = 'aaaaaaaa-0000-0000-0000-000000000002'
const PROFILE_ID = 'fec8abf0-7fb5-4999-87ea-fee805cc8c12'

const SURFACES = [
  { name: 'Team Today', href: '/team', expect: 'Today' },
  { name: 'People', href: '/team/people', expect: 'People' },
  { name: 'Profiles', href: '/team/profiles', expect: 'Profiles' },
  { name: 'Rep Detail', href: `/team/${REP_ID}`, expect: 'Profiles' },
  { name: 'Profile Detail', href: `/team/profiles/${PROFILE_ID}`, expect: 'Channels' },
  { name: 'Performance', href: '/team/performance', expect: 'Performance' },
  { name: 'Performance Targets', href: '/team/performance?view=targets', expect: 'Targets' },
  { name: 'Daily Targets', href: '/admin/targets', expect: 'Daily targets' },
]

const results = []
const fail = (m) => results.push(`FAIL: ${m}`)
const ok = (m) => results.push(`ok: ${m}`)

process.on('uncaughtException', (err) => {
  console.error(err instanceof Error ? err.message : String(err))
  console.log(results.join('\n'))
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
      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForSelector('#login-email', { timeout: 60_000 })
      let ready = false
      for (let i = 0; i < 5 && !ready; i++) {
        await page.fill('#login-email', email)
        await page.fill('#login-password', 'scout-dev-password')
        ready = await page
          .waitForSelector('button.auth-submit[type="submit"]:not([disabled])', { timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
        if (!ready) await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
      }
      if (!ready) throw new Error('login form never became submittable')
      await page.click('button.auth-submit[type="submit"]')
      await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 60_000 })
      await page.waitForTimeout(1500)
      return page
    } catch (err) {
      lastErr = err
      await page.close().catch(() => {})
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  throw lastErr
}

async function axeCheck(page, label) {
  await page.addScriptTag({ content: axeSource })
  await page.waitForTimeout(300)
  const report = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => ({ id: v.id, impact: v.impact, target: v.nodes[0]?.target?.join(' ') ?? '' }))
  })
  if (report.length === 0) ok(`${label}: axe 0 critical / 0 serious`)
  else fail(`${label}: axe violations ${JSON.stringify(report)}`)
}

{
  const page = await login('hassan@scout.dev')
  for (const surface of SURFACES) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto(`${base}${surface.href}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForTimeout(2500)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      if (overflow <= 1) ok(`${surface.name} ${vp.name}: overflow 0`)
      else fail(`${surface.name} ${vp.name}: overflow ${overflow}`)

      const body = await page.locator('body').innerText().catch(() => '')
      if (body.includes(surface.expect)) ok(`${surface.name} ${vp.name}: ${surface.expect} present`)
      else fail(`${surface.name} ${vp.name}: "${surface.expect}" missing`)

      if (vp.name === '1440' || vp.name === '375') await axeCheck(page, `${surface.name} ${vp.name}`)
    }
  }
  await page.close()
}

await browser.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
