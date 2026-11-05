/**
 * Inbox screenshot harness — BEFORE/AFTER evidence for the V4 rebuild.
 * Usage: node scripts/qa/inbox-shots.mjs <outDir> [url]
 * Defaults to /inbox-fixture (auth-free deterministic surface).
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const outDir = process.argv[2] ?? 'artifacts/inbox-v4'
const url = process.argv[3] ?? 'http://localhost:3000/inbox-fixture'
fs.mkdirSync(outDir, { recursive: true })

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 900 },
  { name: '375', width: 375, height: 812 },
]

const browser = await chromium.launch()
const errors = []
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${vp.name}] console: ${msg.text()}`)
  })
  page.on('pageerror', (err) => errors.push(`[${vp.name}] pageerror: ${err.message}`))
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(outDir, `${vp.name}.png`), fullPage: false })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  console.log(`${vp.name}: overflow=${overflow}`)
  await page.close()
}
await browser.close()
if (errors.length) {
  console.log('--- console errors ---')
  for (const e of errors) console.log(e)
} else {
  console.log('console errors: none')
}
