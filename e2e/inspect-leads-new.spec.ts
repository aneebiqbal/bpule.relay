import { test, expect } from '@playwright/test'

test('inspect leads/new', async ({ page }) => {
  await page.goto('/leads/new')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  const visible = await page.evaluate(() => document.body.innerText)
  console.log('=== VISIBLE TEXT (first 1500 chars) ===')
  console.log(visible.slice(0, 1500))
  console.log('=== INPUT COUNT ===')
  const inputCount = await page.locator('input, textarea, select').count()
  console.log(inputCount)

  const company = page.getByLabel('Company')
  const companyCount = await company.count()
  console.log('=== getByLabel("Company") count:', companyCount)
  
  const companyById = page.locator('#company')
  const byIdCount = await companyById.count()
  console.log('=== #company count:', byIdCount)

  const labels = page.locator('label')
  const labelCount = await labels.count()
  console.log('=== label count:', labelCount)
  for (let i = 0; i < Math.min(labelCount, 10); i++) {
    const text = await labels.nth(i).textContent()
    console.log(`  label[${i}]: "${text}"`)
  }

  console.log('=== URL ===', page.url())
})
