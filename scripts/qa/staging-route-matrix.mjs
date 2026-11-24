/**
 * Authenticated route × role matrix + responsive sweep against local staging.
 *
 *   node scripts/qa/staging-route-matrix.mjs [base]
 *
 * Signs in each role, visits every reachable route directly, records rendering,
 * redirects, console/page errors, and horizontal overflow at four widths.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:3000'
const PASSWORD = 'staging-password-1'

const ROUTES = [
  ['home', '/dashboard'],
  ['inbox', '/chats'],
  ['tasks', '/tasks'],
  ['leads', '/leads'],
  ['prospect', '/prospect'],
  ['upwork', '/upwork'],
  ['jobs', '/jobs'],
  ['content', '/content'],
  ['content-ideas', '/content/ideas'],
  ['content-growth', '/content/growth'],
  ['team', '/team'],
  ['team-people', '/team/people'],
  ['team-profiles', '/team/profiles'],
  ['team-performance', '/team/performance'],
  ['reports-sales', '/reports/sales'],
  ['reports-pipeline', '/reports/pipeline'],
  ['reports-revenue', '/reports/revenue'],
  ['reports-activity', '/reports/activity'],
  ['settings', '/settings'],
  ['notifications', '/notifications'],
  ['admin-targets', '/admin/targets'],
  ['admin-people', '/admin/people'],
  ['admin-control-center', '/admin/control-center'],
  ['admin-system', '/admin/system'],
]

/** Role expectations: 'yes' reachable, 'no' must be refused, '?' informational. */
const EXPECTED = {
  OWNER: { '/dashboard': 'yes', '/chats': 'yes', '/tasks': 'yes', '/leads': 'yes', '/prospect': 'yes', '/upwork': 'yes', '/jobs': 'yes', '/content': 'yes', '/content/ideas': 'yes', '/content/growth': 'yes', '/team': 'yes', '/team/people': 'yes', '/team/profiles': 'yes', '/team/performance': 'yes', '/reports/sales': 'yes', '/reports/pipeline': 'yes', '/reports/revenue': 'yes', '/reports/activity': 'yes', '/settings': 'yes', '/notifications': 'yes', '/admin/targets': 'yes', '/admin/people': 'yes', '/admin/control-center': 'yes', '/admin/system': 'yes' },
  ADMIN: { '/dashboard': 'yes', '/chats': 'yes', '/tasks': 'yes', '/leads': 'yes', '/prospect': 'yes', '/upwork': 'yes', '/jobs': 'yes', '/content': 'yes', '/content/ideas': 'yes', '/content/growth': 'yes', '/team': 'yes', '/team/people': 'yes', '/team/profiles': 'yes', '/team/performance': 'yes', '/reports/sales': 'yes', '/reports/pipeline': 'yes', '/reports/revenue': 'yes', '/reports/activity': 'yes', '/settings': 'yes', '/notifications': 'yes', '/admin/targets': 'yes', '/admin/people': 'yes', '/admin/control-center': 'yes', '/admin/system': 'yes' },
  MANAGER: { '/team': 'yes', '/team/people': 'yes', '/team/profiles': 'yes', '/team/performance': 'yes', '/admin/targets': 'no', '/admin/people': 'no', '/admin/control-center': 'no', '/admin/system': 'no' },
  MEMBER: { '/chats': 'yes', '/dashboard': 'yes', '/tasks': 'yes', '/leads': 'yes', '/prospect': 'yes', '/upwork': 'yes', '/team': 'no', '/team/people': 'no', '/admin/targets': 'no', '/admin/people': 'no', '/admin/control-center': 'no' },
}

const ROLE_EMAIL = {
  OWNER: 'owner.stg@org-a.test',
  ADMIN: 'admin.stg@org-a.test',
  MANAGER: 'manager.stg@org-a.test',
  MEMBER: 'member.stg@org-a.test',
}
const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
]
const RESPONSIVE_ROUTES = ['/chats', '/dashboard', '/admin/targets', '/team', '/tasks']

async function signIn(page, email) {
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#login-email')
  await page.waitForTimeout(700)
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(PASSWORD)
  await page.waitForFunction(() => {
    const b = document.querySelector('button.auth-submit')
    return b && !b.hasAttribute('disabled')
  }, null, { timeout: 15_000 })
  await page.locator('button.auth-submit').click()
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 })
}

const browser = await chromium.launch()
const rows = []
let screenshots = 0

for (const [role, email] of Object.entries(ROLE_EMAIL)) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[3] })
  const page = await ctx.newPage()
  await signIn(page, email)
  for (const [name, path] of ROUTES) {
    const expected = EXPECTED[role]?.[path] ?? '?'
    const errors = []
    const failedRequests = []
    page.removeAllListeners('pageerror')
    page.removeAllListeners('requestfailed')
    page.on('pageerror', (e) => { if (!/negative time stamp/.test(e.message)) errors.push(e.message.slice(0, 160)) })
    page.on('response', (r) => { if (r.status() >= 500) failedRequests.push(`${r.status()} ${new URL(r.url()).pathname}`) })
    let status = 0
    let finalPath = path
    try {
      const res = await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      status = res?.status() ?? 0
      finalPath = new URL(page.url()).pathname
      await page.waitForTimeout(600)
    } catch (error) {
      errors.push('NAV ' + String(error.message).slice(0, 120))
    }
    const denied =
      finalPath.includes('/login') ||
      (expected === 'no' && (finalPath === '/dashboard' || /know what to do next/i.test(await page.title().catch(() => ''))))
    const title = await page.title().catch(() => '')
    const passed =
      status < 500 &&
      errors.length === 0 &&
      failedRequests.length === 0 &&
      (expected === 'no' ? denied : expected === 'yes' ? !denied : true)
    rows.push({ role, route: name, path, expected, status, finalPath, title, denied, passed, errors, serverErrors: [...new Set(failedRequests)] })
    console.log(`${passed ? 'ok  ' : 'FAIL'} ${role.padEnd(7)} ${path.padEnd(22)} ${status} -> ${finalPath}${errors.length ? `  err=${errors[0]}` : ''}`)
    if (RESPONSIVE_ROUTES.includes(path) && expected !== 'no') {
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height })
        await page.waitForTimeout(250)
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          bodyScroll: document.body.scrollWidth,
        }))
        const ok = overflow.scrollWidth <= overflow.innerWidth + 2
        rows.push({
          role, route: `${name}@${vp.name}`, path, expected, status, finalPath, denied,
          passed: ok, errors: [], serverErrors: [],
          overflow: { scrollWidth: overflow.scrollWidth, innerWidth: overflow.innerWidth },
        })
        console.log(`${ok ? 'ok  ' : 'FAIL'} ${role.padEnd(7)} ${path}@${vp.name} overflow ${overflow.scrollWidth}>${overflow.innerWidth}`)
      }
      await page.setViewportSize({ width: VIEWPORTS[3].width, height: VIEWPORTS[3].height })
    }
  }
  // A couple of screenshots as visual evidence.
  await page.goto(`${base}/chats`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const shot = `docs/sprints/production-certification/artifacts/${role.toLowerCase()}-inbox.png`
  fs.mkdirSync('docs/sprints/production-certification/artifacts', { recursive: true })
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {})
  screenshots += 1
  await ctx.close()
}

await browser.close()

const failed = rows.filter((r) => !r.passed)
const summary = {
  generatedAt: new Date().toISOString(),
  base,
  roles: Object.keys(ROLE_EMAIL),
  routes: ROUTES.length,
  viewports: VIEWPORTS.map((v) => v.name),
  checks: rows.length,
  passed: rows.length - failed.length,
  failed: failed.length,
  screenshots,
  results: rows,
}
console.log(`\n${summary.passed} passed, ${summary.failed} failed`)
fs.writeFileSync(
  'docs/sprints/production-certification/artifacts/route-role-matrix.json',
  JSON.stringify(summary, null, 1),
)
process.exitCode = failed.length === 0 ? 0 : 1
