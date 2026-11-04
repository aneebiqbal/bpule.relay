import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One authentication per role, reused by every Prospect V3 browser test.
 *
 * Supabase rate-limits repeated password grants, so a matrix that logs in per
 * test degrades into flaky failures. This setup signs in once and persists the
 * storage state that `playwright.prospect-v3.config.ts` hands to each project.
 *
 * Credentials come from the demo seed (`hassan@scout.dev`, `madiha@scout.dev`).
 */
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'
const OUT_DIR = join(process.cwd(), 'e2e/.auth')
const USERS = [
  { role: 'admin', email: 'hassan@scout.dev' },
  { role: 'rep', email: 'madiha@scout.dev' },
]
const PASSWORD = 'scout-dev-password'

async function signIn(role: string, email: string): Promise<string | null> {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page = await context.newPage()
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    if (!page.url().includes('/login')) return JSON.stringify(await context.storageState())

    await page.waitForSelector('#login-email', { timeout: 60_000 })
    await page.evaluate(
      ({ email: e, password }: { email: string; password: string }) => {
        const set = (el: HTMLInputElement, value: string) => {
          const input = el as HTMLInputElement & { _valueTracker?: { setValue: (v: string) => void } }
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
          input._valueTracker?.setValue('')
          setter.call(el, value)
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
        set(document.querySelector('#login-email')!, e)
        set(document.querySelector('#login-password')!, password)
      },
      { email, password: PASSWORD },
    )
    await page.waitForFunction(() => {
      const btn = document.querySelector('form button[type="submit"]')
      return btn instanceof HTMLButtonElement && !btn.disabled
    }, { timeout: 60_000 })
    await Promise.all([
      page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 60_000 }),
      page.evaluate(() => (document.querySelector('form button[type="submit"]') as HTMLButtonElement).click()),
    ])
    return JSON.stringify(await context.storageState())
  } catch (err) {
    console.error(`[prospect-setup] ${role} sign-in failed: ${(err as Error).message?.slice(0, 200)}`)
    return null
  } finally {
    await browser.close()
  }
}

export default async function globalSetup() {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const user of USERS) {
    const state = await signIn(user.role, user.email)
    const file = join(OUT_DIR, `${user.role}.json`)
    writeFileSync(file, state ?? '{}')
    console.log(`[prospect-setup] ${user.role}: ${state ? 'ok' : 'FAILED'} -> ${file}`)
  }
}
