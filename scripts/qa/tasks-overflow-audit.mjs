import { chromium } from 'playwright'

const base = 'https://localhost:3000'
const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await context.newPage()

await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#login-email', { timeout: 20000 })
await page.fill('#login-email', 'dawood@scout.dev')
await page.fill('#login-password', 'scout-dev-password')
await page.click('button[type="submit"]')
await page.waitForURL(/dashboard|onboarding|chats/, { timeout: 60000 })
await page.waitForTimeout(1000)

await page.setViewportSize({ width: 375, height: 812 })
await page.goto(`${base}/tasks`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)

const report = await page.evaluate(() => {
  const vw = window.innerWidth
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width > vw + 1 || r.right > vw + 1) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 120),
        width: Math.round(r.width),
        right: Math.round(r.right),
        text: (el.innerText || '').slice(0, 60),
      })
    }
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, out: out.slice(0, 15) }
})
console.log(JSON.stringify(report, null, 2))

await browser.close()
