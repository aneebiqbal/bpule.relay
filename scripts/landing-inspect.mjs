import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:3000'

async function inspect(page, label) {
  return page.evaluate((label) => {
    const out = []
    const log = (name, ok, detail) => out.push(`${ok ? 'PASS' : 'FAIL'} [${label}] ${name}${detail ? ' — ' + detail : ''}`)
    const q = (sel) => document.querySelector(sel)
    const rect = (sel) => { const el = q(sel); if (!el) return null; return { r: el.getBoundingClientRect(), cs: getComputedStyle(el), el } }

    // Priority (after scroll + settle)
    const chips = document.querySelectorAll('[data-field="priority"] .lg3-node--chip')
    const visibleChips = [...chips].filter((n) => parseFloat(getComputedStyle(n).opacity) > 0.15)
    log('priority.chips visible', visibleChips.length >= 6, `${visibleChips.length}/${chips.length}`)
    const pFeatured = rect('[data-field="priority"] .lg3-node--featured')
    log('priority.featured orange chip', !!pFeatured)
    const pDtn = rect('[data-field="priority"] .lg3-dtn')
    log('priority.card visible', pDtn && pDtn.cs.opacity === '1', pDtn ? `${Math.round(pDtn.r.width)}w @ ${Math.round(pDtn.r.left)},${Math.round(pDtn.r.top)}` : 'missing')
    if (pFeatured && pDtn) {
      log('priority.card right of featured', pDtn.r.left > pFeatured.r.right - 40, `featured ${Math.round(pFeatured.r.left)}-${Math.round(pFeatured.r.right)}, card ${Math.round(pDtn.r.left)}`)
    }
    // card within viewport horizontally
    if (pDtn) log('priority.card in viewport', pDtn.r.left >= 0 && pDtn.r.right <= window.innerWidth, `card ${Math.round(pDtn.r.left)}-${Math.round(pDtn.r.right)} vs vw ${window.innerWidth}`)

    // Handoff final state
    const captures = [...document.querySelectorAll('[data-capture-row]')].filter((r) => parseFloat(getComputedStyle(r).opacity) > 0.95)
    log('handoff.capture rows visible', captures.length === 3, `${captures.length}/3`)
    const dot = q('[data-handoff-dot]')
    log('handoff.dot arrived', dot?.classList.contains('is-arrived'))
    const svgVisible = [...document.querySelectorAll('.lg3-handoff__svg')].find((s) => getComputedStyle(s).display !== 'none')
    log('handoff.one svg visible', !!svgVisible)

    // Move section layout
    const yoursCol = rect('[data-stack="yours"]')
    const theirsCol = rect('[data-stack="theirs"]')
    if (yoursCol && theirsCol) {
      const sideBySide = theirsCol.r.left > yoursCol.r.right - 10
      const stacked = theirsCol.r.top > yoursCol.r.bottom - 10
      log('moves.layout', sideBySide || stacked, sideBySide ? 'columns' : stacked ? 'stacked' : 'broken')
    }

    // Conversation
    const rail = rect('.lg3-convo__rail')
    const thread = rect('.lg3-convo__thread')
    if (rail && thread) log('convo.layout', thread.r.left > rail.r.right - 10 || thread.r.top > rail.r.bottom - 10, 'ok')

    // Footer
    const footer = rect('.marketing-footer')
    log('footer visible', footer && footer.r.height > 60)

    // No horizontal overflow anywhere
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
    log('no h-overflow', overflow <= 0, `${overflow}px`)

    return out
  }, label)
}

async function run() {
  const browser = await chromium.launch({ headless: true })

  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(1000)

    // Mobile hero specifics
    if (vp.name === 'mobile') {
      await page.waitForTimeout(2600)
      const m = await page.evaluate(() => {
        const out = []
        const log = (name, ok, detail) => out.push(`${ok ? 'PASS' : 'FAIL'} [mobile-hero] ${name}${detail ? ' — ' + detail : ''}`)
        const field = document.querySelector('[data-field="hero"]')?.getBoundingClientRect()
        log('field below content', field ? field.top > 300 : false, field ? `top=${Math.round(field.top)}` : 'missing')
        const card = document.querySelector('.lg3-dtn')?.getBoundingClientRect()
        log('card fits width', card ? card.left >= 8 && card.right <= window.innerWidth - 8 : false, card ? `${Math.round(card.left)}-${Math.round(card.right)} vw=${window.innerWidth}` : 'missing')
        const minors = [...document.querySelectorAll('.lg3-node--minor')].filter((n) => getComputedStyle(n).display !== 'none')
        log('minor nodes hidden', minors.length === 0, `${minors.length} visible`)
        const visible = [...document.querySelectorAll('[data-field="hero"] .lg3-node')].filter((n) => getComputedStyle(n).display !== 'none' && parseFloat(getComputedStyle(n).opacity) > 0.1)
        log('mobile node count', visible.length >= 7 && visible.length <= 12, `${visible.length}`)
        return out
      })
      console.log(m.join('\n'))
    }

    // Scroll through each section, settle, then inspect
    const sections = ['priority', 'moves', 'conversation', 'studio-relay', 'close']
    for (const id of sections) {
      await page.locator(`[data-section="${id}"]`).scrollIntoViewIfNeeded()
      await page.waitForTimeout(id === 'studio-relay' ? 5200 : 2600)
    }
    const report = await inspect(page, vp.name)
    console.log(report.join('\n'))

    await context.close()
  }

  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
