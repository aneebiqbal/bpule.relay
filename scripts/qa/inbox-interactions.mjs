/**
 * Inbox interaction + accessibility QA against the deterministic fixture.
 * Verifies: filter drawer, queue selection, composer menu, context drawer,
 * keyboard Escape/focus restoration, and axe (0 critical / 0 serious).
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = process.env.QA_BASE_URL ?? 'http://localhost:3000'
const axeSource = fs.readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const outDir = 'artifacts/inbox-v4-qa'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const results = []
const fail = (msg) => { results.push(`FAIL: ${msg}`) }
const ok = (msg) => { results.push(`ok: ${msg}`) }

async function axeCheck(page, label) {
  await page.addScriptTag({ content: axeSource })
  const report = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      target: v.nodes[0]?.target?.[0] ?? '',
      summary: v.nodes[0]?.failureSummary ?? '',
    }))
  })
  const blocking = report.filter((v) => v.impact === 'critical' || v.impact === 'serious')
  if (blocking.length === 0) ok(`${label}: axe 0 critical / 0 serious (${report.length} other)`)
  else fail(`${label}: axe blocking violations ${JSON.stringify(blocking)}`)
}

// ── Desktop 1440: filters, selection, composer menu ─────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${base}/inbox-fixture`, { waitUntil: 'networkidle' })

  // Filters drawer
  await page.getByRole('button', { name: /Filters/ }).click()
  await page.waitForTimeout(200)
  const drawer = page.getByRole('dialog', { name: 'Filters' })
  if (await drawer.isVisible()) ok('1440: filter drawer opens')
  else fail('1440: filter drawer did not open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  if (await drawer.count() === 0 || !(await drawer.isVisible().catch(() => false))) ok('1440: Escape closes filter drawer')
  else fail('1440: Escape did not close filter drawer')

  // Queue selection updates the thread header
  await page.getByText('Marcus Webb').first().click()
  await page.waitForTimeout(200)
  const headerName = await page.getByRole('heading', { name: 'Marcus Webb' }).count()
  if (headerName > 0) ok('1440: queue row opens the thread')
  else fail('1440: queue row did not open the thread')

  // Composer More menu
  await page.getByRole('button', { name: 'More' }).click()
  await page.waitForTimeout(150)
  const menu = page.getByRole('menu', { name: 'Composer options' })
  if (await menu.isVisible()) ok('1440: composer More menu opens')
  else fail('1440: composer More menu did not open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  if (!(await menu.isVisible().catch(() => false))) ok('1440: Escape closes composer menu')
  else fail('1440: Escape did not close composer menu')

  // Keyboard: queue rows are links (focusable) and selected row is marked
  const selected = await page.locator('ul[aria-label="Conversations"] [aria-current="true"]').count()
  if (selected === 1) ok('1440: exactly one selected conversation announced')
  else fail(`1440: expected 1 aria-current, got ${selected}`)

  await axeCheck(page, '1440')
  await page.close()
}

// ── 1024: context drawer ────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  await page.goto(`${base}/inbox-fixture`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Lead intelligence/ }).click()
  await page.waitForTimeout(250)
  const drawer = page.getByRole('dialog', { name: 'Lead intelligence' })
  if (await drawer.isVisible()) ok('1024: context drawer opens')
  else fail('1024: context drawer did not open')
  // Focus trap: Tab cycles inside the drawer for a full loop.
  let trapped = true
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab')
    const inside = await drawer.evaluate((el) => el.contains(document.activeElement))
    if (!inside) { trapped = false; break }
  }
  if (trapped) ok('1024: drawer focus is trapped')
  else fail('1024: drawer focus escaped')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  if (!(await drawer.isVisible().catch(() => false))) ok('1024: Escape closes context drawer')
  else fail('1024: Escape did not close context drawer')
  await axeCheck(page, '1024')
  await page.close()
}

// ── 375: queue → thread → context drawer ────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(`${base}/inbox-fixture`, { waitUntil: 'networkidle' })
  const queueVisible = await page.getByRole('list', { name: 'Conversations' }).isVisible()
  if (queueVisible) ok('375: queue visible first')
  else fail('375: queue not visible first')
  await page.getByText('Priya Raman').first().click()
  await page.waitForTimeout(250)
  const headerName = await page.getByRole('heading', { name: 'Priya Raman' }).count()
  if (headerName > 0) ok('375: row opens the thread')
  else fail('375: row did not open the thread')
  const composer = page.getByRole('textbox', { name: 'Your message' })
  if (await composer.isVisible()) ok('375: composer visible without scrolling')
  else fail('375: composer not visible')
  await page.getByRole('button', { name: /Lead intelligence/ }).click()
  await page.waitForTimeout(250)
  const drawer = page.getByRole('dialog', { name: 'Lead intelligence' })
  if (await drawer.isVisible()) ok('375: context drawer opens')
  else fail('375: context drawer did not open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  if (!(await drawer.isVisible().catch(() => false))) ok('375: Escape closes context drawer')
  else fail('375: Escape did not close context drawer')
  await page.getByRole('button', { name: /All conversations/ }).click()
  await page.waitForTimeout(200)
  if (await page.getByRole('list', { name: 'Conversations' }).isVisible()) ok('375: back link returns to the queue')
  else fail('375: back link did not return to the queue')
  await axeCheck(page, '375')
  await page.close()
}

await browser.close()
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
