import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

const BASE_URL = 'http://localhost:3000'
const SCREENSHOT_DIR = join(process.cwd(), 'screenshots')

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
]

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/login', name: 'login' },
  { path: '/signup', name: 'signup' },
  { path: '/pricing', name: 'pricing' },
]

const AUTH_ROUTES = [
  { path: '/dashboard', name: 'today' },
  { path: '/leads', name: 'leads' },
  { path: '/prospect', name: 'prospect-check' },
  { path: '/relay', name: 'conversations' },
  { path: '/content', name: 'studio' },
  { path: '/profiles', name: 'profiles' },
  { path: '/facts', name: 'proof' },
  { path: '/upwork', name: 'jobs' },
  { path: '/admin/command-center', name: 'admin' },
  { path: '/usage', name: 'usage' },
  { path: '/account', name: 'settings' },
]

async function captureScreenshots() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })

  // Capture public routes
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    })
    const page = await context.newPage()

    for (const route of ROUTES) {
      try {
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 15000 })
        await page.waitForTimeout(1000)
        const filename = `${route.name}-${viewport.name}.png`
        await page.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: false })
        console.log(`Captured: ${filename}`)
      } catch (err) {
        console.error(`Failed: ${route.name} at ${viewport.name}: ${err.message}`)
      }
    }

    await context.close()
  }

  // Capture auth routes (will redirect to login, but let's see the login page at different widths)
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    })
    const page = await context.newPage()

    for (const route of AUTH_ROUTES) {
      try {
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'networkidle', timeout: 15000 })
        await page.waitForTimeout(500)
        const filename = `${route.name}-${viewport.name}.png`
        await page.screenshot({ path: join(SCREENSHOT_DIR, filename), fullPage: false })
        console.log(`Captured: ${filename}`)
      } catch (err) {
        console.error(`Failed: ${route.name} at ${viewport.name}: ${err.message}`)
      }
    }

    await context.close()
  }

  await browser.close()
  console.log('\nAll screenshots captured to:', SCREENSHOT_DIR)
}

captureScreenshots().catch(console.error)
