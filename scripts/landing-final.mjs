import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:3000'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  // Track transferred JS for the landing page
  let jsBytes = 0
  page.on('response', async (res) => {
    const url = res.url()
    if (url.includes('/_next/static/') && (url.endsWith('.js') || url.includes('.js?'))) {
      try { jsBytes += parseInt(res.headers()['content-length'] || '0', 10) } catch {}
    }
  })

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(3200)
  console.log(`JS transferred (approx, uncompressed headers where available): ${(jsBytes / 1024).toFixed(0)}KB`)

  // Nav signal color shifts cobalt inside the Studio chapter
  await page.locator('[data-section="studio-relay"]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  const navState = await page.evaluate(() => {
    const status = document.querySelector('.lg3-nav__status')
    const dot = document.querySelector('.lg3-nav__dot')
    return {
      label: status?.textContent,
      dotColor: dot ? getComputedStyle(dot).backgroundColor : 'none',
    }
  })
  const cobalt = navState.dotColor === 'rgb(59, 91, 219)'
  console.log(`${cobalt ? 'PASS' : 'FAIL'} nav turns cobalt in studio — label="${navState.label}" dot=${navState.dotColor}`)

  // Scroll back to hero — nav returns orange
  await page.locator('#hero').scrollIntoViewIfNeeded()
  await page.waitForTimeout(800)
  const backOrange = await page.evaluate(() => getComputedStyle(document.querySelector('.lg3-nav__dot')).backgroundColor)
  console.log(`${backOrange === 'rgb(212, 101, 47)' ? 'PASS' : 'FAIL'} nav returns orange at hero — ${backOrange}`)

  // Mobile: handoff path is vertical, dot travels downward
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const mPage = await mCtx.newPage()
  await mPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 })
  await mPage.locator('[data-section="studio-relay"]').scrollIntoViewIfNeeded()
  await mPage.waitForTimeout(5500)
  const mHandoff = await mPage.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-capture-row]')].filter((r) => parseFloat(getComputedStyle(r).opacity) > 0.95)
    const dot = document.querySelector('[data-handoff-dot]')
    const studio = document.querySelector('[data-handoff-side="studio"]')?.getBoundingClientRect()
    const relay = document.querySelector('[data-handoff-side="relay"]')?.getBoundingClientRect()
    return {
      rows: rows.length,
      arrived: dot?.classList.contains('is-arrived'),
      vertical: studio && relay ? relay.top > studio.bottom : false,
    }
  })
  console.log(`${mHandoff.rows === 3 ? 'PASS' : 'FAIL'} mobile handoff rows — ${mHandoff.rows}/3`)
  console.log(`${mHandoff.arrived ? 'PASS' : 'FAIL'} mobile dot arrived`)
  console.log(`${mHandoff.vertical ? 'PASS' : 'FAIL'} mobile studio above relay (vertical handoff)`)
  await mCtx.close()

  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
