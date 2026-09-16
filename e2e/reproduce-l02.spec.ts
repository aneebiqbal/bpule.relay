import { test } from '@playwright/test'

test('reproduce L02 click scenario', async ({ page }) => {
  await page.goto('/leads')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)

  const leadLink = page.locator('a[href*="/leads/"]').first()
  const has = await leadLink.isVisible({ timeout: 5000 }).catch(() => false)
  console.log('=== hasLead:', has)
  if (has) {
    const href = await leadLink.getAttribute('href')
    const text = (await leadLink.textContent())?.trim()
    console.log('=== first match href:', href, '| text:', text)
    await leadLink.click()
    await page.waitForLoadState('networkidle')
    console.log('=== URL after click:', page.url())
    await page.waitForTimeout(1500)
    console.log('=== URL after 1.5s:', page.url())
    const visible = await page.evaluate(() => document.body.innerText)
    console.log('=== visible text (600):', visible.slice(0, 600).replace(/\n+/g, ' | '))
  }
})