/**
 * Release mobile/accessibility sweep over the five critical surfaces.
 *
 *   node scripts/qa/release-a11y-mobile.mjs [base]
 *
 * Runs real authenticated sessions, axe-core on desktop + mobile viewports,
 * and saves screenshots + a machine-readable summary as release artifacts.
 */
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const base = process.argv[2] ?? 'http://localhost:3000'
const PASSWORD = 'staging-password-1'
const outDir = path.resolve('docs/sprints/relay-unified-operations/artifacts')
fs.mkdirSync(outDir, { recursive: true })

const PAGES = [
  { key: 'channels', href: '/admin/channels', role: 'admin.stg@org-a.test' },
  { key: 'work-setup', href: '/admin/targets', role: 'admin.stg@org-a.test' },
  { key: 'handoff', href: '/admin/handoff', role: 'admin.stg@org-a.test' },
  { key: 'rep-today', href: '/dashboard', role: 'member.stg@org-a.test' },
  { key: 'jobs', href: '/jobs', role: 'owner.stg@org-a.test' },
]

const axePath = path.resolve('node_modules/axe-core/axe.min.js')
const summary = []
const browser = await chromium.launch()

async function signIn(context, email) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const page = await context.newPage()
      await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
      await page.locator('#login-email').fill(email)
      await page.locator('#login-password').fill(PASSWORD)
      await page.waitForTimeout(600)
      await page.locator('button.auth-submit').click()
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })
      return page
    } catch (error) {
      if (attempt === 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
  throw new Error('unreachable')
}

for (const spec of PAGES) {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
    const page = await signIn(context, spec.role)
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto(`${base}${spec.href}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await page.addScriptTag({ path: axePath })
    const result = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }))
    const violations = result.violations.map((entry) => ({
      id: entry.id,
      impact: entry.impact,
      nodes: entry.nodes.length,
      target: entry.nodes[0]?.target?.[0] ?? '',
    }))
    const shot = path.join(outDir, `${spec.key}-${viewport.name}.png`)
    await page.screenshot({ path: shot, fullPage: false })
    summary.push({ page: spec.key, viewport: viewport.name, violations, errors, screenshot: shot })
    console.log(`${spec.key} ${viewport.name}: ${violations.length} axe violation group(s), ${errors.length} page error(s)`)
    if (violations.length) console.log(JSON.stringify(violations.slice(0, 5)))
    await context.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'a11y-mobile-summary.json'), JSON.stringify(summary, null, 2))
const total = summary.reduce((sum, row) => sum + row.violations.length, 0)
console.log(`\nsaved ${summary.length} sweeps to ${outDir}; total violation groups=${total}`)
process.exit(total > 0 ? 1 : 0)
