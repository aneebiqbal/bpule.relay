import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/staging-v5'
fs.mkdirSync(outDir, { recursive: true })
const log = (message) => console.log(`[v5-accept] ${message}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[type=email]', { timeout: 90000 })
await page.fill('input[type=email]', 'staging-operator@example.com')
await page.fill('input[type=password]', 'staging-pass-123')
await page.click('button:has-text("Sign in with password")')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 })
log(`login ok: ${page.url()}`)

// 1. Shortlist now contains verified recommended roles.
await page.goto(`${base}/jobs`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('article', { timeout: 90000 })
const shortlistText = await page.locator('body').innerText()
const shortlistCount = await page.locator('article').count()
log(`shortlist cards: ${shortlistCount}`)
log(`verified recommended present: ${/Verified open/.test(shortlistText)}`)
log(`no mojibake: ${!/â|ÙØ³/.test(shortlistText)}`)
await page.screenshot({ path: `${outDir}/01-shortlist.png`, fullPage: true })

// 2. Open the first recommended role.
const firstHref = await page.locator('article h3 a').first().getAttribute('href')
await page.goto(`${base}${firstHref}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('h1', { timeout: 60000 })
log(`job detail: ${(await page.locator('h1').first().innerText()).slice(0, 80)}`)

// 3. Generate the package with the Ultra ATS template on A4.
await page.selectOption('select[aria-label="CV layout"]', 'ultra')
await page.selectOption('select[aria-label="Paper size"]', 'a4')
await page.click('button:has-text("Generate package")')
await page.waitForSelector('text=Document package generated', { timeout: 180000 })
await page.waitForSelector('text=Document quality', { timeout: 30000 })
const detailText = await page.locator('body').innerText()
log(`document quality shown: ${/document quality/i.test(detailText)}`)
log(`job match shown: ${/job match/i.test(detailText)}`)
log(`checklist present: ${/Verified open at the original source/.test(detailText)}`)
await page.screenshot({ path: `${outDir}/02-detail-ats.png`, fullPage: true })

// 4. Download the A4 PDF and verify the media box + clickable link.
const profileId = await page.locator('select[aria-label="Profile"]').inputValue()
const jobId = new URL(page.url()).pathname.split('/').filter(Boolean)[1]
const pdfHref = `/api/jobs/${jobId}/documents/cv?profileId=${profileId}&format=pdf&layout=ultra&paper=a4`
const pdfResponse = await page.request.get(`${base}${pdfHref}`)
const pdfBytes = Buffer.from(await pdfResponse.body())
fs.writeFileSync(`${outDir}/cv-ultra-a4.pdf`, pdfBytes)
const pdfRaw = pdfBytes.toString('latin1')
log(`pdf: ${pdfResponse.status()} ${pdfResponse.headers()['content-type']} ${pdfBytes.length} bytes`)
log(`pdf A4 media box: ${pdfRaw.includes('/MediaBox [0 0 595 842]')}`)
log(`pdf has link annotation: ${pdfRaw.includes('/Subtype /Link')}`)

// 5. Download the application ZIP.
const zipResponse = await page.request.get(`${base}/api/jobs/${jobId}/documents/cv?profileId=${profileId}&format=zip&layout=ultra&paper=a4`)
const zipBytes = Buffer.from(await zipResponse.body())
fs.writeFileSync(`${outDir}/application-package.zip`, zipBytes)
log(`zip: ${zipResponse.status()} ${zipBytes.length} bytes`)
log(`zip magic: ${zipBytes.subarray(0, 2).toString('latin1') === 'PK'}`)

await browser.close()
log('done')
