/** LIVE parity: Rep Home count and Lead 360 state after the send. */
import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const LEAD = '3c4ec4df-d9cc-49ae-b145-965264b7f12f'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
await context.addInitScript(() => { try { localStorage.setItem('relay-active-identity', 'c26a685b-a18b-4672-b7ad-a55e211539b2') } catch {} })
const page = await context.newPage()

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill('dawood@scout.dev')
await page.locator('input[type="password"], input[name="password"]').first().fill('scout-dev-password')
await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 30_000 })
await page.waitForTimeout(2000)

// Rep Home
await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
const home = await page.locator('body').innerText()
const replyLine = home.split('\n').filter((l) => /repl|waiting|needs/i.test(l)).slice(0, 8)
console.log('HOME reply-related lines:', JSON.stringify(replyLine))
const homeMetric = await page.locator('text=/Replies waiting|Needs reply|Replies/').first().innerText().catch(() => '')
console.log('HOME metric:', homeMetric.slice(0, 120))

// Lead 360
await page.goto(`${base}/leads/${LEAD}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)
const lead = await page.locator('body').innerText()
const stateLines = lead.split('\n').filter((l) => /waiting|needs reply|follow-up|conversation|reply/i.test(l)).slice(0, 10)
console.log('LEAD 360 state lines:', JSON.stringify(stateLines))
console.log('LEAD has Needs reply:', /Needs reply/i.test(lead))
console.log('LEAD has Waiting on prospect:', /Waiting on prospect|Waiting on client/i.test(lead))
await page.screenshot({ path: 'artifacts/inbox-live-lead360.png', fullPage: false })
await browser.close()
