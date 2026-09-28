import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:3000'

async function run() {
  const browser = await chromium.launch({ headless: true })

  for (const vp of [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'laptop-1280', width: 1280, height: 800 },
    { name: 'tablet-1024', width: 1024, height: 768 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-390', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(3400)

    // Hero vertical composition
    const hero = await page.evaluate(() => {
      const field = document.querySelector('[data-field="hero"]')?.getBoundingClientRect()
      const card = document.querySelector('[data-field="hero"] ~ * .lg3-dtn, .lg3-hero .lg3-dtn')?.getBoundingClientRect()
      const featured = document.querySelector('[data-field="hero"] .lg3-node--featured')?.getBoundingClientRect()
      if (!field || !card || !featured) return { ok: false, why: 'missing elements' }
      const gap = card.top - featured.bottom
      return {
        ok: gap > -5 && featured.bottom <= card.bottom && featured.top >= field.top - 10,
        why: `featured ${Math.round(featured.top)}-${Math.round(featured.bottom)}, card ${Math.round(card.top)}-${Math.round(card.bottom)}, gap=${Math.round(gap)}px, fieldH=${Math.round(field.height)}`,
      }
    })
    console.log(`${hero.ok ? 'PASS' : 'FAIL'} [${vp.name}] hero featured→card vertical: ${hero.why}`)

    // Priority vertical/horizontal composition
    await page.locator('[data-section="priority"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(2400)
    const priority = await page.evaluate(() => {
      const card = document.querySelector('[data-field="priority"] .lg3-dtn')?.getBoundingClientRect()
      const featured = document.querySelector('[data-field="priority"] .lg3-node--featured')?.getBoundingClientRect()
      if (!card || !featured) return { ok: false, why: 'missing' }
      const vertical = card.top - featured.bottom
      const side = card.left - featured.right
      const vw = window.innerWidth
      const isMobile = vw < 900
      // Mobile: featured above card. Desktop: featured left of card.
      const ok = isMobile
        ? vertical > -5
        : side > -10 && Math.abs(featured.top - card.top) < 120
      return { ok, why: `featured ${Math.round(featured.left)}-${Math.round(featured.right)} @ ${Math.round(featured.top)}, card ${Math.round(card.left)} @ ${Math.round(card.top)}, vertical-gap=${Math.round(vertical)}, side-gap=${Math.round(side)}, vw=${vw}` }
    })
    console.log(`${priority.ok ? 'PASS' : 'FAIL'} [${vp.name}] priority featured↔card: ${priority.why}`)

    // Overflow re-check per breakpoint
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    console.log(`${overflow <= 0 ? 'PASS' : 'FAIL'} [${vp.name}] overflow=${overflow}px`)

    await context.close()
  }

  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
