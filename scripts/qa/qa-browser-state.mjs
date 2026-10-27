/**
 * Ingest a Playwright JSON artifact into the verified release state (Phase 22).
 *
 * The gate and the browser suite can run as separate jobs; this merges the
 * browser result into qa-artifacts/release-state.json without re-running
 * anything.
 *
 *   node scripts/qa/qa-browser-state.mjs --browser-json=qa-artifacts/browser.json
 */
import { readBrowserCounts, readReleaseState, writeReleaseState } from './release-lib.mjs'

const arg = process.argv.slice(2).find((a) => a.startsWith('--browser-json='))
if (!arg) {
  console.error('usage: qa:browser-state --browser-json=<file>')
  process.exit(2)
}
const file = arg.split('=')[1]

const state = readReleaseState()
if (!state) {
  console.error('No qa-artifacts/release-state.json. Run `pnpm qa:release` first.')
  process.exit(1)
}

const browser = readBrowserCounts(file)
if (browser.result === 'NOT_RUN') {
  console.error(`FAIL: no parseable browser artifact at ${file}`)
  process.exit(1)
}

writeReleaseState({ ...state, browser })
console.log(`browser: ${browser.result} cases=${browser.casesRun} passed=${browser.casesPassed} failed=${browser.casesFailed} flaky=${browser.casesFlaky}`)
console.log('updated qa-artifacts/release-state.json')
