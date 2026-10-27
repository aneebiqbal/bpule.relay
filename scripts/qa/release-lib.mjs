/** Shared helpers for the QA release scripts. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const ARTIFACTS_DIR = 'qa-artifacts'
export const RELEASE_STATE = path.join(ARTIFACTS_DIR, 'release-state.json')

/** The current commit, or 'unknown' when git is unavailable. */
export function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

/** GET /api/version against a deployed URL, or null when unreachable. */
export function readApiVersion(url) {
  const target = url || process.env.RELAY_PREVIEW_URL || ''
  if (!target) return null
  try {
    const raw = execFileSync('curl', ['-s', '--max-time', '30', `${target.replace(/\/$/, '')}/api/version`], {
      encoding: 'utf8',
    })
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Regression fixtures are derived from the corpus source, never hand-maintained.
 * Each fixture declares `id: '<NAME>'`.
 */
export function countCorpusFixtures() {
  try {
    const raw = readFileSync('tests/fixtures/relay-regression-corpus.ts', 'utf8')
    return (raw.match(/^\s*id:\s*'/gm) ?? []).length
  } catch {
    return 0
  }
}

/** Contract tests are derived from the vitest JSON, never hand-maintained. */
export function readVitestCounts(file) {
  const empty = { total: 0, passed: 0, failed: 0, skipped: 0, files: 0 }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return {
      total: parsed.numTotalTests ?? 0,
      passed: parsed.numPassedTests ?? 0,
      failed: parsed.numFailedTests ?? 0,
      skipped: parsed.numPendingTests ?? 0,
      files: parsed.testResults?.length ?? 0,
    }
  } catch {
    return empty
  }
}

/** Playwright's JSON reporter shape (the fields we need). */
export function readBrowserCounts(file) {
  const empty = { result: 'NOT_RUN', casesRun: 0, casesPassed: 0, casesFailed: 0 }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const specs = []
    const walk = (suite) => {
      for (const s of suite.suites ?? []) walk(s)
      for (const t of suite.tests ?? []) specs.push(t)
    }
    for (const suite of parsed.suites ?? []) walk(suite)
    const casesRun = specs.length
    let casesPassed = 0
    let casesFailed = 0
    for (const spec of specs) {
      const outcome = spec.results?.[spec.results.length - 1]?.status
      if (outcome === 'passed') casesPassed += 1
      else if (outcome === 'failed' || outcome === 'timedOut') casesFailed += 1
    }
    const result = casesRun === 0 ? 'NOT_RUN' : casesFailed > 0 ? 'FAIL' : 'PASS'
    return { result, casesRun, casesPassed, casesFailed }
  } catch {
    return empty
  }
}

export function writeReleaseState(state) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  writeFileSync(RELEASE_STATE, `${JSON.stringify(state, null, 2)}\n`)
}

export function readReleaseState() {
  if (!existsSync(RELEASE_STATE)) return null
  try {
    return JSON.parse(readFileSync(RELEASE_STATE, 'utf8'))
  } catch {
    return null
  }
}
