import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env.local for tests that need AI provider credentials
config({ path: path.resolve(dirname, '.env.local') })

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,

  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
})
