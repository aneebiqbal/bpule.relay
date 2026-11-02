import { defineConfig, devices } from '@playwright/test'

/**
 * Phase 8 browser certification against the LOCAL SYNTHETIC stack only
 * (production schema + pending migrations + fictional seed; see
 * docs/RELAY_PHASE8_SYNTHETIC_CERTIFICATION.md). Never point this at a real
 * deployment: the spec signs in as seeded @relay-synth.test users.
 *
 *   SYNTH_PASSWORD=… SYNTH_TRUTH=…/truth.json SYNTH_CAST=…/cast.json \
 *   E2E_BASE_URL=http://127.0.0.1:3200 npx playwright test -c playwright.synthetic.config.ts
 */
export default defineConfig({
  testDir: './e2e/synthetic',
  globalSetup: './e2e/synthetic/global-setup.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/phase8-synthetic/results.json' }]],
  timeout: 180_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
