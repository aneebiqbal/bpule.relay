import { chromium, type FullConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

export const SYNTH_ROLES = ['owner', 'admin', 'manager', 'rep1', 'rep2', 'adminb'] as const
export type SynthRole = (typeof SYNTH_ROLES)[number]
export const STATE_DIR = path.resolve('test-results/phase8-synthetic/state')

/** Signs each seeded role in through the real login form once; tests reuse the session. */
export default async function globalSetup(config: FullConfig) {
  const password = process.env.SYNTH_PASSWORD
  if (!password) return
  const baseURL = config.projects[0].use.baseURL as string
  fs.mkdirSync(STATE_DIR, { recursive: true })
  const browser = await chromium.launch()
  for (const role of SYNTH_ROLES) {
    const context = await browser.newContext({ baseURL })
    const page = await context.newPage()
    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.locator('#login-email').fill(`${role}@relay-synth.test`)
    await page.locator('#login-password').fill(password)
    await page.getByRole('button', { name: 'Sign in with password' }).click()
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60_000 })
    await context.storageState({ path: path.join(STATE_DIR, `${role}.json`) })
    await context.close()
  }
  await browser.close()
}
