import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://127.0.0.1:3200'
const outDir = 'qa-artifacts/staging-v6'
fs.mkdirSync(outDir, { recursive: true })
const log = (message) => console.log(`[v6-accept] ${message}`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[type=email]', { timeout: 90000 })
await page.fill('input[type=email]', 'staging-operator@example.com')
await page.fill('input[type=password]', 'staging-pass-123')
await page.click('button:has-text("Sign in with password")')
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 90000 })
log(`login ok: ${page.url()}`)

// 1. The Prepared view shows the automatically prepared package.
await page.goto(`${base}/jobs?view=prepared`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=Prepared', { timeout: 90000 })
await page.waitForTimeout(2500)
const preparedText = await page.locator('body').innerText()
const hasCard = /Full-Stack Developer|Software Engineer|Prepared/.test(preparedText)
log(`prepared view rendered: ${hasCard}`)
log(`shows document quality: ${/Document|document quality|Readiness|readiness/.test(preparedText)}`)
await page.screenshot({ path: `${outDir}/01-prepared.png`, fullPage: true })

// 2. The shortlist still shows verified recommended roles.
await page.goto(`${base}/jobs`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('article', { timeout: 90000 })
log(`shortlist cards: ${await page.locator('article').count()}`)

// 3. Open a recommended job and confirm the ATS panel + Pakistan verdict.
const firstHref = await page.locator('article h3 a').first().getAttribute('href')
await page.goto(`${base}${firstHref}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('h1', { timeout: 60000 })
const detailText = await page.locator('body').innerText()
log(`job detail: ${(await page.locator('h1').first().innerText()).slice(0, 70)}`)
log(`pakistan verdict: ${/Pakistan:/.test(detailText)}`)

// 4. Generate with Ultra ATS on A4 and download the PDF.
await page.selectOption('select[aria-label="CV layout"]', 'ultra')
await page.selectOption('select[aria-label="Paper size"]', 'a4')
await page.click('button:has-text("Generate package")')
await page.waitForSelector('text=Document package generated', { timeout: 180000 })
await page.waitForSelector('text=Document quality', { timeout: 30000 })
const afterGen = await page.locator('body').innerText()
log(`document quality shown: ${/document quality/i.test(afterGen)}`)
log(`job match shown: ${/job match/i.test(afterGen)}`)
await page.screenshot({ path: `${outDir}/02-detail.png`, fullPage: true })

const profileId = await page.locator('select[aria-label="Profile"]').inputValue()
const jobId = new URL(page.url()).pathname.split('/').filter(Boolean)[1]
const pdfResponse = await page.request.get(`${base}/api/jobs/${jobId}/documents/cv?profileId=${profileId}&format=pdf&layout=ultra&paper=a4`)
const pdfBytes = Buffer.from(await pdfResponse.body())
fs.writeFileSync(`${outDir}/cv-ultra-a4.pdf`, pdfBytes)
const raw = pdfBytes.toString('latin1')
log(`pdf: ${pdfResponse.status()} ${pdfBytes.length} bytes`)
log(`pdf A4: ${raw.includes('/MediaBox [0 0 595 842]')}`)
log(`pdf unicode font embedded: ${raw.includes('RelaySans') || /Type0|FontFile/.test(raw)}`)
log(`pdf link: ${raw.includes('/Subtype /Link')}`)

await browser.close()
log('done')
