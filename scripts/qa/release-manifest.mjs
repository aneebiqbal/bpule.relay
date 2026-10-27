/**
 * Release manifest (Phase 12 / 21 / 22).
 *
 * READS the verified release state written by `qa:release`. It does not run the
 * test suite, and it does not hand-maintain counts.
 *
 *   node scripts/qa/release-manifest.mjs [--url=<preview-url>]
 */
import { writeFileSync } from 'node:fs'
import { gitSha, readApiVersion, readReleaseState } from './release-lib.mjs'

const CONTRACT_VERSION = 'relay_contracts_v7'
const OUT = 'release-manifest.json'

function main() {
  const urlArg = process.argv.slice(2).find((a) => a.startsWith('--url='))
  const url = urlArg?.split('=')[1]

  const state = readReleaseState()
  if (!state) {
    console.error('No qa-artifacts/release-state.json. Run `pnpm qa:release` first.')
    process.exit(1)
  }

  const deployed = url ? readApiVersion(url) : state.apiVersion ?? null
  const browser = state.browser ?? { result: 'NOT_RUN', casesRun: 0, casesPassed: 0, casesFailed: 0 }

  const manifest = {
    gitSha: state.gitSha ?? gitSha(),
    generatedAt: new Date().toISOString(),
    // The full release condition, not just the automated steps: a manifest that
    // says gatesPassed on a build with no browser run and no SHA parity is how a
    // build gets promoted on a lie.
    gatesPassed: state.productionReady ?? false,
    automatedCodeGate: state.automatedCodeGate ?? false,
    browserGate: state.browserGate ?? 'NOT_RUN',
    shaGate: state.shaGate ?? 'NOT_VERIFIED',
    productionGate: state.productionGate ?? 'BLOCKED',
    deploymentSha: deployed?.sha ?? null,
    deploymentUrl: url ?? null,
    appVersion: deployed?.appVersion ?? '0.8.0',
    scoringVersion: deployed?.scoringVersion ?? 'relay_decision_v3.3.0',
    buyerIntentVersion: deployed?.buyerIntentVersion ?? 'buyer_intent_v5',
    contractVersion: CONTRACT_VERSION,
    migrationVersion: state.migrationVersion ?? null,
    testCounts: state.testCounts ?? { total: 0, passed: 0, failed: 0, skipped: 0, files: 0 },
    contractTestCount: state.contractTestCount ?? null,
    regressionFixtureCount: state.regressionFixtureCount ?? null,
    browserSuiteResult: browser.result,
    browserCasesRun: browser.casesRun ?? 0,
    browserCasesPassed: browser.casesPassed ?? 0,
    browserCasesFailed: browser.casesFailed ?? 0,
  }

  writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`wrote ${OUT} (from qa-artifacts/release-state.json)`)
  console.log(JSON.stringify(manifest, null, 2))
}

main()
