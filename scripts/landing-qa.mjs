import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

const BASE_URL = 'http://localhost:3000'
const OUT_DIR = '/var/folders/m_/fv6fjwk9751_3_tknv5ff7ww0000gn/T/opencode/landing-qa'

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
]

async function run() {
  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()

    // Landing — hero settled state (wait past 3s sequence)
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(3600)
    await page.screenshot({ path: join(OUT_DIR, `hero-${vp.name}.png`) })

    // Full page
    await page.screenshot({ path: join(OUT_DIR, `full-${vp.name}.png`), fullPage: true })

    // Section-level shots (scroll each into view, let animations settle)
    const sections = ['product', 'priority', 'moves', 'conversation', 'studio-relay', 'close']
    for (const id of sections) {
      const el = page.locator(`[data-section="${id}"]`)
      if (await el.count()) {
        await el.scrollIntoViewIfNeeded()
        await page.waitForTimeout(2600)
        await page.screenshot({ path: join(OUT_DIR, `sec-${id}-${vp.name}.png`) })
      }
    }

    // Horizontal overflow check
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    console.log(`${vp.name}: overflow=${overflow}px`)

    await context.close()
  }

  // Reduced motion — final states
  const rmContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  const rmPage = await rmContext.newPage()
  await rmPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 20000 })
  await rmPage.waitForTimeout(800)
  await rmPage.screenshot({ path: join(OUT_DIR, 'reduced-hero-1440.png') })
  await rmPage.screenshot({ path: join(OUT_DIR, 'reduced-full-1440.png'), fullPage: true })
  await rmContext.close()

  await browser.close()
  console.log(`Screenshots → ${OUT_DIR}`)
}

run().catch((e) => { console.error(e); process.exit(1) })
