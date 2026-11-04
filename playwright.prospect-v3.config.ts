import { defineConfig, devices } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'

loadDotenv({ path: '.env.local' })

/**
 * Prospect V3 browser certification.
 *
 * Authentication happens once per role in globalSetup and is reused through
 * storageState — the main suite logs in per test, which rate-limits Supabase.
 *
 *   node e2e/prospect-global-setup.ts   (runs automatically via globalSetup)
 *   E2E_BASE_URL=https://localhost:3000 npx playwright test -c playwright.prospect-v3.config.ts
 *
 * Use HTTPS for local dev (`next dev --experimental-https`): Neon Auth session
 * cookies carry the `__Secure-` prefix and are refused over plain HTTP.
 */
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  testMatch: /prospect-v3.*\.spec\.ts/,
  globalSetup: './e2e/prospect-global-setup.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: BASE,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'admin',
      testIgnore: /prospect-v3-roles\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: './e2e/.auth/admin.json' },
    },
    {
      name: 'rep',
      testMatch: /prospect-v3-roles\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: './e2e/.auth/rep.json' },
    },
  ],
})
