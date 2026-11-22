import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/final-program'
fs.mkdirSync(outDir, { recursive: true })
const log = (message) => console.log(`[final-accept] ${message}`)

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[type=email]', { timeout: 90000 })
await page.fill('input[type=email]', 'staging-operator@example.com')
await page.fill('input[type=password]', 'staging-pass-123')
await page.click('button:has-text("Sign in with password")')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 })
log(`login ok: ${page.url()}`)

// 1. Jobs workspace tabs.
await page.goto(`${base}/jobs?view=shortlist`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const tabs = await page.locator('nav[aria-label="Job views"] a').allInnerTexts()
log(`tabs: ${JSON.stringify(tabs)}`)
await page.screenshot({ path: `${outDir}/01-jobs-ready-today.png`, fullPage: true })

// 2. In Progress view.
await page.goto(`${base}/jobs?view=in-progress`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const inProgressText = await page.locator('body').innerText()
log(`in-progress rendered: ${!/Job views/.test(inProgressText) ? 'yes' : 'no'} · empty-state: ${/No jobs in this view/.test(inProgressText)}`)
await page.screenshot({ path: `${outDir}/02-jobs-in-progress.png`, fullPage: true })

// 3. History view.
await page.goto(`${base}/jobs?view=history`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const historyText = await page.locator('body').innerText()
log(`history rendered: ${!/Job views/.test(historyText) ? 'yes' : 'no'} · empty-state: ${/No jobs in this view/.test(historyText)}`)
await page.screenshot({ path: `${outDir}/03-jobs-history.png`, fullPage: true })

// 4. Screening answers on a prepared job detail.
await page.goto(`${base}/jobs?view=prepared`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const href = await page.locator('a[href*="/jobs/"]').first().getAttribute('href').catch(() => null)
if (href) {
  await page.goto(`${base}${href}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  const detail = await page.locator('body').innerText()
  log(`screening panel: ${/Screening answers/i.test(detail)}`)
  log(`needs-human answers: ${(detail.match(/Needs your answer/g) ?? []).length}`)
  log(`candidate fit label: ${/Candidate fit/i.test(detail)}`)
  await page.screenshot({ path: `${outDir}/04-job-detail-screening.png`, fullPage: true })
} else {
  log('no prepared job to open')
}

// 5. Mobile viewport.
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
await mobile.goto(`${base}/jobs?view=shortlist`, { waitUntil: 'networkidle' })
await mobile.waitForTimeout(2000)
const mobileTabs = await mobile.locator('nav[aria-label="Job views"] a').allInnerTexts()
log(`mobile tabs: ${JSON.stringify(mobileTabs)}`)
await mobile.screenshot({ path: `${outDir}/05-mobile-jobs.png`, fullPage: true })

await browser.close()
log('done')
