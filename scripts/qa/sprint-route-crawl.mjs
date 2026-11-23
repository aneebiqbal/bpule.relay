/**
 * Sprint QA: route smoke crawl against a running dev server.
 * Read-only GETs; never mutates data. Auth-gated pages are recorded as redirects.
 *
 *   node scripts/qa/sprint-route-crawl.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:3000'
const appRoot = path.join(process.cwd(), 'src/app')

const routes = []
;(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name === 'page.tsx') {
      let r = '/' + path.relative(appRoot, full).replace(/page\.tsx$/, '')
      r = r.replace(/\([^)]*\)/g, '').replace(/\[[^\]]+\]/g, '*').replace(/\/{2,}/g, '/').replace(/\/+$/, '')
      routes.push(r || '/')
    }
  }
})(appRoot)

// Concrete stand-ins for dynamic segments, used only for route discovery.
const concrete = (route) =>
  route.replace('*', '00000000-0000-4000-8000-000000000000')

const browser = await chromium.launch()
const results = []
for (const route of routes.sort()) {
  const url = base + concrete(route)
  const page = await browser.newPage()
  const consoleErrors = []
  const pageErrors = []
  const failed = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 240)))
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 240)))
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${new URL(r.url()).pathname}`))
  let status = 0
  let finalUrl = url
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    status = res?.status() ?? 0
    finalUrl = page.url()
    await page.waitForTimeout(120)
  } catch (err) {
    pageErrors.push('NAV: ' + String(err.message).slice(0, 160))
  }
  const redirected = finalUrl !== url
  const authGated = redirected && finalUrl.includes('/login')
  results.push({
    route,
    status,
    authGated,
    redirectedTo: redirected ? new URL(finalUrl).pathname + new URL(finalUrl).search : null,
    consoleErrors,
    pageErrors,
    failedRequests: [...new Set(failed)].filter((f) => !f.includes('/_next/')),
  })
  await page.close()
}

await browser.close()

const crashing = results.filter((r) => r.pageErrors.length > 0)
const withConsole = results.filter((r) => r.consoleErrors.length > 0)
console.log(
  JSON.stringify(
    {
      base,
      total: results.length,
      ok: results.filter((r) => !r.authGated && r.status < 400).length,
      authGated: results.filter((r) => r.authGated).length,
      nonAuthHardFailures: results.filter((r) => !r.authGated && r.status >= 400),
      crashing,
      withConsole,
    },
    null,
    1,
  ),
)
