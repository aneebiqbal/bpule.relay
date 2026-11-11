/**
 * V6.1.1 multi-operator UI acceptance.
 *
 * Drives the real app in a browser: the admin management screen, the Manage
 * people dialog, and the operator's Rep Home. Also runs axe + overflow checks
 * on the surfaces the feature touches.
 *
 *   node scripts/qa/v611-multi-operator-ui.mjs [baseURL]
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'https://localhost:3443'
const axeSource = fs.readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const PASSWORD = 'scout-dev-password'

const results = []
const ok = (m) => results.push(`ok: ${m}`)
const fail = (m) => results.push(`FAIL: ${m}`)

process.on('uncaughtException', (err) => {
  console.error(err instanceof Error ? err.message : String(err))
  console.log(results.join('\n'))
  console.log(`\n${results.length - results.filter((r) => r.startsWith('FAIL')).length} passed, ${results.filter((r) => r.startsWith('FAIL')).length} failed — INCOMPLETE RUN`)
  process.exit(1)
})

const browser = await chromium.launch()
const sessions = []

async function login(email) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('#login-email', { timeout: 60_000 })
  let ready = false
  for (let i = 0; i < 5 && !ready; i += 1) {
    await page.fill('#login-email', email)
    await page.fill('#login-password', PASSWORD)
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
  return { context, page }
}

/** The channel child row that follows a person's header row. */
function channelRow(page, personName, channel) {
  const header = page.locator('tr', { hasText: personName }).first()
  const sibling = header.locator('xpath=following-sibling::tr[1]')
  return channel ? sibling.filter({ hasText: channel }) : sibling
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

async function overflowCheck(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow <= 1) ok(`${label}: overflow 0`)
  else fail(`${label}: overflow ${overflow}`)
}

async function bodyText(page) {
  return page.locator('body').innerText().catch(() => '')
}

const state = { added: false }

try {
  // ---- Admin: Team → Profiles is the one management screen ----
  const adminSession = await login('aneeb@scout.dev')
  sessions.push(adminSession)
  const admin = adminSession.page
  await admin.goto(`${base}/team/profiles`, { waitUntil: 'domcontentloaded', timeout: 90_000 })

  let body = ''
  for (let attempt = 0; attempt < 8; attempt += 1) {
    body = await bodyText(admin)
    if (body.includes('Fizza')) break
    await admin.waitForTimeout(1000)
  }
  if (body.includes('Fizza')) ok('admin profiles: Fizza row present')
  else fail('admin profiles: Fizza row missing')

  for (const expected of ['Primary Hassan', 'Backups Madiha']) {
    if (body.includes(expected)) ok(`admin profiles: "${expected}" present`)
    else fail(`admin profiles: "${expected}" missing`)
  }

  // ---- The plan is one shared requirement, with named contributors ----
  await admin.goto(`${base}/admin/targets`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  let targetsBody = ''
  for (let attempt = 0; attempt < 20; attempt += 1) {
    targetsBody = await bodyText(admin)
    if (targetsBody.includes('Fizza')) break
    await admin.waitForTimeout(1000)
  }
  if (targetsBody.includes('Fizza')) ok('daily targets: Fizza lane present')
  else fail('daily targets: Fizza lane missing')
  if (targetsBody.includes('Applications')) ok('daily targets: Applications lane present')
  else fail('daily targets: Applications lane missing')

  await admin.goto(`${base}/team/profiles`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await admin.waitForTimeout(2500)

  // ---- Manage people: add Ahmad as an active operator ----
  const fizzaRow = channelRow(admin, 'Fizza Iqbal', 'Upwork')
  const manageButtons = fizzaRow.getByRole('button', { name: 'Manage people' })
  if ((await manageButtons.count()) === 0) fail('admin profiles: no Manage people button on the Fizza Upwork row')
  else {
    await manageButtons.first().click()
    await admin.waitForSelector('div[role="dialog"]', { timeout: 15_000 })
    const dialog = admin.locator('div[role="dialog"]').first()
    await dialog.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    const dialogText = await dialog.innerText()
    for (const expected of ['PRIMARY OWNER', 'ACTIVE OPERATORS', 'BACKUPS']) {
      if (dialogText.includes(expected)) ok(`manage people: "${expected}" section present`)
      else fail(`manage people: "${expected}" section missing`)
    }

    // Ahmad is listed under Active operators and is not yet checked.
    const ahmadLabel = dialog.locator('label', { hasText: 'Ahmad' }).first()
    const ahmadCheckbox = ahmadLabel.locator('input[type="checkbox"]')
    if ((await ahmadCheckbox.count()) === 0) fail('manage people: Ahmad not offered as an operator')
    else {
      const checked = await ahmadCheckbox.isChecked()
      if (checked) fail('manage people: Ahmad was already an operator (fixture not clean)')
      else {
        await ahmadCheckbox.check()
        await dialog.getByRole('button', { name: 'Save people' }).click()
        await admin.waitForTimeout(2500)
        state.added = true
        const after = await bodyText(admin)
        if (after.includes('Operators Ahmad')) ok('admin profiles: Ahmad listed as an operator after save')
        else if (after.includes('Ahmad')) ok('admin profiles: Ahmad present after save')
        else fail('admin profiles: Ahmad missing after save')
      }
    }
  }

  // ---- Responsive + axe on the management screen ----
  for (const vp of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }, { w: 768, h: 1024 }, { w: 375, h: 812 }]) {
    await admin.setViewportSize({ width: vp.w, height: vp.h })
    await admin.waitForTimeout(500)
    await overflowCheck(admin, `admin profiles ${vp.w}`)
  }
  await admin.setViewportSize({ width: 1440, height: 900 })
  await axeCheck(admin, 'admin profiles 1440')

  // ---- Rep Home: Ahmad sees Fizza as an active operator ----
  const ahmadSession = await login('ahmad@scout.dev')
  sessions.push(ahmadSession)
  const ahmad = ahmadSession.page
  let repBody = ''
  for (let attempt = 0; attempt < 8; attempt += 1) {
    repBody = await bodyText(ahmad)
    if (repBody.includes('Fizza')) break
    await ahmad.waitForTimeout(1000)
  }
  if (repBody.includes('Active operator')) ok('rep home: "Active operator" label present')
  else fail('rep home: "Active operator" label missing')
  if (repBody.includes('your contribution')) ok('rep home: "your contribution" present')
  else fail('rep home: "your contribution" missing')
  await ahmad.setViewportSize({ width: 375, height: 812 })
  await ahmad.waitForTimeout(500)
  await overflowCheck(ahmad, 'rep home 375')
  await axeCheck(ahmad, 'rep home 375')
} finally {
  // Leave production exactly as it was found.
  if (state.added) {
    const cleanupSession = await login('aneeb@scout.dev').catch(() => null)
    if (cleanupSession) {
      sessions.push(cleanupSession)
      const cleanup = cleanupSession.page
      try {
        await cleanup.goto(`${base}/team/profiles`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        await cleanup.waitForTimeout(2500)
        const row = channelRow(cleanup, 'Fizza Iqbal', 'Upwork')
        const buttons = row.getByRole('button', { name: 'Manage people' })
        if ((await buttons.count()) > 0) {
          await buttons.first().click()
          await cleanup.waitForSelector('div[role="dialog"]', { timeout: 15_000 })
          const dialog = cleanup.locator('div[role="dialog"]')
          const ahmadCheckbox = dialog.locator('label', { hasText: 'Ahmad' }).first().locator('input[type="checkbox"]')
          if ((await ahmadCheckbox.count()) > 0 && (await ahmadCheckbox.isChecked())) {
            await ahmadCheckbox.uncheck()
            await dialog.getByRole('button', { name: 'Save people' }).click()
            await cleanup.waitForTimeout(2500)
          }
        }
      } catch (error) {
        console.error('cleanup failed:', error instanceof Error ? error.message : error)
      }
    }
  }
  for (const session of sessions) await session.context.close().catch(() => {})
  await browser.close()
}

console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
