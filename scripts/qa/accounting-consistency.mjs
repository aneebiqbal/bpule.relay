import { chromium } from 'playwright'
import fs from 'node:fs'

/**
 * Canonical accounting consistency: the Admin headline, the reconciliation line
 * and the canonical API must agree for the same organization and date.
 */
const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/final-program'
fs.mkdirSync(outDir, { recursive: true })
const log = (message) => console.log(`[accounting] ${message}`)

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } })

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[type=email]', { timeout: 90000 })
await page.fill('input[type=email]', 'staging-operator@example.com')
await page.fill('input[type=password]', 'staging-pass-123')
await page.click('button:has-text("Sign in with password")')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 })

// Canonical API.
const canonical = await (await page.request.get(`${base}/api/admin/accountability`)).json()
log(`API requirement=${canonical.summary.requirement} tracked=${canonical.summary.tracked} assigned=${canonical.summary.assigned} unallocated=${canonical.summary.unallocated}`)
log(`API populations requirementAssigned=${canonical.populations.requirementAssigned} requirementUnallocated=${canonical.populations.requirementUnallocated}`)
log(`API ledger rows=${canonical.ledger.length}`)

// Admin headline.
await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
const text = await page.locator('body').innerText()
const headline = (text.match(/(\d+)\s*\n?\s*\/\s*(\d+) required/) ?? [])[0] ?? null
const reconciliation = (text.match(/(\d+) allocated · (\d+) shared unallocated · (\d+) tracked/) ?? [])[0] ?? null
log(`Admin headline: ${headline}`)
log(`Admin reconciliation: ${reconciliation}`)
await page.screenshot({ path: `${outDir}/08-admin-accounting.png`, fullPage: false })

const apiReq = canonical.summary.requirement
const headlineReq = headline ? Number(headline.match(/\/\s*(\d+) required/)?.[1]) : null
log(`headline matches canonical requirement: ${headlineReq === apiReq}`)
const rec = reconciliation ? reconciliation.match(/(\d+) allocated · (\d+) shared unallocated · (\d+) tracked/).slice(1).map(Number) : null
log(`reconciliation matches canonical: ${rec && rec[0] === canonical.summary.assigned && rec[1] === canonical.summary.unallocated && rec[2] === canonical.summary.tracked}`)

await browser.close()
log('done')
