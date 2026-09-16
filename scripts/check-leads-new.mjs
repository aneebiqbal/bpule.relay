import { chromium } from '@playwright/test'

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`))

  await page.goto('http://localhost:4012/leads/new', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const visible = await page.evaluate(() => document.body.innerText)
  console.log('=== VISIBLE TEXT (first 2000 chars) ===')
  console.log(visible.slice(0, 2000))
  console.log('=== COUNT of inputs ===')
  console.log(await page.locator('input, textarea, select').count())

  const company = page.getByLabel('Company')
  console.log('=== getByLabel("Company") count:', await company.count())
  if (await company.count() > 0) {
    await company.fill('Acme Example Co')
    console.log('fill OK')
  }

  console.log('=== CONSOLE ERRORS ===')
  console.log(errors.slice(0, 10))
  await browser.close()
})()