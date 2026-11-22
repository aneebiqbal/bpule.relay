import { chromium } from 'playwright'
import fs from 'node:fs'

/**
 * Midnight rollover across an authenticated session.
 *
 * The server runs with RELAY_TEST_CLOCK=1, so /api/test/clock can pin the
 * organization clock. The business date must advance at Asia/Karachi midnight
 * without a reload or logout.
 */
const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/final-program'
fs.mkdirSync(outDir, { recursive: true })
const log = (message) => console.log(`[midnight] ${message}`)

const TIMEZONE = 'Asia/Karachi'
// 2026-11-22 23:59:50 in Karachi == 2026-11-22 18:59:50 UTC
const BEFORE = '2026-11-22T18:59:50.000Z'
// 2026-11-23 00:00:10 in Karachi == 2026-11-22 19:00:10 UTC
const AFTER = '2026-11-22T19:00:10.000Z'

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

async function setClock(iso) {
  const response = await page.request.post(`${base}/api/test/clock`, { data: { iso } })
  if (!response.ok()) throw new Error(`setClock failed: ${response.status()} ${await response.text()}`)
  log(`clock pinned to ${iso}`)
}

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[type=email]', { timeout: 90000 })
await page.fill('input[type=email]', 'staging-operator@example.com')
await page.fill('input[type=password]', 'staging-pass-123')
await page.click('button:has-text("Sign in with password")')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 })
log(`login ok: ${page.url()}`)

// Pin the clock before the boundary, then load the dashboards.
await setClock(BEFORE)
await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const beforeText = await page.locator('body').innerText()
const beforeDate = (beforeText.match(/TODAY · ([A-Z]{3}, [A-Z]{3} \d{1,2})/) ?? [])[1] ?? null
log(`before: business date label = ${beforeDate}`)
await page.screenshot({ path: `${outDir}/06-midnight-before.png`, fullPage: false })

// Advance past local midnight WITHOUT reloading the page.
await setClock(AFTER)
// The shell re-checks on a capped timer and on focus; poll for the change.
let afterDate = null
for (let attempt = 0; attempt < 15; attempt += 1) {
  await page.waitForTimeout(5000)
  const text = await page.locator('body').innerText()
  afterDate = (text.match(/TODAY · ([A-Z]{3}, [A-Z]{3} \d{1,2})/) ?? [])[1] ?? null
  if (afterDate && afterDate !== beforeDate) break
}
log(`after: business date label = ${afterDate}`)
await page.screenshot({ path: `${outDir}/07-midnight-after.png`, fullPage: false })

log(`rollover without reload: ${beforeDate !== afterDate ? 'yes' : 'no'}`)
log(`same session (no login redirect): ${!page.url().includes('/login') ? 'yes' : 'no'}`)

// Release the clock so later runs are not pinned.
await page.request.delete(`${base}/api/test/clock`).catch(() => {})
await browser.close()
log('done')
