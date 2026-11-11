import { chromium } from 'playwright'
const base = 'https://relay.bpulse.dev'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } })
const page = await ctx.newPage()
await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#login-email')
await page.evaluate(() => {
  const set = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set
    setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  set(document.querySelector('#login-email'), 'hassan@scout.dev')
  set(document.querySelector('#login-password'), 'scout-dev-password')
})
await page.waitForTimeout(400)
await page.getByRole('button', { name: /sign in with password/i }).click()
await page.waitForFunction(() => /^\/(dashboard|onboarding|chats)/.test(location.pathname))
await page.goto(`${base}/chats`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const info = await page.evaluate(() => {
  const p = document.querySelector('.whitespace-pre-wrap.text-\\[13px\\]')
  if (!p) return 'no bubble text found'
  const cs = getComputedStyle(p)
  const meta = document.querySelector('.px-1.text-\\[10px\\]')
  return {
    bubbleText: { color: cs.color, bg: getComputedStyle(p.parentElement).backgroundColor, cls: p.className },
    meta: meta ? { color: getComputedStyle(meta).color, cls: meta.className } : null,
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
