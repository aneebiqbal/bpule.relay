import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:3000'

interface OverflowDetail {
  tag: string
  classes: string
  left: number
  right: number
  width: number
  viewportWidth: number
  text?: string
}

async function auditLandingOverflow() {
  const browser = await chromium.launch({ headless: true })

  const viewports = [
    { name: '1440', width: 1440, height: 900 },
    { name: '1280', width: 1280, height: 800 },
    { name: '1024', width: 1024, height: 768 },
    { name: '768', width: 768, height: 1024 },
    { name: '390', width: 390, height: 844 },
  ]

  for (const viewport of viewports) {
    console.log(`\n=== ${viewport.name}px ===`)
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(600)

    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    console.log(`Horizontal overflow: ${hasOverflow}`)
    console.log(`ScrollWidth: ${await page.evaluate(() => document.documentElement.scrollWidth)}`)
    console.log(`ClientWidth: ${await page.evaluate(() => document.documentElement.clientWidth)}`)

    const details: OverflowDetail[] = await page.evaluate((viewportWidth) => {
      const results: OverflowDetail[] = []
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.right > viewportWidth + 1 || rect.left < -1) {
          const text = el.textContent?.substring(0, 60).trim()
          results.push({
            tag: el.tagName.toLowerCase(),
            classes: (el.className || '').substring(0, 80),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            viewportWidth,
            text,
          })
        }
      })
      return results.slice(0, 8)
    }, viewport.width)

    if (details.length > 0) {
      console.log('Overflowing elements:')
      details.forEach((d, i) => {
        console.log(`  ${i + 1}. <${d.tag} class="${d.classes}">`)
        console.log(`     left=${d.left} right=${d.right} width=${d.width}`)
        if (d.text) console.log(`     text: "${d.text}"`)
      })
    }

    await context.close()
  }

  await browser.close()
}

auditLandingOverflow().catch(console.error)
