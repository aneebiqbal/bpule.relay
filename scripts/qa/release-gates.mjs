/**
 * The release gate decision — pure, so it can be pinned by fixtures.
 *
 * Both `qa:release` (which reports) and `qa:production-release` (which
 * enforces) read this. It is the one place that decides whether the release is
 * complete, and it exists separately because that decision had a real bug: the
 * gate printed `RELEASE GATE: PASS` while `BROWSER NOT_RUN` and
 * `SHA NOT VERIFIED` were printed directly above it.
 *
 * Rule: a gate is satisfied only by its explicit positive value. Absent, null
 * or unrecognised means unsatisfied — never assumed.
 */

/** The gate values this function understands. Anything else is unsatisfied. */
export const GATE_VALUES = {
  automated: ['PASS', 'FAIL'],
  browser: ['PASS', 'FAIL', 'NOT_RUN'],
  bug004: ['PASS', 'FAIL', 'NOT_RUN'],
  sha: ['VERIFIED', 'NOT_VERIFIED'],
}

/**
 * Normalise a gate value: anything other than the explicit satisfied value is
 * the unsatisfied one. This is the whole point — `undefined` must not read as
 * satisfied.
 */
function normalise(value, satisfied, fallback) {
  return value === satisfied ? value : fallback
}

/**
 * @param {{automatedCodeGate?: string|null, browserGate?: string|null, bug004Gate?: string|null, shaGate?: string|null}} input
 * @returns {{automatedCodeGate: string, browserGate: string, bug004Gate: string, shaGate: string, productionGate: 'PASS'|'BLOCKED', productionReady: boolean, blockers: string[]}}
 */
export function evaluateReleaseGates(input) {
  const automatedOk = input.automatedCodeGate === 'PASS'
  const browserGate = normalise(input.browserGate, 'PASS', 'NOT_RUN')
  const bug004Gate = normalise(input.bug004Gate, 'PASS', 'NOT_RUN')
  const shaGate = normalise(input.shaGate, 'VERIFIED', 'NOT_VERIFIED')

  const blockers = []
  if (!automatedOk) blockers.push('the automated code gate failed')
  if (browserGate !== 'PASS') blockers.push(`browser acceptance is ${browserGate}`)
  if (bug004Gate !== 'PASS') blockers.push(`the dedicated BUG-004 inbound-parity gate is ${bug004Gate}`)
  if (shaGate !== 'VERIFIED') blockers.push('the deployed SHA is not verified against the tested SHA')

  return {
    automatedCodeGate: automatedOk ? 'PASS' : 'FAIL',
    browserGate,
    bug004Gate,
    shaGate,
    productionGate: blockers.length === 0 ? 'PASS' : 'BLOCKED',
    productionReady: blockers.length === 0,
    blockers,
  }
}
