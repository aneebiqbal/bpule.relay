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

  const automated = state.automatedCodeGate === true
  const browser = state.browserGate ?? 'NOT_RUN'
  const shaGate = url ? (shaMatches ? 'VERIFIED' : 'NOT_VERIFIED') : (state.shaGate ?? 'NOT_VERIFIED')

  console.log('PRODUCTION RELEASE GATE')
  console.log('=======================')
  console.log(`tested SHA    ${state.gitSha ?? 'unknown'}`)
  console.log(`deployed SHA  ${deployed?.sha ?? 'unknown'}`)
  console.log(`AUTOMATED_CODE_GATE  ${automated ? 'PASS' : 'FAIL'}`)
  console.log(`BROWSER_GATE         ${browser}`)
  console.log(`SHA_GATE             ${shaGate}`)
  console.log('=======================')

  const blockers = []
  if (!automated) blockers.push('the automated code gate failed')
  if (browser !== 'PASS') blockers.push(`browser acceptance is ${browser}`)
  if (shaGate !== 'VERIFIED') blockers.push('the deployed SHA is not verified against the tested SHA')

  if (blockers.length > 0) {
    console.error('PRODUCTION GATE: BLOCKED')
    for (const b of blockers) console.error(`  - ${b}`)
    process.exit(1)
  }

  console.log('PRODUCTION GATE: READY — the tested SHA is deployed and browser-verified.')
}

main()
