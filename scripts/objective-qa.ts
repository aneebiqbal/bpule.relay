import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE_URL = 'http://localhost:3000'
const SCREENSHOT_DIR = join(process.cwd(), 'screenshots')
const MANIFEST_PATH = join(SCREENSHOT_DIR, 'manifest.json')

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
]

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/login', name: 'login' },
  { path: '/signup', name: 'signup' },
  { path: '/pricing', name: 'pricing' },
  { path: '/dashboard', name: 'today' },
  { path: '/leads', name: 'leads' },
  { path: '/leads/new', name: 'leads-new' },
  { path: '/prospect', name: 'prospect-check' },
  { path: '/relay', name: 'conversations' },
  { path: '/content', name: 'studio' },
  { path: '/upwork', name: 'jobs' },
  { path: '/profiles', name: 'profiles' },
  { path: '/facts', name: 'proof' },
  { path: '/usage', name: 'usage' },
  { path: '/account', name: 'settings' },
  { path: '/admin/command-center', name: 'admin' },
]

interface RouteResult {
  route: string
  name: string
  status: number
  redirectUrl?: string
  consoleErrors: string[]
  horizontalOverflow: boolean
  overflowingElements: string[]
  clickableElements: number
  keyboardReachable: boolean
  screenshotFiles: string[]
  loadTimeMs: number
}

async function testRoute(browser: any, route: any, viewport: any): Promise<RouteResult> {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()

  const consoleErrors: string[] = []
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text().substring(0, 200))
    }
  })
  page.on('pageerror', (err: any) => {
    consoleErrors.push(`pageerror: ${err.message?.substring(0, 200)}`)
  })

  const startTime = Date.now()
  let status = 0
  let redirectUrl: string | undefined

  try {
    const response = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    status = response?.status() || 0
    redirectUrl = response?.url() !== `${BASE_URL}${route.path}` ? response?.url() : undefined
    await page.waitForTimeout(1500)
  } catch (err: any) {
    consoleErrors.push(`navigation: ${err.message?.substring(0, 100)}`)
  }

  const loadTimeMs = Date.now() - startTime

  // Check horizontal overflow
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
  })

  // Check for overflowing elements (decorative excluded)
  const overflowingElements = await page.evaluate((viewportWidth: number) => {
    const results: string[] = []
    document.querySelectorAll('main *, aside *, header *').forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.right > viewportWidth + 1 || rect.left < -1) {
        if (!el.closest('[aria-hidden="true"]') && !el.classList.contains('pointer-events-none') &&
            !el.classList.contains('absolute') && !el.classList.contains('fixed')) {
          results.push(`${el.tagName}.${el.className?.substring(0, 40) || ''} [${Math.round(rect.left)}-${Math.round(rect.right)}]`)
        }
      }
    })
    return results.slice(0, 3)
  }, viewport.width)

  // Count interactive elements
  const clickableElements = await page.evaluate(() => {
    return document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="tab"], [role="link"]').length
  })

  // Test keyboard reachability
  let keyboardReachable = true
  try {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(200)
    const focused = await page.evaluate(() => document.activeElement?.tagName || 'none')
    keyboardReachable = focused !== 'BODY'
  } catch {
    keyboardReachable = false
  }

  // Capture screenshot
  const screenshotFiles: string[] = []
  const filename = `${route.name}-${viewport.name}.png`
  const filePath = join(SCREENSHOT_DIR, filename)
  try {
    await page.screenshot({ path: filePath, fullPage: false })
    screenshotFiles.push(filename)
  } catch {}

  await context.close()

  return {
    route: route.path,
    name: route.name,
    status,
    redirectUrl,
    consoleErrors,
    horizontalOverflow: overflow,
    overflowingElements,
    clickableElements,
    keyboardReachable,
    screenshotFiles,
    loadTimeMs,
  }
}

async function runQA() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const results: RouteResult[] = []

  for (const viewport of VIEWPORTS) {
    console.log(`\n=== Viewport: ${viewport.name}px ===`)
    for (const route of ROUTES) {
      const result = await testRoute(browser, route, viewport)
      results.push(result)

      const issues: string[] = []
      if (result.status >= 400) issues.push(`status=${result.status}`)
      if (result.horizontalOverflow) issues.push('OVERFLOW')
      if (result.consoleErrors.length > 0) issues.push(`${result.consoleErrors.length} console errors`)
      if (!result.keyboardReachable) issues.push('keyboard unreachable')
      if (result.overflowingElements.length > 0) issues.push(`${result.overflowingElements.length} overflowing els`)

      const status = issues.length === 0 ? 'PASS' : 'ISSUES'
      console.log(`  ${status} ${route.path} (${result.status}, ${result.loadTimeMs}ms)${issues.length ? ' — ' + issues.join(', ') : ''}`)
    }
  }

  await browser.close()

  // Write manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    viewports: VIEWPORTS.map((v) => v.name),
    routeCount: ROUTES.length,
    results,
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  console.log(`\nManifest written to: ${MANIFEST_PATH}`)

  // Summary
  const totalChecks = results.length
  const passed = results.filter((r) => !r.horizontalOverflow && r.consoleErrors.length === 0 && r.status < 400).length
  console.log(`\n=== SUMMARY ===`)
  console.log(`Total checks: ${totalChecks}`)
  console.log(`Passed: ${passed}`)
  console.log(`With issues: ${totalChecks - passed}`)

  const overflowRoutes = results.filter((r) => r.horizontalOverflow)
  if (overflowRoutes.length > 0) {
    console.log(`\nOverflow detected at:`)
    overflowRoutes.forEach((r) => console.log(`  ${r.route} @ ${r.screenshotFiles[0]?.split('-').pop()}`))
  }

  const consoleErrorRoutes = results.filter((r) => r.consoleErrors.length > 0)
  if (consoleErrorRoutes.length > 0) {
    console.log(`\nConsole errors at:`)
    consoleErrorRoutes.forEach((r) => {
      console.log(`  ${r.route}: ${r.consoleErrors.slice(0, 2).join('; ')}`)
    })
  }
}

runQA().catch(console.error)
