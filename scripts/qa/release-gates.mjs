/**
 * The release gate — the decision AND the report it prints.
 *
 * Both live here so the CLI cannot quietly implement different logic from the
 * tests, and so the printed block cannot drift from the decision it reports.
 *
 * Why this module exists: the gate printed `RELEASE GATE: PASS` while
 * `BROWSER NOT_RUN` and `SHA NOT VERIFIED` were printed directly above it. That
 * is a reporting bug, not a decision bug — the decision was right, the headline
 * lied. Both halves are now pinned by tests/qa-relay-release-gate.test.ts.
 */

/** The gate values this module understands. Anything else is unsatisfied. */
export const GATE_VALUES = {
  automated: ['PASS', 'FAIL'],
  browser: ['PASS', 'FAIL', 'NOT_RUN'],
  bug004: ['PASS', 'FAIL', 'NOT_RUN'],
  authOnboarding: ['PASS', 'FAIL', 'NOT_RUN'],
  sha: ['VERIFIED', 'NOT_VERIFIED'],
}

/**
 * Normalise a gate value.
 *
 * The satisfied value passes through, the failed value passes through, and
 * anything else (absent, null, unrecognised) is the unsatisfied default.
 *
 * The distinction matters in the report: a gate that RAN AND FAILED must not be
 * printed as NOT_RUN, or a reviewer concludes it was never executed.
 */
function normalise(value, satisfied, fallback, failed) {
  if (value === satisfied) return satisfied
  if (failed && value === failed) return failed
  return fallback
}

/**
 * Decide whether the release is complete.
 *
 * Rule: a gate is satisfied only by its explicit positive value. Absent, null
 * or unrecognised means unsatisfied — never assumed.
 *
 * @param {{automatedCodeGate?: string|null, browserGate?: string|null, bug004Gate?: string|null, shaGate?: string|null}} input
 * @returns {{automatedCodeGate: string, browserGate: string, bug004Gate: string, shaGate: string, productionGate: 'PASS'|'BLOCKED', productionReady: boolean, blockers: string[]}}
 */
export function evaluateReleaseGates(input) {
  const automatedOk = input.automatedCodeGate === 'PASS'
  const browserGate = normalise(input.browserGate, 'PASS', 'NOT_RUN', 'FAIL')
  const bug004Gate = normalise(input.bug004Gate, 'PASS', 'NOT_RUN', 'FAIL')
  const authOnboardingGate = normalise(input.authOnboardingGate, 'PASS', 'NOT_RUN', 'FAIL')
  const shaGate = normalise(input.shaGate, 'VERIFIED', 'NOT_VERIFIED')

  const blockers = []
  if (!automatedOk) blockers.push('the automated code gate failed')
  if (browserGate !== 'PASS') blockers.push(`browser acceptance is ${browserGate}`)
  if (bug004Gate !== 'PASS') blockers.push(`the dedicated BUG-004 inbound-parity gate is ${bug004Gate}`)
  if (authOnboardingGate !== 'PASS') blockers.push(`the auth/onboarding gate is ${authOnboardingGate}`)
  if (shaGate !== 'VERIFIED') blockers.push('the deployed SHA is not verified against the tested SHA')

  return {
    automatedCodeGate: automatedOk ? 'PASS' : 'FAIL',
    browserGate,
    bug004Gate,
    authOnboardingGate,
    shaGate,
    productionGate: blockers.length === 0 ? 'PASS' : 'BLOCKED',
    productionReady: blockers.length === 0,
    blockers,
  }
}

/**
 * Render the release gate report.
 *
 * The CLI prints exactly this. Reasons are de-duplicated per gate: the
 * acceptance spec and the matrix spec both report the same missing target, and
 * joining them made the report read as two separate problems.
 *
 * @param {ReturnType<typeof evaluateReleaseGates>} gates
 * @param {{browserReasons?: string[], bug004Reasons?: string[], shaReason?: string|null}} [details]
 * @returns {string}
 */
export function renderReleaseGateReport(gates, details = {}) {
  const uniq = (values) => [...new Set((values ?? []).filter(Boolean))]
  const browserReason = uniq(details.browserReasons).join('; ')
  const bug004Reason = uniq(details.bug004Reasons).join('; ')
  const authReason = details.authReasons ? uniq(details.authReasons).join('; ') : ''
  const shaReason = details.shaReason ?? ''

  const lines = [
    `AUTOMATED_CODE_GATE      ${gates.automatedCodeGate === 'PASS' ? 'PASS' : 'FAIL'}`,
    `BROWSER_GATE             ${gates.browserGate}${gates.browserGate === 'NOT_RUN' && browserReason ? ` (${browserReason})` : ''}`,
    `BUG004_INBOUND_GATE      ${gates.bug004Gate}${gates.bug004Gate === 'NOT_RUN' && bug004Reason ? ` (${bug004Reason})` : ''}`,
    `AUTH_ONBOARDING_GATE     ${gates.authOnboardingGate}${gates.authOnboardingGate === 'NOT_RUN' && authReason ? ` (${authReason})` : ''}`,
    `SHA_GATE                 ${gates.shaGate}${gates.shaGate === 'NOT_VERIFIED' && shaReason ? ` (${shaReason})` : ''}`,
    `PRODUCTION_GATE          ${gates.productionGate}`,
    '==================',
    `AUTOMATED CODE GATE: ${gates.automatedCodeGate === 'PASS' ? 'PASS' : 'FAIL'}`,
  ]

  if (gates.productionReady) {
    lines.push('RELEASE GATE: COMPLETE')
  } else {
    lines.push('RELEASE GATE: INCOMPLETE — browser and/or SHA parity outstanding')
    for (const blocker of gates.blockers) lines.push(`  - ${blocker}`)
  }

  return lines.join('\n')
}
