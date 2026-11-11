import { chromium } from 'playwright'
const base = 'https://relay.bpulse.dev'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#login-email')
await page.locator('#login-email').pressSequentially('hassan@scout.dev', { delay: 3 })
await page.locator('#login-password').pressSequentially('scout-dev-password', { delay: 3 })
await page.getByRole('button', { name: /sign in with password/i }).click()
await page.waitForFunction(() => /^\/(dashboard|onboarding|chats)/.test(location.pathname))
await page.goto(`${base}/leads`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const href = await page.locator('table tbody tr a[href^="/leads/"]').first().getAttribute('href')
const leadId = href.match(/^\/leads\/([0-9a-f-]{36})/)[1]
await page.goto(`${base}/leads/${leadId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' })
const out = await page.evaluate(async () => {
  const r = await window.axe.run(document, { resultTypes: ['violations'] })
  return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => ({
    id: v.id, impact: v.impact,
    nodes: v.nodes.map(n => ({
      target: n.target, html: n.html?.slice(0, 160),
      data: n.any?.[0]?.data ? { fg: n.any[0].data.fgColor, bg: n.any[0].data.bgColor, ratio: n.any[0].data.contrastRatio, size: n.any[0].data.fontSize } : null,
    }))
  }))
})
console.log(out.map(v=>v.id+' '+v.impact+' :: '+v.nodes.map(n=>(n.target||[]).join(' ')+' | '+(n.html||'').slice(0,60)+' | '+JSON.stringify(n.data)).join(' ;; ')).join('\n'))
await browser.close()
