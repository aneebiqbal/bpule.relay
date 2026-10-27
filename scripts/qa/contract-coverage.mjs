/**
 * Contract coverage report (Phase 5).
 *
 * Runs the contract suites and reports, per contract: runtime owner, test count,
 * E2E coverage and skipped-test count.
 *
 * Release blocker: ANY skipped contract test.
 *
 *   node scripts/qa/contract-coverage.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const CONTRACT_FILES = [
  'tests/qa-relay-product-contracts.test.ts',
  'tests/qa-relay-cross-surface-parity.test.ts',
]

const ARTIFACTS_DIR = 'qa-artifacts'
const COVERAGE_JSON = path.join(ARTIFACTS_DIR, 'contract-coverage.json')

/** Runtime owner per contract, kept in sync with docs/RELAY_CONTRACT_RUNTIME_MAP.md. */
const OWNERS = {
  'Contract 1': 'separateRoleFromEmployer / formatRoleLine',
  'Contract 2': 'isHighPotentialBuilder (revenue-strategy)',
  'Contract 3': 'deriveNextLeadAction + lead-parity.ts',
  'Contract 4': 'resolveVerifiedBuyerIntent',
  'Contract 5': 'deriveNextLeadAction + conversation/terminal.ts',
  'Contract 6': 'extractConnectsCost / extractFixedBudget',
  'Contract 7': 'captureProspect / imageRegenerationOutcome',
  'Contract 8': 'normalizeExternalInput',
  'Contract 9': 'resolveDraftGenerationState',
  'Contract 10': 'canonical packet (canonical_intelligence / canonical_score)',
  'Contract 11': 'inboundFirstMessageKey + buildThread',
  'Contract 12': 'getAuthCapabilities',
  'Contract 13': 'resolveVerifiedBuyerIntent (recruiterOnly)',
  unattributed: 'lead-parity.ts (cross-surface parity)',
}

function run() {
  const dir = mkdtempSync(path.join(tmpdir(), 'relay-contracts-'))
  const out = path.join(dir, 'results.json')
  try {
    execFileSync(
      'npx',
      ['vitest', 'run', ...CONTRACT_FILES, '--reporter=json', `--outputFile=${out}`, '--silent'],
      { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    )
  } catch {
    // vitest exits non-zero on failure; the JSON is still written.
  }
  const raw = readFileSync(out, 'utf8')
  rmSync(dir, { recursive: true, force: true })
  return JSON.parse(raw)
}

function main() {
  const result = run()
  const files = result.testResults ?? []
  const byContract = new Map()
  let totalSkipped = 0

  for (const file of files) {
    for (const assertion of file.assertionResults ?? []) {
      const name = assertion.fullName ?? assertion.title ?? ''
      const contract = /^Contract \d+/.exec(name)?.[0] ?? 'unattributed'
      const bucket = byContract.get(contract) ?? { total: 0, passed: 0, failed: 0, skipped: 0 }
      bucket.total += 1
      if (assertion.status === 'passed') bucket.passed += 1
      else if (assertion.status === 'failed') bucket.failed += 1
      else {
        bucket.skipped += 1
        totalSkipped += 1
      }
      byContract.set(contract, bucket)
    }
  }

  console.log('RELAY CONTRACT COVERAGE')
  console.log('======================')
  const contracts = [...byContract.keys()].sort()
  let failures = 0
  for (const contract of contracts) {
    const b = byContract.get(contract)
    const status = b.failed > 0 ? 'FAIL' : 'PASS'
    if (b.failed > 0) failures += 1
    const skipNote = b.skipped > 0 ? `  SKIPPED:${b.skipped}` : ''
    console.log(
      `${contract.padEnd(11)} ${status}  tests:${b.total} passed:${b.passed} failed:${b.failed}${skipNote}  owner:${OWNERS[contract] ?? '—'}`,
    )
  }
  console.log('----------------------')
  console.log(`contracts: ${contracts.length}  failed: ${failures}  skipped: ${totalSkipped}`)

  // The manifest derives contractTestCount from this artifact.
  mkdirSync(ARTIFACTS_DIR, { recursive: true })
  const totalTests = contracts.reduce((sum, c) => sum + byContract.get(c).total, 0)
  writeFileSync(
    COVERAGE_JSON,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        contractTestCount: totalTests,
        contracts: contracts.length,
        failed: failures,
        skipped: totalSkipped,
        perContract: Object.fromEntries(contracts.map((c) => [c, byContract.get(c)])),
      },
      null,
      2,
    )}\n`,
  )

  if (failures > 0 || totalSkipped > 0) {
    console.error('\nRELEASE BLOCKER: contract tests failed or were skipped.')
    process.exit(1)
  }
  console.log('\nAll contract guards pass, none skipped.')
}

main()
