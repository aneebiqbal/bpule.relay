import { test, expect, type Page, request as requestFixture } from '@playwright/test'

const ADMIN_EMAIL = 'hassan@scout.dev'
const REP_EMAIL = 'madiha@scout.dev'
const PASSWORD = 'scout-dev-password'

/** Bootstrap demo profile via onboarding API. Failures are non-fatal (app tolerates). */
export async function bootstrapDemoProfile(baseURL: string) {
  try {
    const ctx = await requestFixture.newContext({ baseURL })
    const res = await ctx.post('/api/onboarding', {
      data: {
        quiz: {
          contractions: 'sometimes',
          formality: 3,
          sentenceLength: 'medium',
          punctuation: 'standard',
          openers: 'statement',
          emoji: 'none',
          greeting: 'Hey',
          signOff: 'Best',
          neverWords: '',
          preferredWords: '',
        },
        samples: 'demo mode e2e',
      },
    })
    await res.ok()
    await ctx.dispose()
  } catch {
    // Non-fatal: some routes don't require onboarding
  }
}

async function loginWith(page: Page, email: string): Promise<void> {
  // Demo mode auto-authenticates but may redirect to /onboarding if no profile.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  const needsForm = page.url().includes('/login')
  if (needsForm) {
    const emailInput = page
      .locator('input[type="email"], input[name="email"], input[placeholder*="email" i]')
      .first()
    const passInput = page.locator('input[type="password"], input[name="password"]').first()
    const submitBtn = page
      .locator('button:has-text("Sign in"), button:has-text("Log in"), button[type="submit"]')
      .first()

    await emailInput.fill(email)
    await passInput.fill(PASSWORD)
    await submitBtn.click()
  }

  // Handle demo-mode onboarding redirect: bootstrap profile then retry.
  if (page.url().includes('/onboarding')) {
    const origin = new URL(page.url()).origin
    await bootstrapDemoProfile(origin)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  }

  await expect(page).toHaveURL(/dashboard/, { timeout: 20_000 })
  await page.waitForLoadState('networkidle')
}

export async function loginAsAdmin(page: Page) {
  await loginWith(page, ADMIN_EMAIL)
}

export async function loginAsRep(page: Page) {
  await loginWith(page, REP_EMAIL)
}

export async function logout(page: Page) {
  const userMenu = page
    .locator('button:has-text("Sign out"), button:has-text("Logout"), [data-testid="user-menu"]')
    .first()
  if (await userMenu.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await userMenu.click()
  }
}