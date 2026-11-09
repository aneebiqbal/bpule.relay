import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

// The auth cookies are `Secure`, so a plain-HTTP server cannot hold a session
// in a real browser. Inject them as a header instead.
const raw = execFileSync('curl', ['-s', '-i', '-X', 'POST', 'http://localhost:3000/api/auth/sign-in/email',
  '-H', 'Content-Type: application/json',
  '-d', JSON.stringify({ email: 'dawood@scout.dev', password: 'scout-dev-password' })], { encoding: 'utf8' })
const cookies = [...raw.matchAll(/set-cookie:\s*([^;]+);/gi)].map((m) => m[1]).filter(Boolean)
if (!cookies.length) throw new Error('no cookies from login')
const cookieHeader = cookies.join('; ')

const base = 'http://localhost:3000'
const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
await context.addInitScript(() => {
  try { localStorage.setItem('relay-active-identity', 'c26a685b-a18b-4672-b7ad-a55e211539b2') } catch {}
})
const page = await context.newPage()
await page.setExtraHTTPHeaders({ cookie: cookieHeader })

const width = Number(process.argv[2] ?? 375)
await page.setViewportSize({ width, height: 812 })
await page.goto(`${base}/tasks`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(9000)

const report = await page.evaluate(() => {
  const vw = window.innerWidth
  const out = []
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width > vw + 1 || r.right > vw + 1) {
      const cs = getComputedStyle(el)
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 110),
        width: Math.round(r.width),
        right: Math.round(r.right),
        overflowX: cs.overflowX,
        text: (el.innerText || '').slice(0, 40),
      })
    }
  }
  // Walk up from the widest offender to see which ancestor should contain it.
  let widest = null
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (!widest || r.width > widest.width) widest = { el, width: r.width }
  }
  const chain = []
  let el = widest?.el
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 110),
      overflowX: cs.overflowX,
      width: Math.round(r.width),
      scrollWidth: el.scrollWidth,
    })
    el = el.parentElement
  }
  return {
    vw,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    offenders: out.slice(0, 12),
    chain,
  }
})
console.log(JSON.stringify(report, null, 2))

await browser.close()
