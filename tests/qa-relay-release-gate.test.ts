/**
 * The release gate's own decision logic.
 *
 * This is the guard for the guard. The gate's whole job is to refuse to say
 * "release complete" when a condition is unmet, and it had a real bug: it
 * printed `RELEASE GATE: PASS` while `BROWSER NOT_RUN` and `SHA NOT VERIFIED`
 * were printed right above it. A green line like that is how a build gets
 * promoted on a lie.
 *
 * The logic is pure so it can be pinned by fixtures instead of by reading the
 * script. Every combination that must NOT produce PRODUCTION_GATE=PASS is
 * listed here by name.
 */

import { describe, expect, it } from 'vitest'

// The module under test does not exist yet: this import is the RED step.
import { evaluateReleaseGates } from '../scripts/qa/release-gates.mjs'

const PASSING = {
  automatedCodeGate: 'PASS',
  browserGate: 'PASS',
  bug004Gate: 'PASS',
  shaGate: 'VERIFIED',
} as const

describe('release gate — nothing incomplete may report PASS', () => {
  it('is READY only when every gate is satisfied', () => {
    const result = evaluateReleaseGates(PASSING)
    expect(result.productionGate).toBe('PASS')
    expect(result.productionReady).toBe(true)
    expect(result.blockers).toEqual([])
  })

  // The historical lie: the automated steps all passed, so the old gate printed
  // PASS while the browser had never run and the SHA was unverified.
  it('browser PASS + bug004 PASS + sha NOT_VERIFIED is BLOCKED', () => {
    const result = evaluateReleaseGates({ ...PASSING, shaGate: 'NOT_VERIFIED' })
    expect(result.productionGate).toBe('BLOCKED')
    expect(result.productionReady).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/SHA/i)
  })

  // The bug this pass fixed: BUG-004 was one case inside an aggregate browser
  // number, so a red BUG-004 could hide behind a green browser line.
  it('browser PASS + bug004 FAIL is BLOCKED', () => {
    const result = evaluateReleaseGates({ ...PASSING, bug004Gate: 'FAIL' })
    expect(result.productionGate).toBe('BLOCKED')
    expect(result.productionReady).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/BUG-004/i)
  })

  it('browser PASS + bug004 NOT_RUN is BLOCKED', () => {
    const result = evaluateReleaseGates({ ...PASSING, bug004Gate: 'NOT_RUN' })
    expect(result.productionGate).toBe('BLOCKED')
    expect(result.productionReady).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/BUG-004/)
  })

  it('browser NOT_RUN is BLOCKED even when everything else passed', () => {
    const result = evaluateReleaseGates({ ...PASSING, browserGate: 'NOT_RUN' })
    expect(result.productionGate).toBe('BLOCKED')
    expect(result.productionReady).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/browser/i)
  })

  it('browser FAIL is BLOCKED', () => {
    const result = evaluateReleaseGates({ ...PASSING, browserGate: 'FAIL' })
    expect(result.productionGate).toBe('BLOCKED')
    expect(result.productionReady).toBe(false)
  })

  it('an automated code failure is BLOCKED regardless of the browser gates', () => {
    const result = evaluateReleaseGates({ ...PASSING, automatedCodeGate: 'FAIL' })
    expect(result.productionGate).toBe('BLOCKED')
    expect(result.productionReady).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/automated/i)
  })
})

describe('release gate — the BUG-004 gate is never implied', () => {
  /**
   * A missing BUG-004 result must never be treated as satisfied. This is the
   * exact shape of the bug: `bug004?.result ?? 'NOT_RUN'` is safe, but a
   * truthiness check on an absent gate is not.
   */
  it('treats an absent BUG-004 gate as NOT_RUN', () => {
    const result = evaluateReleaseGates({ ...PASSING, bug004Gate: undefined as unknown as string })
    expect(result.bug004Gate).toBe('NOT_RUN')
    expect(result.productionGate).toBe('BLOCKED')
  })

  it('treats an absent browser gate as NOT_RUN', () => {
    const result = evaluateReleaseGates({ ...PASSING, browserGate: undefined as unknown as string })
    expect(result.browserGate).toBe('NOT_RUN')
    expect(result.productionGate).toBe('BLOCKED')
  })

  it('treats an absent SHA gate as NOT_VERIFIED', () => {
    const result = evaluateReleaseGates({ ...PASSING, shaGate: undefined as unknown as string })
    expect(result.shaGate).toBe('NOT_VERIFIED')
    expect(result.productionGate).toBe('BLOCKED')
  })
})

describe('release gate — every blocker names its gate', () => {
  it('reports every unsatisfied gate, not just the first', () => {
    const result = evaluateReleaseGates({
      automatedCodeGate: 'FAIL',
      browserGate: 'NOT_RUN',
      bug004Gate: 'NOT_RUN',
      shaGate: 'NOT_VERIFIED',
    })
    expect(result.blockers).toHaveLength(4)
    const joined = result.blockers.join(' ')
    expect(joined).toMatch(/automated/i)
    expect(joined).toMatch(/browser/i)
    expect(joined).toMatch(/BUG-004/i)
    expect(joined).toMatch(/SHA/i)
  })
})
