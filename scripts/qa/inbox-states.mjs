/** Axe sweep across every queue state and role in the fixture. */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = 'http://localhost:3000'
const axeSource = fs.readFileSync(path.join(process.cwd(), 'node_modules/axe-core/axe.min.js'), 'utf8')
const browser = await chromium.launch()

const REP_ROWS = [
  { name: 'Sarah Chen' },
  { name: 'Marcus Webb' },
  { name: 'Priya Raman' },
  { name: 'Tom Okafor' },
  { name: 'Aisha Bello' },
  { name: 'Lena Fischer' },
  { name: 'Ben Carter' },
  { name: 'Diego Alvarez', tab: 'Follow-ups' },
  { name: 'Hana Kobayashi', tab: 'Waiting' },
  { name: 'Omar Haddad', tab: 'All' },
  { name: 'Grace Lin', condition: 'Closed' },
]

const failures = []
for (const row of REP_ROWS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${base}/inbox-fixture`, { waitUntil: 'networkidle' })
  if (row.tab) {
    await page.getByRole('navigation', { name: 'Conversation views' }).getByRole('button', { name: new RegExp(row.tab) }).click()
    await page.waitForTimeout(150)
  }
  if (row.condition) {
    await page.getByRole('button', { name: /Filters/ }).click()
    await page.waitForTimeout(200)
    await page.getByRole('dialog', { name: 'Filters' }).locator('select').last().selectOption(row.condition.toLowerCase())
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.waitForTimeout(150)
  }
  await page.getByText(row.name).first().click()
  await page.waitForTimeout(200)
  await page.addScriptTag({ content: axeSource })
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => ({ id: v.id, impact: v.impact, target: v.nodes[0]?.target?.join(' ') ?? '', summary: v.nodes[0]?.failureSummary ?? '' }))
  })
  if (violations.length) failures.push(`${row.name}: ${JSON.stringify(violations)}`)
  else console.log(`ok: ${row.name}`)
  await page.close()
}

// Manager view: owner column + Act menu.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${base}/inbox-fixture?role=manager`, { waitUntil: 'networkidle' })
  await page.getByText('Sarah Chen').first().click()
  await page.waitForTimeout(200)
  await page.addScriptTag({ content: axeSource })
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => ({ id: v.id, target: v.nodes[0]?.target?.join(' ') ?? '' }))
  })
  if (violations.length) failures.push(`manager: ${JSON.stringify(violations)}`)
  else console.log('ok: manager')
  await page.close()
}

await browser.close()
if (failures.length) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log(f)
  process.exit(1)
}
console.log('\nall state/role axe sweeps clean')
