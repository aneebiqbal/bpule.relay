/** Extra AFTER evidence: mobile thread, open filter drawer, open context drawer. */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const base = 'http://localhost:3000'
const outDir = 'artifacts/inbox-v4-after'
fs.mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()

// 375 thread
{
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await page.goto(`${base}/inbox-fixture`, { waitUntil: 'networkidle' })
  await page.getByText('Sarah Chen').first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outDir, '375-thread.png') })
  await page.close()
}

// 1440 filter drawer open
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${base}/inbox-fixture`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Filters/ }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outDir, '1440-filters.png') })
  await page.close()
}

// 1024 context drawer open
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
  await page.goto(`${base}/inbox-fixture`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Lead intelligence/ }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(outDir, '1024-context.png') })
  await page.close()
}

await browser.close()
console.log('extra shots saved')
