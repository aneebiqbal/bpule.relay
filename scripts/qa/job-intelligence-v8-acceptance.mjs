import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/staging-v8'
fs.mkdirSync(outDir, { recursive: true })
const log = (message) => console.log(`[v8-accept] ${message}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[type=email]', { timeout: 90000 })
await page.fill('input[type=email]', 'staging-operator@example.com')
await page.fill('input[type=password]', 'staging-pass-123')
await page.click('button:has-text("Sign in with password")')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 })
log(`login ok: ${page.url()}`)

// 1. Prepared view shows the ready package.
await page.goto(`${base}/jobs?view=prepared`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Prepared', { timeout: 90000 })
await page.waitForTimeout(2500)
const preparedText = await page.locator('body').innerText()
log(`ready package shown: ${/Full-Stack Developer/.test(preparedText)}`)
log(`status ready: ${/ready/i.test(preparedText)}`)
await page.screenshot({ path: `${outDir}/01-prepared-ready.png`, fullPage: true })

// 2. Open the prepared job, check the suggestions panel.
const card = page.locator('a[href*="/jobs/"]').filter({ hasText: 'Full-Stack Developer' }).first()
const href = await card.getAttribute('href')
await page.goto(`${base}${href}`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Full-Stack Developer', { timeout: 60000 })
await page.waitForTimeout(5000)
const detailText = await page.locator('body').innerText()
log(`job detail: ${(await page.locator('h1').first().innerText()).slice(0, 70)}`)
log(`pakistan verdict: ${/Pakistan:/.test(detailText)}`)
log(`suggestions present: ${/Suggested improvements/i.test(detailText)}`)
await page.screenshot({ path: `${outDir}/02-detail-suggestions.png`, fullPage: true })

// 3. Accept the first suggestion and confirm a new version is saved.
const before = await page.locator('body').innerText()
const accept = page.locator('button:has-text("Accept")').first()
if (await accept.count()) {
  await accept.click()
  await page.waitForTimeout(2500)
  const after = await page.locator('body').innerText()
  log(`suggestion accepted: ${/Suggestion accepted/.test(after)}`)
  log(`version bumped: ${/[vV][2-9]/.test(after)}`)
} else {
  log('no suggestion to accept')
}
await page.screenshot({ path: `${outDir}/03-after-accept.png`, fullPage: true })

await browser.close()
log('done')
