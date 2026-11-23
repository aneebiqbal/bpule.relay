#!/usr/bin/env node
/**
 * Safe entry point for the live database suite.
 *
 *   RELAY_TEST_DATABASE=1 node scripts/qa/run-live-tests.mjs
 *
 * The guard runs here first (fail fast, before Vitest starts) and again in
 * `vitest.live.config.mts` and the global setup. A production URL is rejected
 * even if another variable claims it is staging.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dirname, '../..')

config({ path: path.join(root, '.env.test') })
config({ path: path.join(root, '.env.local') })

const { assertLiveTestIsolation, describeDatabaseTarget } = await import(
  path.join(root, 'src/lib/db/test-isolation.ts')
)

try {
  assertLiveTestIsolation()
} catch (error) {
  console.error(`[live-tests] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

console.log(`[live-tests] target: ${describeDatabaseTarget()}`)

const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.live.config.mts'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})
process.exit(result.status ?? 1)
