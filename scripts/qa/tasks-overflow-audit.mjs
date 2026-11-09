/**
 * `/tasks` overflow audit.
 *
 * Identifies which element stretches the document at a narrow viewport and
 * whether its ancestor actually contains it. The tab bar is wider than a phone
 * viewport by design; it must scroll inside its own `overflow-x-auto` wrapper
 * rather than widening the page.
 *
 *   node scripts/qa/tasks-overflow-audit.mjs [width] [height]
 *
 * The app sets `Secure` auth cookies, so the session is injected as a header
 * rather than through the login form (this script targets an HTTP prod build).
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'

const base = process.env.RELAY_AUDIT_BASE ?? 'http://localhost:3000'
const width = Number(process.argv[2] ?? 375)
const height = Number(process.argv[3] ?? 812)

const raw = execFileSync(
  'curl',
  ['-s', '-i', '-X', 'POST', `${base}/api/auth/sign-in/email`, '-H', 'Content-Type: application/json',
    '-d', JSON.stringify({ email: 'dawood@scout.dev', password: 'scout-dev-password' })],
  { encoding: 'utf8' },
)
const cookies = [...raw.matchAll(/set-cookie:\s*([^;]+);/gi)].map((m) => m[1]).filter(Boolean)
if (!cookies.length) throw new Error('login returned no cookies')

const browser = await chromium.launch()
const context = await browser.newContext({ ignoreHTTPSErrors: true })
const page = await context.newPage()
await page.setExtraHTTPHeaders({ cookie: cookies.join('; ') })
await page.setViewportSize({ width, height })
await page.goto(`${base}/tasks`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(8000)

const report = await page.evaluate(() => {
  const vw = window.innerWidth
  const offenders = []
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.width > vw + 1 || r.right > vw + 1) {
      offenders.push({ el, tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 110), right: Math.round(r.right) })
    }
  }
  // Walk up from the right-most offender to see which ancestor should contain it.
  let start = offenders[0]?.el ?? null
  for (const o of offenders) {
    if (o.el.getBoundingClientRect().right > start.getBoundingClientRect().right) start = o.el
  }
  const chain = []
  let el = start
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
    viewport: vw,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    offenders: offenders.slice(0, 8).map(({ el, ...rest }) => rest),
    chain,
  }
})

console.log(JSON.stringify(report, null, 2))
await browser.close()

if (report.scrollWidth > report.clientWidth + 1) process.exit(1)
