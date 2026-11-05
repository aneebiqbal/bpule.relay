/** LIVE manager/admin intervention check (Neon production, HTTPS dev server). */
import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const REP_ID = 'ec4f844d-24ca-4fb5-ae4f-4138244abace' // Dawood

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
const page = await context.newPage()
const log = (...a) => console.log(...a)

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill('hassan@scout.dev')
await page.locator('input[type="password"], input[name="password"]').first().fill('scout-dev-password')
await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 30_000 })
await page.waitForTimeout(1500)
const me = await (await context.request.get(`${base}/api/me/status`)).json()
log('AUTH /api/me/status:', JSON.stringify(me))

page.on('response', (r) => {
  if (r.url().includes('/chats?') && r.request().resourceType() === 'fetch') log('NAV fetch:', r.status(), r.url().slice(0, 140))
})
await page.goto(`${base}/chats?view=all`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
log('url:', page.url())

// Filters drawer
await page.getByRole('button', { name: /Filters/ }).click()
await page.waitForTimeout(400)
const dialog = page.getByRole('dialog', { name: 'Filters' })
log('filters visible:', await dialog.isVisible())
const selects = dialog.locator('select')
const count = await selects.count()
log('filter selects:', count)
for (let i = 0; i < count; i++) {
  const label = await dialog.locator('label').nth(i).innerText().catch(() => '')
  log(`  select ${i}: ${label.replace(/\n/g, ' ')}`)
}

// Choose Rep = Dawood (select 1) and Condition = Waiting >12h (select 6)
const repSelect = dialog.locator('label').nth(1).locator('select')
await repSelect.selectOption(REP_ID)
await page.waitForTimeout(1200)
log('after rep select, url:', page.url(), '| value:', await repSelect.inputValue().catch(() => '?'))
const condSelect = dialog.locator('label').nth(6).locator('select')
await condSelect.selectOption('over12h')
await page.waitForTimeout(1200)
log('after condition select, url:', page.url(), '| value:', await condSelect.inputValue().catch(() => '?'))
await page.keyboard.press('Escape')
await page.waitForTimeout(2500)
log('url after filters:', page.url())
const tabs = await page.locator('nav[aria-label="Conversation views"] a, nav[aria-label="Conversation views"] button').allInnerTexts()
log('tabs:', tabs.map((t) => t.replace(/\n/g, ' ')).join(' | '))
const rows = await page.locator('ul[aria-label="Conversations"] li').allInnerTexts()
log('rows:', rows.length, '| first:', rows[0]?.replace(/\n/g, ' | ').slice(0, 140))

if (rows.length > 0) {
  await page.locator('ul[aria-label="Conversations"] li').first().click()
  await page.waitForTimeout(3000)
  log('url after select:', page.url())
  const act = page.getByRole('region', { name: 'Thread' }).getByRole('button', { name: 'Act' })
  log('Act button present:', await act.count())
  if (await act.count()) {
    await act.click()
    await page.waitForTimeout(400)
    const menu = page.getByRole('menu').first()
    const menuText = await menu.innerText().catch(() => '')
    log('menu items:', menuText.replace(/\n/g, ' | '))
    const assign = menu.getByText('Assign task', { exact: true })
    log('Assign task present:', await assign.count())
    if (await assign.count()) {
      await assign.click()
      await page.waitForTimeout(1200)
      const taskDialog = page.getByRole('dialog').last()
      log('task dialog visible:', await taskDialog.isVisible().catch(() => false))
      log('task dialog text:', (await taskDialog.innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 220))
      await page.keyboard.press('Escape').catch(() => {})
    }
  }
}
await page.screenshot({ path: 'artifacts/inbox-live-admin.png', fullPage: false })
await browser.close()
