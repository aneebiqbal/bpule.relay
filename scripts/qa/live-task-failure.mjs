/** LIVE task-API failure: the thread must survive and the error must be friendly. */
import { chromium } from 'playwright'

const base = 'https://localhost:3000'
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

await page.goto(`${base}/chats?view=all`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.locator('ul[aria-label="Conversations"] li').first().click()
await page.waitForTimeout(3000)
log('selected:', page.url())

const threadBefore = await page.locator('section[aria-label="Conversation"]').isVisible()
await page.route('**/api/tasks**', (route) =>
  route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Tasks unavailable (live QA injection)' }) }),
)
const act = page.getByRole('region', { name: 'Thread' }).getByRole('button', { name: 'Act' })
await act.click()
await page.waitForTimeout(400)
await page.getByRole('menu').first().getByText('Request update', { exact: true }).click()
await page.waitForTimeout(1200)
const dialog = page.getByRole('dialog').last()
log('dialog visible:', await dialog.isVisible().catch(() => false))
// Fill required fields if present, then submit.
const title = dialog.getByPlaceholder('What should they do?')
if (await title.count().catch(() => 0)) await title.fill('Live QA task failure probe').catch(() => {})
const submit = dialog.getByRole('button', { name: /Assign|Send|Create|Submit|Request/i }).last()
log('submit present:', await submit.count().catch(() => 0))
let taskStatus = 'no-submit'
if (await submit.count().catch(() => 0)) {
  const respP = page.waitForResponse((r) => r.url().includes('/api/tasks') && r.request().method() === 'POST', { timeout: 20_000 }).catch(() => null)
  await submit.click()
  const resp = await respP
  taskStatus = resp ? String(resp.status()) : 'no response'
}
await page.waitForTimeout(2000)
const body = await page.locator('body').innerText()
const friendly = /Tasks unavailable|Could not|Something went wrong|error/i.test(body)
const raw = /neon|postgrest|\bSQL\b|relation "/i.test(body)
const threadAfter = await page.locator('section[aria-label="Conversation"]').isVisible()
log('TASK status:', taskStatus, '| friendly error:', friendly, '| raw text:', raw, '| thread visible:', threadAfter, '| thread before:', threadBefore)
await page.unroute('**/api/tasks**')
await browser.close()
