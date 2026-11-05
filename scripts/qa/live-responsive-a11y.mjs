/** LIVE authenticated responsive + axe smoke (Neon production, HTTPS dev server). */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const axeSource = fs.readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '375', width: 375, height: 812 },
]
const results = []
const fail = (m) => results.push(`FAIL: ${m}`)
const ok = (m) => results.push(`ok: ${m}`)

const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
await context.addInitScript(() => {
  try { localStorage.setItem('relay-active-identity', 'c26a685b-a18b-4672-b7ad-a55e211539b2') } catch {}
})

async function login(email) {
  const page = await context.newPage()
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill('scout-dev-password')
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
  await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 30_000 })
  await page.waitForTimeout(1500)
  return page
}

async function axeCheck(page, label) {
  await page.addScriptTag({ content: axeSource })
  const report = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => ({ id: v.id, impact: v.impact, target: v.nodes[0]?.target?.join(' ') ?? '' }))
  })
  if (report.length === 0) ok(`${label}: axe 0 critical / 0 serious`)
  else fail(`${label}: axe violations ${JSON.stringify(report)}`)
}

// ── REP ──────────────────────────────────────────────────────────────────────
{
  const page = await login('dawood@scout.dev')
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(`${base}/chats?view=waiting_me`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow <= 1) ok(`rep ${vp.name}: overflow 0`)
    else fail(`rep ${vp.name}: overflow ${overflow}`)

    const queue = page.getByRole('list', { name: 'Conversations' })
    const queueVisible = await queue.isVisible().catch(() => false)
    if (vp.name === '375') {
      if (queueVisible) {
        await page.locator('ul[aria-label="Conversations"] li').first().click()
        await page.waitForTimeout(2500)
      } else {
        fail(`rep ${vp.name}: queue not visible first`)
      }
    }
    const composer = page.getByRole('textbox', { name: 'Your message' })
    let composerVisible = true
    try {
      await composer.waitFor({ state: 'visible', timeout: 20_000 })
    } catch {
      composerVisible = false
    }
    if (composerVisible) ok(`rep ${vp.name}: composer reachable`)
    else fail(`rep ${vp.name}: composer not reachable`)

    const thread = page.locator('section[aria-label="Conversation"]').isVisible().catch(() => false)
    const selected = await page.locator('ul[aria-label="Conversations"] [aria-current="true"]').count().catch(() => 0)
    if (thread && selected >= 1) ok(`rep ${vp.name}: selected thread clear`)
    else fail(`rep ${vp.name}: thread=${thread} selected=${selected}`)

    if (vp.name === '1440') {
      const pane = await page.locator('aside[aria-label="Lead intelligence pane"]').isVisible().catch(() => false)
      if (pane) ok(`rep ${vp.name}: context pane visible`)
      else fail(`rep ${vp.name}: context pane missing`)
    } else {
      const drawerBtn = page.getByRole('button', { name: /Lead intelligence/ })
      if (await drawerBtn.count().catch(() => 0)) ok(`rep ${vp.name}: context drawer reachable`)
      else fail(`rep ${vp.name}: context drawer button missing`)
    }
    await axeCheck(page, `rep ${vp.name}`)
  }
  await page.close()
}

// ── ADMIN ────────────────────────────────────────────────────────────────────
{
  await context.clearCookies()
  const boot = await context.newPage()
  await boot.goto(`${base}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await boot.evaluate(() => localStorage.clear()).catch(() => {})
  await boot.close()
  const page = await login('hassan@scout.dev')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${base}/chats?view=all`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow <= 1) ok('admin 1440: overflow 0')
  else fail(`admin 1440: overflow ${overflow}`)
  const act = await page.getByRole('region', { name: 'Thread' }).getByRole('button', { name: 'Act' }).count().catch(() => 0)
  if (act) ok('admin 1440: Act menu present')
  else fail('admin 1440: Act menu missing')
  await axeCheck(page, 'admin 1440')
  await page.close()
}

await browser.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
