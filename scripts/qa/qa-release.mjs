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

const VITEST_JSON = path.join(ARTIFACTS_DIR, 'vitest.json')
const BROWSER_JSON = path.join(ARTIFACTS_DIR, 'browser.json')

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

function runBrowser() {
  // A separate CI job can run the browser suite and hand its JSON artifact in.
  const jsonArg = process.argv.slice(2).find((a) => a.startsWith('--browser-json='))
  if (jsonArg) {
    const file = jsonArg.split('=')[1]
    const counts = readBrowserCounts(file)
    return { ...counts, reason: counts.result === 'NOT_RUN' ? `no parseable browser artifact at ${file}` : null }
  }

  const baseURL = process.env.E2E_BASE_URL
  if (!baseURL) {
    return { result: 'NOT_RUN', casesRun: 0, casesPassed: 0, casesFailed: 0, reason: 'E2E_BASE_URL not set' }
  }
  const result = runStep(
    step(
      'BROWSER',
      [
        'npx',
        'playwright',
        'test',
        'e2e/rc-browser-acceptance.spec.ts',
        '--project=desktop-chrome',
        '--reporter=json',
      ],
      // The JSON reporter writes to PLAYWRIGHT_JSON_OUTPUT_NAME, not --output
      // (which is the test-artifact directory).
      { env: { PLAYWRIGHT_JSON_OUTPUT_NAME: BROWSER_JSON } },
    ),
  )
  const counts = readBrowserCounts(BROWSER_JSON)
  return { ...counts, reason: result.ok ? null : 'one or more browser cases failed' }
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

  const buildResult = runStep(BUILD_STEP)
  if (!buildResult.ok) failures += 1
  console.log(`${BUILD_STEP.name.padEnd(24)} ${buildResult.ok ? 'PASS' : 'FAIL'}`)
  if (!buildResult.ok && buildResult.detail) console.log(buildResult.detail.split('\n').slice(-12).join('\n'))

  const counts = readVitestCounts(VITEST_JSON)
  const version = readApiVersion()
  console.log('------------------')
  console.log(`TESTS                    ${counts.total} total / ${counts.passed} passed / ${counts.failed} failed / ${counts.skipped} skipped`)
  console.log(
    `SHA VERIFIED             ${version ? 'PENDING (run qa:deployed)' : 'NOT VERIFIED (no /api/version reachable)'}`,
  )

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
    gatesPassed: failures === 0,
    testCounts: counts,
    contractTestCount,
    regressionFixtureCount: countCorpusFixtures(),
    migrationVersion: latestMigration(),
    browser,
    apiVersion: version,
  }
  writeReleaseState(state)

  console.log('==================')
  if (failures > 0) {
    console.error(`RELEASE GATE: FAIL (${failures} step(s) failed)`)
    process.exit(1)
  }
  console.log('RELEASE GATE: PASS')
  console.log(`wrote ${ARTIFACTS_DIR}/release-state.json`)
}

main()
