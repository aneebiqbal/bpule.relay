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
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email', { timeout: 15_000 })
  await page.fill('#login-email', email)
  await page.fill('#login-password', 'scout-dev-password')
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 60_000 })
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
    await page.goto(`${base}/chats?view=waiting_me`, { waitUntil: 'domcontentloaded' })
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
  await page.goto(`${base}/chats?view=all`, { waitUntil: 'domcontentloaded' })
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

// ── WORK MANAGEMENT (REP) ────────────────────────────────────────────────────
{
  await context.clearCookies()
  const page = await login('dawood@scout.dev')
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (homeOverflow <= 1) ok(`home ${vp.name}: overflow 0`)
    else fail(`home ${vp.name}: overflow ${homeOverflow}`)

    await page.goto(`${base}/tasks`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const tasksOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (tasksOverflow <= 1) ok(`tasks ${vp.name}: overflow 0`)
    else fail(`tasks ${vp.name}: overflow ${tasksOverflow}`)
    await axeCheck(page, `tasks ${vp.name}`)
  }
  // Assigned-work panel + metric destinations at desktop width.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const repliesLink = await page.getByRole('link', { name: /replies waiting/ }).count().catch(() => 0)
  if (repliesLink) ok('home 1440: replies waiting destination present')
  else fail('home 1440: replies waiting destination missing')
  const waitingClients = await page.getByRole('link', { name: /waiting on clients/ }).count().catch(() => 0)
  if (waitingClients) ok('home 1440: waiting on clients destination present')
  else fail('home 1440: waiting on clients destination missing')
  await axeCheck(page, 'home 1440')

  // Task detail drawer + conversation composer.
  await page.goto(`${base}/tasks?view=today`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const firstRow = page.locator('table tbody tr').first()
  if (await firstRow.count().catch(() => 0)) {
    await firstRow.click()
    await page.waitForTimeout(1500)
    const noteBox = page.getByPlaceholder(/internal note/i)
    if (await noteBox.count().catch(() => 0)) ok('task detail: conversation composer reachable')
    else fail('task detail: conversation composer missing')
    await axeCheck(page, 'task detail 1440')
  } else {
    ok('task detail: no rows for this rep (drawer check skipped)')
  }
  await page.close()
}

// ── WORK MANAGEMENT (ADMIN) ──────────────────────────────────────────────────
{
  await context.clearCookies()
  const page = await login('hassan@scout.dev')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const waiting = await page.getByRole('link', { name: /^1 waiting/ }).count().catch(() => 0)
  if (waiting) ok('admin home: waiting task exception present')
  else fail('admin home: waiting task exception missing')
  await axeCheck(page, 'admin home 1440')

  await page.goto(`${base}/tasks?view=transfers`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow <= 1) ok('team work 1440: overflow 0')
  else fail(`team work 1440: overflow ${overflow}`)
  const transfersTab = await page.getByRole('link', { name: /Transfers/ }).count().catch(() => 0)
  if (transfersTab) ok('team work 1440: Transfers view present')
  else fail('team work 1440: Transfers view missing')
  await axeCheck(page, 'team work 1440')
  await page.close()
}

await browser.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
