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

// A crash mid-run must still report what already passed.
process.on('uncaughtException', (err) => {
  console.error(err instanceof Error ? err.message : String(err))
  console.log(results.join('\n'))
  const failed = results.filter((r) => r.startsWith('FAIL')).length
  console.log(`\n${results.length - failed} passed, ${failed} failed — INCOMPLETE RUN`)
  process.exit(1)
})

const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
// The active identity is per-user; forcing one identity across every session
// would stop another rep's workspace from resolving.
const ACTIVE_IDENTITY = {
  'dawood@scout.dev': 'c26a685b-a18b-4672-b7ad-a55e211539b2',
}

async function login(email, attempts = 3) {
  let lastErr
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const page = await context.newPage()
    try {
      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.evaluate((id) => {
        try {
          if (id) localStorage.setItem('relay-active-identity', id)
          else localStorage.removeItem('relay-active-identity')
        } catch {}
      }, ACTIVE_IDENTITY[email] ?? '')
      await page.waitForSelector('#login-email', { timeout: 60_000 })
      // Filling before hydration is lost when React re-renders the controlled
      // inputs, leaving the submit button disabled. Re-fill until it enables.
      let ready = false
      for (let attempt = 0; attempt < 5 && !ready; attempt++) {
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
      // The auth proxy occasionally times out; a fresh page recovers.
      console.error(`login attempt ${attempt}/${attempts} failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
      await page.close().catch(() => {})
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  throw lastErr
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
    await page.goto(`${base}/chats?view=waiting_me`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
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
      const drawerBtn = page.getByRole('button', { name: /Details/ })
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
  await boot.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {})
  await boot.evaluate(() => localStorage.clear()).catch(() => {})
  await boot.close()
  const page = await login('hassan@scout.dev')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${base}/chats?view=all`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForTimeout(2500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow <= 1) ok('admin 1440: overflow 0')
  else fail(`admin 1440: overflow ${overflow}`)
  // The intervention menu renders once a conversation is auto-selected, which
  // waits on the queue fetch.
  const moreMenu = page.getByRole('button', { name: 'More' })
  if (await moreMenu.first().isVisible({ timeout: 15_000 }).catch(() => false)) {
    ok('admin 1440: More menu present')
  } else {
    fail('admin 1440: More menu missing')
  }
  await axeCheck(page, 'admin 1440')
  await page.close()
}

// ── WORK MANAGEMENT (REP) ────────────────────────────────────────────────────
{
  await context.clearCookies()
  const page = await login('dawood@scout.dev')
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForTimeout(2000)
    const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (homeOverflow <= 1) ok(`home ${vp.name}: overflow 0`)
    else fail(`home ${vp.name}: overflow ${homeOverflow}`)

    await page.goto(`${base}/tasks`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForTimeout(2000)
    const tasksOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (tasksOverflow <= 1) ok(`tasks ${vp.name}: overflow 0`)
    else fail(`tasks ${vp.name}: overflow ${tasksOverflow}`)

    if (vp.name === '375') {
      // The tab bar is wider than the viewport; it must scroll inside its own
      // container rather than stretching the document.
      const tabBar = await page.evaluate(() => {
        const nav = document.querySelector('nav.min-w-max')
        const wrap = nav?.parentElement
        return nav && wrap
          ? {
              overflowX: getComputedStyle(wrap).overflowX,
              clientWidth: wrap.clientWidth,
              scrollWidth: wrap.scrollWidth,
            }
          : null
      })
      if (tabBar && tabBar.overflowX === 'auto' && tabBar.scrollWidth > tabBar.clientWidth) {
        ok('tasks 375: tab bar scrolls inside its container')
      } else {
        fail(`tasks 375: tab bar not contained ${JSON.stringify(tabBar)}`)
      }

      // Mobile cards replace the desktop table, keeping the primary action.
      // The default "Active" tab can be legitimately empty, so check a view
      // that has work.
      await page.goto(`${base}/tasks?view=overdue`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
      await page.waitForTimeout(2500)
      const cards = page.locator('ul.md\\:hidden > li')
      const cardCount = await cards.count().catch(() => 0)
      if (cardCount > 0) ok(`tasks 375: ${cardCount} mobile task cards`)
      else fail('tasks 375: mobile task cards missing')

      if (cardCount > 0) {
        const action = await cards.first().getByRole('link').count().catch(() => 0)
        if (action > 0) ok('tasks 375: card primary action present')
        else fail('tasks 375: card primary action missing')

        await cards.first().getByRole('button').first().click().catch(() => {})
        // The drawer is URL-backed (?task=…), so wait for the navigation.
        await page.waitForURL(/[?&]task=/, { timeout: 20_000 }).catch(() => {})
        await page.waitForTimeout(2000)
        const drawer = await page.getByRole('dialog', { name: 'Task' }).isVisible().catch(() => false)
        if (drawer) ok('tasks 375: task drawer opens')
        else fail('tasks 375: task drawer did not open')
        await page.keyboard.press('Escape')
        await page.waitForTimeout(800)
        const stillOpen = await page.getByRole('dialog', { name: 'Task' }).isVisible().catch(() => false)
        if (!stillOpen) ok('keyboard: Escape closes the task drawer')
        else fail('keyboard: Escape did not close the task drawer')
      }
    }
    await axeCheck(page, `tasks ${vp.name}`)
  }
  // Assigned-work panel + metric destinations at desktop width.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForTimeout(1500)
  const repliesLink = await page.getByRole('link', { name: /replies waiting/ }).count().catch(() => 0)
  if (repliesLink) ok('home 1440: replies waiting destination present')
  else fail('home 1440: replies waiting destination missing')
  const waitingClients = await page.getByRole('link', { name: /waiting on clients/ }).count().catch(() => 0)
  if (waitingClients) ok('home 1440: waiting on clients destination present')
  else fail('home 1440: waiting on clients destination missing')
  await axeCheck(page, 'home 1440')

  // Task detail drawer + conversation composer.
  await page.goto(`${base}/tasks?view=today`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
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
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForTimeout(2000)
  const waiting = await page.getByRole('link', { name: /^1 waiting/ }).count().catch(() => 0)
  if (waiting) ok('admin home: waiting task exception present')
  else fail('admin home: waiting task exception missing')
  await axeCheck(page, 'admin home 1440')

  await page.goto(`${base}/tasks?view=transfers`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
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

// ── KEYBOARD ─────────────────────────────────────────────────────────────────
{
  await context.clearCookies()
  const page = await login('dawood@scout.dev')
  await page.setViewportSize({ width: 1440, height: 900 })

  // Sidebar: the collapse control is a real button and Tab moves into the nav.
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForTimeout(2000)
  const sidebarToggle = page.getByRole('button', { name: /Collapse sidebar|Open navigation/ }).first()
  if (await sidebarToggle.count().catch(() => 0)) {
    await sidebarToggle.click().catch(() => {})
    await page.keyboard.press('Tab')
    const focusInNav = await page.evaluate(() => Boolean(document.activeElement?.closest('nav, aside')))
    if (focusInNav) ok('keyboard: Tab from the sidebar control lands in navigation')
    else fail('keyboard: Tab from the sidebar control did not land in navigation')
  } else {
    fail('keyboard: sidebar control not found')
  }

  // Inbox composer: the message box is reachable and focusable.
  await page.goto(`${base}/chats?view=waiting_me`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForTimeout(2500)
  const composer = page.getByRole('textbox', { name: 'Your message' })
  if (await composer.count().catch(() => 0)) {
    await composer.first().click().catch(() => {})
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Your message')
    if (focused) ok('keyboard: Inbox composer is focusable')
    else fail('keyboard: Inbox composer did not take focus')
  } else {
    fail('keyboard: Inbox composer not found')
  }
  await page.close()
}

await browser.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
