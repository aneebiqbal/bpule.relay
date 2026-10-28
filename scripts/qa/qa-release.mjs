/**
 * Release gate (Phase 9 / 34 / 21 / 22).
 *
 * Runs every automated gate in order, writes the verified release state to
 * qa-artifacts/release-state.json, and prints one human-readable report.
 *
 * The browser suite runs only when E2E_BASE_URL is set; otherwise it is
 * recorded as NOT_RUN with the reason — never silently skipped as PASS.
 *
 *   node scripts/qa/qa-release.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  ARTIFACTS_DIR,
  countCorpusFixtures,
  gitSha,
  latestMigration,
  readApiVersion,
  readBrowserCounts,
  readVitestCounts,
  writeReleaseState,
} from './release-lib.mjs'
import { evaluateReleaseGates, renderReleaseGateReport } from './release-gates.mjs'

const VITEST_JSON = path.join(ARTIFACTS_DIR, 'vitest.json')
const BROWSER_JSON = path.join(ARTIFACTS_DIR, 'browser.json')
const BUG004_JSON = path.join(ARTIFACTS_DIR, 'browser-bug-004.json')

mkdirSync(ARTIFACTS_DIR, { recursive: true })

function step(name, command, opts = {}) {
  return { name, command, ...opts }
}

const STEPS = [
  step('PRODUCT CONTRACTS', ['node', 'scripts/qa/contract-coverage.mjs']),
  step('SEMANTIC BUYER QUESTIONS', ['npx', 'vitest', 'run', 'tests/qa-relay-semantic-buyer-questions.test.ts', '--silent']),
  step('EXPLANATION CONSISTENCY', ['npx', 'vitest', 'run', 'tests/qa-relay-explanation-consistency.test.ts', '--silent']),
  step('MESSAGE QUALITY', ['npx', 'vitest', 'run', 'tests/qa-relay-message-quality-invariants.test.ts', '--silent']),
  step('REGRESSION CORPUS', ['npx', 'vitest', 'run', 'tests/relay-regression-corpus.test.ts', '--silent']),
  step('LEAD PARITY', ['npx', 'vitest', 'run', 'tests/qa-relay-cross-surface-parity.test.ts', '--silent']),
  step('CONTRACT OWNERS', ['npx', 'vitest', 'run', 'tests/relay-contract-owners.test.ts', '--silent']),
  step('RELEASE GATE LOGIC', ['npx', 'vitest', 'run', 'tests/qa-relay-release-gate.test.ts', '--silent']),
  step('TYPECHECK', ['npx', 'tsc', '--noEmit']),
  step('LINT', ['npx', 'eslint']),
  step('UNIT', ['npx', 'vitest', 'run', '--silent', '--reporter=json', `--outputFile=${VITEST_JSON}`]),
]

// Build runs AFTER the browser suite: the browser validates the running build,
// and a rebuild would replace .next underneath the server.
const BUILD_STEP = step('BUILD', ['npx', 'next', 'build'])

function runStep(s) {
  try {
    execFileSync(s.command[0], s.command.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, ...(s.env ?? {}) },
    })
    return { ok: true, detail: '' }
  } catch (err) {
    const stderr = err.stderr?.toString().slice(-2000) ?? ''
    return { ok: false, detail: stderr }
  }
}

/**
 * Run one Playwright spec against E2E_BASE_URL and read its counts.
 * NOT_RUN carries a reason — a browser gate is never a silent PASS.
 */
function runBrowserSpec(specs, jsonFile) {
  const baseURL = process.env.E2E_BASE_URL
  if (!baseURL) {
    return { result: 'NOT_RUN', casesRun: 0, casesPassed: 0, casesFailed: 0, reason: 'E2E_BASE_URL not set' }
  }
  const result = runStep(
    step(
      'BROWSER',
      ['npx', 'playwright', 'test', ...specs, '--project=desktop-chrome', '--reporter=json'],
      // The JSON reporter writes to PLAYWRIGHT_JSON_OUTPUT_NAME, not --output
      // (which is the test-artifact directory).
      { env: { PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile } },
    ),
  )
  const counts = readBrowserCounts(jsonFile)
  return { ...counts, reason: result.ok ? null : 'one or more browser cases failed' }
}

/**
 * The browser gates.
 *
 * BUG-004 runs as a DEDICATED hard gate, separately from the acceptance suite.
 * `createLead` writes a real `messages` row — the riskiest persistence/state
 * change in the batch — and its proof must come from a real row in a real
 * database, not from a unit test. Combining it into one undifferentiated
 * browser number is exactly how that proof gets skipped.
 */
function runBrowser() {
  // Separate CI jobs can run the browser suites and hand their JSON artifacts in.
  const jsonArgs = process.argv.slice(2).filter((a) => a.startsWith('--browser-json='))
  if (jsonArgs.length > 0) {
    const results = jsonArgs.map((a) => readBrowserCounts(a.split('=')[1]))
    const casesRun = results.reduce((s, r) => s + r.casesRun, 0)
    const casesPassed = results.reduce((s, r) => s + r.casesPassed, 0)
    const casesFailed = results.reduce((s, r) => s + r.casesFailed, 0)
    const result = casesRun === 0 ? 'NOT_RUN' : casesFailed > 0 ? 'FAIL' : 'PASS'
    return {
      result,
      casesRun,
      casesPassed,
      casesFailed,
      reason: result === 'NOT_RUN' ? 'no parseable browser artifact' : null,
      // A hand-in artifact cannot be attributed per spec, so the dedicated
      // BUG-004 gate is reported as unverified rather than guessed.
      bug004: { result: 'NOT_RUN', casesRun: 0, casesPassed: 0, casesFailed: 0, reason: 'browser results handed in as one artifact; BUG-004 not separately verified' },
    }
  }

  const acceptance = runBrowserSpec(
    ['e2e/rc-browser-acceptance.spec.ts', 'e2e/rc-browser-matrix.spec.ts'],
    BROWSER_JSON,
  )
  const bug004 = process.env.E2E_SKIP_BUG004 === '1'
    ? { result: 'NOT_RUN', casesRun: 0, casesPassed: 0, casesFailed: 0, reason: 'E2E_SKIP_BUG004=1' }
    : runBrowserSpec(['e2e/rc-bug-004-inbound-parity.spec.ts'], BUG004_JSON)

  const casesRun = acceptance.casesRun + bug004.casesRun
  const casesPassed = acceptance.casesPassed + bug004.casesPassed
  const casesFailed = acceptance.casesFailed + bug004.casesFailed
  const result = casesRun === 0 ? 'NOT_RUN' : casesFailed > 0 ? 'FAIL' : 'PASS'
  // De-duplicate: both specs report the same missing target.
  const reason = result === 'NOT_RUN'
    ? [...new Set([acceptance.reason, bug004.reason].filter(Boolean))].join('; ') || 'no browser target'
    : null

  return {
    result,
    casesRun,
    casesPassed,
    casesFailed,
    reason,
    acceptance,
    bug004,
  }
}

function main() {
  console.log('RELAY RELEASE GATE')
  console.log('==================')
  const sha = gitSha()
  console.log(`git SHA: ${sha}`)

  let failures = 0
  for (const s of STEPS) {
    const result = runStep(s)
    const status = result.ok ? 'PASS' : 'FAIL'
    if (!result.ok) failures += 1
    console.log(`${s.name.padEnd(24)} ${status}`)
    if (!result.ok && result.detail) console.log(result.detail.split('\n').slice(-12).join('\n'))
  }

  const browser = runBrowser()
  if (browser.result !== 'NOT_RUN') {
    const status = browser.result === 'PASS' ? 'PASS' : 'FAIL'
    if (browser.result === 'FAIL') failures += 1
    console.log(`${'BROWSER'.padEnd(24)} ${status}  cases:${browser.casesRun} passed:${browser.casesPassed} failed:${browser.casesFailed}`)
  } else {
    console.log(`${'BROWSER'.padEnd(24)} NOT_RUN  (${browser.reason})`)
  }

  // The dedicated hard gate. Reported separately so a green combined browser
  // number can never hide a red BUG-004.
  const bug004 = browser.bug004 ?? { result: 'NOT_RUN', casesRun: 0, casesPassed: 0, casesFailed: 0, reason: 'not run' }
  if (bug004.result === 'FAIL') failures += 1
  const bug004Label = bug004.result === 'NOT_RUN' ? `NOT_RUN  (${bug004.reason})` : `${bug004.result}  cases:${bug004.casesRun} passed:${bug004.casesPassed} failed:${bug004.casesFailed}`
  console.log(`${'BUG004_INBOUND_PARITY'.padEnd(24)} ${bug004Label}`)

  const buildResult = runStep(BUILD_STEP)
  if (!buildResult.ok) failures += 1
  console.log(`${BUILD_STEP.name.padEnd(24)} ${buildResult.ok ? 'PASS' : 'FAIL'}`)
  if (!buildResult.ok && buildResult.detail) console.log(buildResult.detail.split('\n').slice(-12).join('\n'))

  const counts = readVitestCounts(VITEST_JSON)
  const version = readApiVersion()
  console.log('------------------')
  console.log(`TESTS                    ${counts.total} total / ${counts.passed} passed / ${counts.failed} failed / ${counts.skipped} skipped`)

  // ── The four gates, kept separate ─────────────────────────────────────────
  // The automated gate is what this script can actually run. Browser and SHA
  // parity are release conditions it can only REPORT — printing a single green
  // "RELEASE GATE: PASS" next to "BROWSER NOT_RUN / SHA NOT VERIFIED" is how a
  // build gets promoted on a lie. The decision lives in release-gates.mjs and
  // is pinned by tests/qa-relay-release-gate.test.ts.
  const gates = evaluateReleaseGates({
    automatedCodeGate: failures === 0 ? 'PASS' : 'FAIL',
    browserGate: browser.result,
    bug004Gate: browser.bug004?.result,
    shaGate: version ? 'VERIFIED' : 'NOT_VERIFIED',
  })
  const automatedOk = gates.automatedCodeGate === 'PASS'
  const browserGate = gates.browserGate
  const bug004Ready = gates.bug004Gate === 'PASS'
  const shaGate = gates.shaGate
  const productionReady = gates.productionReady

  console.log(renderReleaseGateReport(gates, {
    browserReasons: [browser.acceptance?.reason, browser.reason].filter(Boolean),
    bug004Reasons: [browser.bug004?.reason].filter(Boolean),
    shaReason: version ? null : 'no /api/version reachable',
  }))

  // The verified state the manifest reads. Derived, never hand-maintained.
  let contractTestCount = null
  try {
    contractTestCount = JSON.parse(
      execFileSync('cat', [path.join(ARTIFACTS_DIR, 'contract-coverage.json')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }),
    ).contractTestCount
  } catch {
    contractTestCount = null
  }

  const state = {
    gitSha: sha,
    generatedAt: new Date().toISOString(),
    automatedCodeGate: gates.automatedCodeGate,
    browserGate: gates.browserGate,
    bug004Gate: gates.bug004Gate,
    shaGate: gates.shaGate,
    productionGate: gates.productionGate,
    productionReady: gates.productionReady,
    blockers: gates.blockers,
    testCounts: counts,
    contractTestCount,
    regressionFixtureCount: countCorpusFixtures(),
    migrationVersion: latestMigration(),
    browser,
    apiVersion: version,
  }
  writeReleaseState(state)

  // The renderer already printed the gate block, including the verdict. This
  // block only decides the exit code.
  if (!automatedOk) {
    console.error(`AUTOMATED CODE GATE: FAIL (${failures} step(s) failed)`)
    process.exit(1)
  }
  if (!productionReady) {
    // Deliberately exit 0: this script ran everything it can run. The
    // incomplete release is a fact to report, not a failure to hide. Use
    // `pnpm qa:production-release` to enforce the full release condition.
    console.log(`wrote ${ARTIFACTS_DIR}/release-state.json`)
    process.exit(0)
  }
  console.log(`wrote ${ARTIFACTS_DIR}/release-state.json`)
}

main()
