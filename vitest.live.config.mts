import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { assertLiveTestIsolation } from './src/lib/db/test-isolation'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Live-DB suite: these tests read and write a database, so they run serially
// (never in parallel with each other or the unit suite) and with generous
// timeouts for a ~1s/query host.
//
// `.env.test` is the opt-in disposable-database configuration and is loaded
// first; `.env.local` is the developer fallback. The fail-closed guard runs at
// config load, before any test module can open a connection.
config({ path: path.resolve(dirname, '.env.test') })
config({ path: path.resolve(dirname, '.env.local') })

assertLiveTestIsolation()

export const LIVE_TEST_FILES = [
  'tests/accountability-service.test.ts',
  'tests/job-retention-contracts.test.ts',
  'tests/lead-sender-profile-visibility.test.ts',
  'tests/migration-version-contracts.test.ts',
  'tests/neon-adapter-contracts.test.ts',
  'tests/operator-visibility.live.test.ts',
  'tests/plan-progress-contracts.test.ts',
  'tests/profile-ownership-contracts.test.ts',
  'tests/profile-truth-parity.test.ts',
  'tests/relay-app-integration.test.ts',
  'tests/responsibility-coverage-contracts.test.ts',
  'tests/runtime-request-paths.test.ts',
  'tests/v6-live-coverage-acceptance.test.ts',
  'tests/v61-completion-idempotency.test.ts',
  'tests/v611-multi-operator-acceptance.test.ts',
  'tests/v611-multi-operator-contracts.test.ts',
  'tests/v63-enrichment-behavior.test.ts',
  'tests/v63-provider-discovery-contracts.test.ts',
  'tests/v631-email-target-contracts.test.ts',
  'tests/v631-live-provider.test.ts',
  'tests/v631-provider-rls-contracts.test.ts',
  'tests/v631-stale-job-reaper.test.ts',
  'tests/v632-health-parity.test.ts',
  'tests/v632-live-discovery.test.ts',
  'tests/job-discovery-ingest.live.test.ts',
] as const

export default defineConfig({
  test: {
    environment: 'node',
    include: [...LIVE_TEST_FILES],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 120_000,
    teardownTimeout: 120_000,
    globalSetup: 'tests/live-global-setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      'next/headers': path.resolve(dirname, 'node_modules/next/headers.js'),
    },
  },
})
