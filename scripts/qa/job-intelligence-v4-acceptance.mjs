import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/staging-v4'
fs.mkdirSync(outDir, { recursive: true })
const log = (message) => console.log(`[v4-accept] ${message}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input[type="email"]', 'staging-operator@example.com')
await page.fill('input[type="password"]', 'staging-pass-123')
await page.click('button:has-text("Sign in with password")')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 })
log(`login ok: ${page.url()}`)

// 1. Default view is the proactive shortlist.
await page.goto(`${base}/jobs`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('article', { timeout: 90000 })
const shortlistCount = await page.locator('article').count()
const shortlistHeading = await page.locator('body').innerText()
log(`shortlist cards: ${shortlistCount}`)
log(`shortlist view active: ${/Ready Today/.test(shortlistHeading)}`)
const shortlistHref = await page.locator('article h3 a').first().getAttribute('href')
await page.screenshot({ path: `${outDir}/01-shortlist.png`, fullPage: true })

// 2. For You still ranks by stored match.
await page.goto(`${base}/jobs?view=for-you`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('article, :text("No jobs in this view yet")', { timeout: 90000 })
log(`for-you cards: ${await page.locator('article').count()}`)
await page.screenshot({ path: `${outDir}/02-for-you.png`, fullPage: true })

// 3. Job detail shows the Pakistan eligibility verdict and the human checklist.
const firstHref = shortlistHref
await page.goto(`${base}${firstHref}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('h1', { timeout: 60000 })
const detailText = await page.locator('body').innerText()
log(`job detail: ${(await page.locator('h1').first().innerText()).slice(0, 80)}`)
log(`checklist present: ${/Verified open at the original source/.test(detailText)}`)
log(`eligibility evidence present: ${/Pakistan|eligible|Worldwide/i.test(detailText)}`)
await page.screenshot({ path: `${outDir}/03-detail.png`, fullPage: true })

// 4. Application destination is only offered when it is a public http(s) URL.
const applyDisabled = await page.locator('button:has-text("Open official application")').first().isDisabled().catch(() => null)
log(`apply button disabled (no safe destination): ${applyDisabled}`)

await browser.close()
log('done')
