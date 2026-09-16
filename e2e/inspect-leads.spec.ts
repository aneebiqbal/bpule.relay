import { test } from '@playwright/test'

test('inspect leads page anchors', async ({ page }) => {
  await page.goto('/leads')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  const hrefs = await page.locator('a[href]').evaluateAll((els) =>
    els.map((el) => (el as HTMLAnchorElement).getAttribute('href')).slice(0, 25),
  )
  console.log('=== anchor hrefs (first 25) ===')
  for (const h of hrefs) console.log('  ', h)

  const matching = await page.locator('a[href*="/leads/"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLAnchorElement).getAttribute('href')),
  )
  console.log('=== a[href*="/leads/"] matches ===')
  for (const h of matching) console.log('  ', h)
})