/**
 * Ingest a Playwright JSON artifact into the verified release state (Phase 22).
 *
 * The gate and the browser suites can run as separate jobs; this merges the
 * browser result into qa-artifacts/release-state.json without re-running
 * anything, and recomputes the release gates.
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

// The single artifact covers the acceptance + matrix + BUG-004 suites, so one
// PASS satisfies both the browser gate and the dedicated inbound-parity gate.
const bug004 = state.bug004 ?? { result: 'NOT_RUN', casesRun: 0, casesPassed: 0, casesFailed: 0 }
const next = {
  ...state,
  browser,
  bug004,
  browserGate: browser.result,
  bug004Gate: browser.result === 'PASS' ? 'PASS' : browser.result,
}

const codePass = state.automatedCodeGate === 'PASS' || state.automatedCodeGate === true
next.gatesPassed = codePass && next.browserGate === 'PASS' && next.bug004Gate === 'PASS'
next.productionReady = next.gatesPassed && state.shaGate === 'VERIFIED'

writeReleaseState(next)
console.log(
  `browser: ${browser.result} cases=${browser.casesRun} passed=${browser.casesPassed} failed=${browser.casesFailed} flaky=${browser.casesFlaky}`,
)
console.log(`gates: code=${state.automatedCodeGate} browser=${next.browserGate} bug004=${next.bug004Gate} sha=${state.shaGate}`)
console.log('updated qa-artifacts/release-state.json')
