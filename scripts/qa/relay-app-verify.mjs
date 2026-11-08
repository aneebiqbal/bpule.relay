import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)))

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#login-email', { timeout: 15000 })
await page.fill('#login-email', 'dawood@scout.dev')
await page.fill('#login-password', 'scout-dev-password')
await page.click('button[type="submit"]')
await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 30000 })
await page.waitForTimeout(1000)

await page.goto(`${base}/chats?view=waiting_me`, { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 900))
console.log('url:', page.url())
console.log('body:', bodyText.replace(/\n+/g, ' | '))
console.log('console errors:', JSON.stringify(errors.slice(0, 6)))

await browser.close()
