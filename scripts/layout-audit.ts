import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE_URL = 'http://localhost:3000'
const REPORT_DIR = join(process.cwd(), 'audit-reports')

interface LayoutIssue {
  type: 'overflow' | 'misalignment' | 'inconsistent-spacing' | 'contrast' | 'sizing'
  severity: 'critical' | 'warning' | 'info'
  element: string
  message: string
  value?: string
  expected?: string
}

async function auditPage(browser: Browser, path: string, name: string, viewport: { width: number; height: number }) {
  const issues: LayoutIssue[] = []
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()

  try {
    const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)

    // Check for horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    if (hasOverflow) {
      issues.push({
        type: 'overflow',
        severity: 'critical',
        element: 'document',
        message: 'Horizontal overflow detected',
        value: `${await page.evaluate(() => document.documentElement.scrollWidth)}px`,
        expected: `${viewport.width}px`,
      })
    }

    // Check for elements extending beyond viewport
    const overflowingElements = await page.evaluate(() => {
      const results: string[] = []
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect()
        if (rect.right > document.documentElement.clientWidth + 1 || rect.left < -1) {
          results.push(`${el.tagName}.${el.className}: left=${Math.round(rect.left)}, right=${Math.round(rect.right)}`)
        }
      })
      return results.slice(0, 10)
    })
    overflowingElements.forEach((el) => {
      issues.push({
        type: 'overflow',
        severity: 'critical',
        element: el,
        message: 'Element extends beyond viewport',
      })
    })

    // Check sidebar width consistency
    const sidebarInfo = await page.evaluate(() => {
      const sidebar = document.querySelector('aside')
      if (!sidebar) return null
      const rect = sidebar.getBoundingClientRect()
      return { width: rect.width, left: rect.left }
    })
    if (sidebarInfo && Math.abs(sidebarInfo.width - 224) > 2) {
      issues.push({
        type: 'sizing',
        severity: 'warning',
        element: 'aside (sidebar)',
        message: 'Sidebar width inconsistent with design token',
        value: `${sidebarInfo.width}px`,
        expected: '224px (14rem)',
      })
    }

    // Check for shadow-sm overuse
    const shadowCount = await page.evaluate(() => {
      let count = 0
      document.querySelectorAll('*').forEach((el) => {
        const style = window.getComputedStyle(el)
        if (style.boxShadow && style.boxShadow !== 'none' && style.boxShadow.includes('0 1px 2px')) {
          count++
        }
      })
      return count
    })
    if (shadowCount > 8) {
      issues.push({
        type: 'inconsistent-spacing',
        severity: 'warning',
        element: 'multiple',
        message: `Excessive use of shadow-sm (${shadowCount} elements) — consider if all need elevation`,
      })
    }

    // Check for arbitrary Tailwind values common patterns
    const arbitraryValues = await page.evaluate(() => {
      const problems: string[] = []
      document.querySelectorAll('*').forEach((el) => {
        const cls = el.className
        if (typeof cls === 'string') {
          // Check for off-design-system spacing values
          const matches = cls.match(/\[(px|rem|em)\]/)
          if (matches) {
            problems.push(`${cls.substring(0, 80)}: ${matches[0]}`)
          }
        }
      })
      return problems.slice(0, 10)
    })
    arbitraryValues.forEach((v) => {
      issues.push({
        type: 'inconsistent-spacing',
        severity: 'info',
        element: v,
        message: 'Arbitrary Tailwind value detected — verify against spacing scale',
      })
    })

    // Check font rendering
    const fontInfo = await page.evaluate(() => {
      const body = document.body
      const style = window.getComputedStyle(body)
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
      }
    })
    if (!fontInfo.fontFamily.includes('IBM Plex')) {
      issues.push({
        type: 'sizing',
        severity: 'warning',
        element: 'body',
        message: 'Body font may not be IBM Plex Sans',
        value: fontInfo.fontFamily.substring(0, 60),
      })
    }

    // Check main content area width
    const mainContent = await page.evaluate(() => {
      const main = document.querySelector('main')
      if (!main) return null
      const rect = main.getBoundingClientRect()
      return { width: rect.width, maxWidth: window.getComputedStyle(main).maxWidth }
    })
    if (mainContent && viewport.width >= 1024) {
      if (mainContent.width > 1024) {
        issues.push({
          type: 'sizing',
          severity: 'info',
          element: 'main',
          message: 'Main content width exceeds comfortable reading width',
          value: `${Math.round(mainContent.width)}px`,
        })
      }
    }

    // Check for text truncation issues
    const truncatedElements = await page.evaluate(() => {
      const results: string[] = []
      document.querySelectorAll('*').forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
          const text = el.textContent?.substring(0, 50)
          if (text && text.trim()) {
            results.push(`${el.tagName}: "${text.trim()}..."`)
          }
        }
      })
      return results.slice(0, 5)
    })
    truncatedElements.forEach((el) => {
      issues.push({
        type: 'misalignment',
        severity: 'warning',
        element: el,
        message: 'Possible unintended text truncation',
      })
    })

    // Capture full page HTML for inspection
    const html = await page.content()
    writeFileSync(join(REPORT_DIR, `${name}-${viewport.width}.html`), html)

  } catch (err) {
    issues.push({
      type: 'sizing',
      severity: 'critical',
      element: 'page',
      message: `Failed to load: ${err.message}`,
    })
  }

  await context.close()
  return issues
}

async function runAudit() {
  mkdirSync(REPORT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const allIssues: Record<string, LayoutIssue[]> = {}

  const viewports = [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]

  const routes = [
    { path: '/', name: 'landing' },
    { path: '/login', name: 'login' },
    { path: '/signup', name: 'signup' },
    { path: '/leads', name: 'leads' },
    { path: '/prospect', name: 'prospect-check' },
    { path: '/account', name: 'settings' },
    { path: '/usage', name: 'usage' },
  ]

  for (const route of routes) {
    for (const viewport of viewports.slice(0, 4)) {
      const key = `${route.name}@${viewport.width}`
      console.log(`Auditing: ${key}`)
      allIssues[key] = await auditPage(browser, route.path, route.name, viewport)
    }
  }

  await browser.close()

  // Write summary report
  const summary = Object.entries(allIssues).map(([key, issues]) => {
    const critical = issues.filter((i) => i.severity === 'critical').length
    const warnings = issues.filter((i) => i.severity === 'warning').length
    const info = issues.filter((i) => i.severity === 'info').length
    return `${key}: ${critical} critical, ${warnings} warnings, ${info} info`
  }).join('\n')

  writeFileSync(join(REPORT_DIR, 'summary.txt'), summary)
  console.log('\n=== AUDIT SUMMARY ===')
  console.log(summary)
  console.log('\nDetailed reports in:', REPORT_DIR)
}

runAudit().catch(console.error)
