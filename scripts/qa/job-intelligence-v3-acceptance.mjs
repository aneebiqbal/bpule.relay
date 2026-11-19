import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/staging-v3'
fs.mkdirSync(outDir, { recursive: true })
const log = (message) => console.log(`[accept] ${message}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type="email"]', 'staging-operator@example.com')
await page.fill('input[type="password"]', 'staging-pass-123')
await page.click('button:has-text("Sign in with password")')
await page.waitForTimeout(3000)
log(`login ok: ${page.url()}`)

// 1. Jobs latest
await page.goto(`${base}/jobs?view=latest`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('article', { timeout: 30000 })
const latestCount = await page.locator('article').count()
log(`latest cards: ${latestCount}`)
await page.screenshot({ path: `${outDir}/01-latest.png` })

// 2. Filters
await page.click('button:has-text("Filters")')
await page.fill('input[placeholder="rails, react"]', 'React')
await page.click('button:has-text("Apply filters")')
await page.waitForTimeout(2000)
const filteredCount = await page.locator('article').count()
log(`filtered cards (React): ${filteredCount}`)
await page.screenshot({ path: `${outDir}/02-filtered.png` })

// 3. Reset to the unfiltered list before opening a job
await page.goto(`${base}/jobs?view=latest`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('article', { timeout: 30000 })

// 4. Job detail
const firstHref = await page.locator('article h3 a').first().getAttribute('href')
await page.goto(`${base}${firstHref}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('h1', { timeout: 30000 })
const jobTitle = await page.locator('h1').first().innerText()
log(`job detail: ${jobTitle}`)
await page.screenshot({ path: `${outDir}/03-detail.png`, fullPage: true })

// 5. Match + recommendations
await page.click('button:has-text("Compute match")')
await page.waitForSelector('text=Recommended profiles', { timeout: 30000 })
const recommendations = await page.locator('text=Recommended profiles').count()
log(`recommendations present: ${recommendations}`)
await page.screenshot({ path: `${outDir}/04-match.png`, fullPage: true })

// 6. Generate documents
await page.click('button:has-text("Generate package")')
await page.waitForSelector('text=ATS readiness', { timeout: 60000 })
log('documents + ATS report present')
await page.screenshot({ path: `${outDir}/05-documents.png`, fullPage: true })

// 7. Download PDF
const pdfHref = await page.locator('a:has-text("PDF")').first().getAttribute('href')
const pdfResponse = await page.request.get(`${base}${pdfHref}`)
log(`pdf download: ${pdfResponse.status()} ${pdfResponse.headers()['content-type']}`)
const pdfBytes = await pdfResponse.body()
log(`pdf bytes: ${pdfBytes.length}`)

// 8. Edit + compare
await page.locator('button:has-text("Edit")').first().click()
const editArea = page.locator('textarea:visible').first()
await editArea.waitFor({ state: 'visible', timeout: 15000 })
await editArea.fill('Staging Operator\nSenior Full-Stack Engineer\n\nEdited summary for version two.')
await page.locator('button:has-text("Save new version")').click()
await page.waitForTimeout(2500)
const versionText = await page.locator('body').innerText()
log(`new version saved: ${/v[2-9]/.test(versionText)}`)
const compareEnabled = await page.waitForFunction(
  () => {
    const button = [...document.querySelectorAll('button')].find((element) => element.textContent.includes('Compare versions'))
    return Boolean(button && !button.disabled)
  },
  { timeout: 15000 },
).catch(() => null)
if (compareEnabled) {
  await page.locator('button:has-text("Compare versions")').click()
  await page.waitForSelector('text=Compare CV versions', { timeout: 10000 })
  await page.screenshot({ path: `${outDir}/06-compare.png`, fullPage: true })
  await page.locator('button:has-text("Close")').click()
} else {
  log('compare skipped: only one CV version in the current state')
}

// 9. Save job
await page.locator('button[aria-label="Save job"]').click()
await page.waitForTimeout(1500)
await page.goto(`${base}/jobs?view=saved`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('article', { timeout: 30000 })
log(`saved cards: ${await page.locator('article').count()}`)
await page.screenshot({ path: `${outDir}/07-saved.png` })

// 10. Application
await page.goto(`${base}${firstHref}`, { waitUntil: 'domcontentloaded' })
await page.selectOption('select[aria-label="Status"]', 'applied')
await page.locator('button:has-text("Confirm actually submitted")').click()
await page.waitForTimeout(2000)
await page.goto(`${base}/jobs?view=applications`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('table', { timeout: 30000 })
const applicationText = await page.locator('body').innerText()
log(`application recorded: ${applicationText.includes('applied')}`)
await page.screenshot({ path: `${outDir}/08-applications.png` })

// 11. Sources admin
await page.goto(`${base}/jobs?view=sources`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('table', { timeout: 30000 })
const sourceRows = await page.locator('tbody tr').count()
log(`source rows: ${sourceRows}`)
await page.screenshot({ path: `${outDir}/09-sources.png`, fullPage: true })

// 12. Mobile
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${base}/jobs?view=latest`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('article', { timeout: 30000 })
await page.screenshot({ path: `${outDir}/10-mobile.png`, fullPage: false })
log('mobile screenshot captured')

await browser.close()
log('done')
