/** LIVE error-path checks: AI, notes and task API failures must degrade gracefully. */
import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const IDENTITY = 'c26a685b-a18b-4672-b7ad-a55e211539b2'

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
await context.addInitScript((id) => {
  try { localStorage.setItem('relay-active-identity', id) } catch {}
}, IDENTITY)
const page = await context.newPage()
const log = (...a) => console.log(...a)

async function login(email) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email)
  await page.locator('input[type="password"], input[name="password"]').first().fill('scout-dev-password')
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
  await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 30_000 })
  await page.waitForTimeout(1500)
}

await login('dawood@scout.dev')
await page.goto(`${base}/chats?view=waiting_me`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.locator('ul[aria-label="Conversations"] li').first().click()
await page.waitForTimeout(3000)
log('selected:', page.url())

// ── AI generation failure ───────────────────────────────────────────────────
await page.route('**/conversation/compose', (route) =>
  route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'AI unavailable (live QA injection)' }) }),
)
await page.getByRole('button', { name: /Generate with AI|Write with AI|Improve with AI/ }).first().click()
await page.waitForTimeout(2500)
const aiError = await page.locator('text=/AI unavailable|Could not write the message/').first().isVisible().catch(() => false)
const threadStillVisible = await page.locator('section[aria-label="Conversation"]').isVisible()
const composerStillVisible = await page.getByRole('textbox', { name: 'Your message' }).isVisible()
log('AI failure: toast=', aiError, '| thread visible=', threadStillVisible, '| composer visible=', composerStillVisible)
const aiRaw = await page.locator('body').innerText()
log('AI failure: raw Neon/Postgres text=', /neon|postgrest|\bSQL\b|relation "/i.test(aiRaw))
await page.unroute('**/conversation/compose')

// ── Notes failure ────────────────────────────────────────────────────────────
await page.route('**/api/notes**', (route) =>
  route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Notes unavailable (live QA injection)' }) }),
)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(3500)
const notesError = await page.locator('text=/Notes could not be loaded|Notes unavailable/').first().isVisible().catch(() => false)
const threadAfterNotes = await page.locator('section[aria-label="Conversation"]').isVisible()
log('Notes failure: friendly error=', notesError, '| thread visible=', threadAfterNotes)
await page.unroute('**/api/notes**')

// ── Task API failure (manager/admin) ────────────────────────────────────────
await page.waitForTimeout(500)
await context.clearCookies()
await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear()).catch(() => {})
await login('hassan@scout.dev')
await page.goto(`${base}/chats?view=all`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
const act = page.getByRole('button', { name: /^Act$/ }).first()
log('Act present (admin):', await act.count())
if (await act.count()) {
  await act.click()
  await page.waitForTimeout(400)
  const menu = page.getByRole('menu').first()
  const requestUpdate = menu.getByText('Request update', { exact: true })
  log('Request update present:', await requestUpdate.count())
  await page.route('**/api/tasks**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Tasks unavailable (live QA injection)' }) }),
  )
  if (await requestUpdate.count()) {
    await requestUpdate.click()
    await page.waitForTimeout(1500)
    // The dialog may be open; try to submit.
    const submit = page.getByRole('dialog').last().getByRole('button', { name: /Send|Create|Submit|Request/i }).first()
    if (await submit.count().catch(() => 0)) {
      await submit.click()
      await page.waitForTimeout(2500)
    }
    const taskError = await page.locator('text=/Tasks unavailable|Could not|error/').first().isVisible().catch(() => false)
    const threadAfterTask = await page.locator('section[aria-label="Conversation"]').isVisible()
    log('Task failure: friendly error=', taskError, '| thread visible=', threadAfterTask)
  }
  await page.unroute('**/api/tasks**')
}

await page.screenshot({ path: 'artifacts/inbox-live-error-paths.png', fullPage: false })
await browser.close()
