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

// ── The rendered report ───────────────────────────────────────────────────────
// The decision is only half the gate. The bug that started this work was a
// REPORTING bug: the decision said incomplete while the headline said PASS.
// A reviewer reads the rendered block, so the rendered block is pinned too — as
// structured lines, not a brittle snapshot.

import { renderReleaseGateReport } from '../scripts/qa/release-gates.mjs'

/** `KEY   value` lines as a map, so assertions are on structure not spacing. */
function gateLines(report: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of report.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)\s{2,}(.*)$/)
    if (m) out.set(m[1], m[2].trim())
  }
  return out
}

describe('release gate report — a reviewer cannot be misled', () => {
  it('prints every gate on its own line with its real value', () => {
    const report = renderReleaseGateReport(evaluateReleaseGates(PASSING))
    const lines = gateLines(report)

    expect(lines.get('AUTOMATED_CODE_GATE')).toBe('PASS')
    expect(lines.get('BROWSER_GATE')).toBe('PASS')
    expect(lines.get('BUG004_INBOUND_GATE')).toBe('PASS')
    expect(lines.get('SHA_GATE')).toBe('VERIFIED')
    expect(lines.get('PRODUCTION_GATE')).toBe('PASS')
  })

  it('says COMPLETE only when the release is actually ready', () => {
    const report = renderReleaseGateReport(evaluateReleaseGates(PASSING))
    expect(report).toContain('RELEASE GATE: COMPLETE')
    expect(report).not.toContain('RELEASE GATE: INCOMPLETE')
  })

  it('says INCOMPLETE, never PASS, when the browser never ran', () => {
    const report = renderReleaseGateReport(
      evaluateReleaseGates({ ...PASSING, browserGate: 'NOT_RUN' }),
      { browserReasons: ['E2E_BASE_URL not set'] },
    )
    const lines = gateLines(report)

    expect(lines.get('BROWSER_GATE')).toContain('NOT_RUN')
    expect(lines.get('PRODUCTION_GATE')).toBe('BLOCKED')
    expect(report).toContain('RELEASE GATE: INCOMPLETE')
    // The headline must never read as a pass.
    expect(report).not.toMatch(/RELEASE GATE:\s*PASS/)
    expect(report).not.toMatch(/AUTOMATED CODE GATE: PASS\s*\nRELEASE GATE: COMPLETE/)
  })

  it('says INCOMPLETE when the dedicated BUG-004 gate failed', () => {
    const report = renderReleaseGateReport(
      evaluateReleaseGates({ ...PASSING, bug004Gate: 'FAIL' }),
    )
    const lines = gateLines(report)

    expect(lines.get('BUG004_INBOUND_GATE')).toContain('FAIL')
    expect(lines.get('PRODUCTION_GATE')).toBe('BLOCKED')
    // The blocker is named, so the reviewer knows which gate failed.
    expect(report).toMatch(/BUG-004/i)
    expect(report).toContain('RELEASE GATE: INCOMPLETE')
  })

  it('says INCOMPLETE when the SHA is not verified', () => {
    const report = renderReleaseGateReport(
      evaluateReleaseGates({ ...PASSING, shaGate: 'NOT_VERIFIED' }),
      { shaReason: 'no /api/version reachable' },
    )
    const lines = gateLines(report)

    expect(lines.get('SHA_GATE')).toContain('NOT_VERIFIED')
    expect(lines.get('PRODUCTION_GATE')).toBe('BLOCKED')
    expect(report).toContain('RELEASE GATE: INCOMPLETE')
    expect(report).not.toMatch(/RELEASE GATE:\s*PASS/)
  })

  it('lists every blocker when everything is unsatisfied', () => {
    const report = renderReleaseGateReport(
      evaluateReleaseGates({
        automatedCodeGate: 'FAIL',
        browserGate: 'NOT_RUN',
        bug004Gate: 'NOT_RUN',
        shaGate: 'NOT_VERIFIED',
      }),
    )

    // Four unsatisfied gates, four named blocker lines.
    const blockerLines = report.split('\n').filter((l) => /^\s*- /.test(l))
    expect(blockerLines).toHaveLength(4)
    expect(report).toMatch(/automated/i)
    expect(report).toMatch(/browser/i)
    expect(report).toMatch(/BUG-004/i)
    expect(report).toMatch(/SHA/i)
  })

  it('does not duplicate a reason that two specs of one gate share', () => {
    // The acceptance spec and the matrix spec both report the same missing
    // target; joining them made the report read as two separate problems.
    const report = renderReleaseGateReport(
      evaluateReleaseGates({ ...PASSING, browserGate: 'NOT_RUN' }),
      { browserReasons: ['E2E_BASE_URL not set', 'E2E_BASE_URL not set'] },
    )
    const occurrences = report.split('E2E_BASE_URL not set').length - 1
    expect(occurrences).toBe(1)
    expect(gateLines(report).get('BROWSER_GATE')).toContain('NOT_RUN')
  })
})
