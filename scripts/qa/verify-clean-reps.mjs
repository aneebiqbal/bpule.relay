import { chromium } from 'playwright'
const base = 'https://localhost:3000'
const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await context.newPage()
await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill('hassan@scout.dev')
await page.locator('input[type="password"], input[name="password"]').first().fill('scout-dev-password')
await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 30000 })
await page.waitForTimeout(1500)
for (const view of ['all', 'waiting_me']) {
  const res = await context.request.get(`${base}/chats?view=${view}`)
  const html = await res.text()
  const hits = ['Maya Lindqvist', 'TestCorp', 'Northwind Freight', 'Harbor Freight', 'Acme SA', 'Orbit Ltd', 'Beta Co'].filter((s) => html.includes(s))
  console.log(`admin /chats?view=${view}: status=${res.status()} test-name hits=${JSON.stringify(hits)}`)
}
await browser.close()
