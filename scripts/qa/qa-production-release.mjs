/**
 * Production-release gate.
 *
 * The ENFORCING counterpart to `qa:release`. `qa:release` runs everything it can
 * run and honestly reports the rest; this command decides whether the build may
 * be promoted, and exits non-zero when it may not.
 *
 * Promotion requires all four gates:
 *   AUTOMATED_CODE_GATE  PASS
 *   BROWSER_GATE         PASS
 *   SHA_GATE             VERIFIED
 *   PRODUCTION_GATE      READY
 *
 *   node scripts/qa/qa-production-release.mjs [--url=<preview-url>]
 */
import { readApiVersion, readReleaseState } from './release-lib.mjs'
import { evaluateReleaseGates } from './release-gates.mjs'

function main() {
  const urlArg = process.argv.slice(2).find((a) => a.startsWith('--url='))
  const url = urlArg?.split('=')[1]

  const state = readReleaseState()
  if (!state) {
    console.error('No qa-artifacts/release-state.json. Run `pnpm qa:release` first.')
    process.exit(1)
  }

  // SHA parity is re-checked live when a URL is supplied, so a promotion cannot
  // be authorised against a stale state file.
  const deployed = url ? readApiVersion(url) : state.apiVersion ?? null
  const shaMatches = Boolean(url && deployed?.sha && deployed.sha === state.gitSha)

  // The same tested decision `qa:release` reports. The logic lives in one
  // place and is pinned by tests/qa-relay-release-gate.test.ts.
  const gates = evaluateReleaseGates({
    automatedCodeGate: state.automatedCodeGate ? 'PASS' : 'FAIL',
    browserGate: state.browserGate,
    bug004Gate: state.bug004Gate,
    authOnboardingGate: state.authOnboardingGate,
    shaGate: url ? (shaMatches ? 'VERIFIED' : 'NOT_VERIFIED') : state.shaGate,
  })

  console.log('PRODUCTION RELEASE GATE')
  console.log('=======================')
  console.log(`tested SHA    ${state.gitSha ?? 'unknown'}`)
  console.log(`deployed SHA  ${deployed?.sha ?? 'unknown'}`)
  console.log(`AUTOMATED_CODE_GATE  ${gates.automatedCodeGate}`)
  console.log(`BROWSER_GATE         ${gates.browserGate}`)
  console.log(`BUG004_INBOUND_GATE  ${gates.bug004Gate}`)
  console.log(`AUTH_ONBOARDING_GATE ${gates.authOnboardingGate}`)
  console.log(`SHA_GATE             ${gates.shaGate}`)
  console.log('=======================')

  if (!gates.productionReady) {
    console.error('PRODUCTION GATE: BLOCKED')
    for (const b of gates.blockers) console.error(`  - ${b}`)
    process.exit(1)
  }

  console.log('PRODUCTION GATE: READY — the tested SHA is deployed and browser-verified.')
}

main()
