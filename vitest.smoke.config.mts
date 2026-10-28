/**
 * Vitest config for the live-provider smoke checks.
 *
 * Separate from the release contract on purpose: these tests need a real
 * provider key, so they must never be able to turn a release red or green.
 * `pnpm qa:live-provider` runs them as a non-gating environmental check.
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// The smoke checks need the provider credentials.
config({ path: path.resolve(dirname, '.env.local') })

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.smoke.ts'],    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
