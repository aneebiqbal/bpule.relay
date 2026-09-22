import { describe, expect, it } from 'vitest'
import { canonicalToLegacyScoreResult } from '@/lib/intelligence-v2/orchestrator'

/**
 * Regression test for a real cross-surface inconsistency found during the
 * Relay hardening sprint (Phase 2/13 — sources of truth / cross-surface
 * consistency):
 *
 * Lead Detail (src/app/(app)/leads/[id]/page.tsx) was recomputing a lead's
 * score with the legacy 0-12 rubric (computeScore()/src/lib/score/rubric.ts)
 * on every page load, completely ignoring the persisted canonical Intelligence
 * V2 score (canonicalScore, 0-100) even when it existed on the lead. Other
 * surfaces — the Leads list, the Relay/Today queue, the draft API — already
 * correctly preferred the canonical score. This meant the SAME lead could
 * show two structurally different scores (different scale, different
 * dimensions, different verdict derivation) depending only on which page you
 * opened it from — the exact "duplicate source of truth" failure mode the
 * sprint targets.
 *
 * The fix: canonicalToLegacyScoreResult() is now the single place that
 * bridges a persisted lead's canonical fields into the legacy ScoreResult
 * shape UI components expect, and every surface (Lead Detail, the draft
 * route) calls it instead of recomputing.
 */
describe('canonicalToLegacyScoreResult — single source of truth for lead scores', () => {
  it('returns null when no canonical score is on file (caller must fall back to legacy computeScore)', () => {
    const result = canonicalToLegacyScoreResult({ canonicalScore: null })
    expect(result).toBeNull()
  })

  it('prefers the persisted canonical score over any legacy recomputation', () => {
    const result = canonicalToLegacyScoreResult({
      canonicalScore: 79,
      qualification: 'worth_pursuing',
      verdict: 'send',
      scoreBreakdown: {
        dimensions: [
          { key: 'opportunityFit', label: 'Opportunity Fit', points: 16, max: 20, note: 'Strong signal', direction: 'positive' },
          { key: 'remoteEligibility', label: 'Remote Eligibility', points: 18, max: 20, note: 'Worldwide remote', direction: 'positive' },
        ],
      },
    })

    expect(result).not.toBeNull()
    expect(result!.total).toBe(79) // NOT recomputed on a 0-12 scale
    expect(result!.verdict).toBe('send')
    expect(result!.breakdown).toEqual([
      { category: 'opportunityFit', label: 'Opportunity Fit', points: 16, max: 20, note: 'Strong signal' },
      { category: 'remoteEligibility', label: 'Remote Eligibility', points: 18, max: 20, note: 'Worldwide remote' },
    ])
  })

  it('derives verdict from qualification when the lead has no explicit verdict field', () => {
    const strong = canonicalToLegacyScoreResult({ canonicalScore: 90, qualification: 'strong', verdict: null })
    const worthPursuing = canonicalToLegacyScoreResult({ canonicalScore: 75, qualification: 'worth_pursuing', verdict: null })
    const maybe = canonicalToLegacyScoreResult({ canonicalScore: 60, qualification: 'maybe', verdict: null })
    const skip = canonicalToLegacyScoreResult({ canonicalScore: 20, qualification: 'skip', verdict: null })

    expect(strong!.verdict).toBe('send')
    expect(worthPursuing!.verdict).toBe('send')
    expect(maybe!.verdict).toBe('research_more')
    expect(skip!.verdict).toBe('skip')
  })

  it('is idempotent: calling it twice on the same persisted lead produces identical output (no recomputation drift)', () => {
    const persisted = {
      canonicalScore: 63,
      qualification: 'maybe' as const,
      verdict: null,
      scoreBreakdown: { dimensions: [{ key: 'needIntent', label: 'Need / Intent', points: 12, max: 20, note: 'x', direction: 'positive' as const }] },
    }
    const run1 = canonicalToLegacyScoreResult(persisted)
    const run2 = canonicalToLegacyScoreResult(persisted)
    expect(run1).toEqual(run2)
  })

  it('handles missing/malformed scoreBreakdown without throwing (defensive against partial persistence)', () => {
    expect(() => canonicalToLegacyScoreResult({ canonicalScore: 50, scoreBreakdown: null })).not.toThrow()
    expect(() => canonicalToLegacyScoreResult({ canonicalScore: 50, scoreBreakdown: undefined })).not.toThrow()
    expect(() => canonicalToLegacyScoreResult({ canonicalScore: 50, scoreBreakdown: {} })).not.toThrow()
    const result = canonicalToLegacyScoreResult({ canonicalScore: 50, scoreBreakdown: {} })
    expect(result!.breakdown).toEqual([])
  })

  /**
   * Regression for a second, related display bug found on the same fixture
   * (Daria Redkina / Solsonic): lead-workspace.tsx's "not eligible for
   * drafting" message hardcoded "Scored {score.total}/12" regardless of
   * scale. Once canonicalToLegacyScoreResult() started returning the
   * canonical 0-100 total (correctly, per the tests above), that same
   * literal string started rendering nonsensical output like "Scored
   * 47/12". The UI fix (lead-workspace.tsx) picks the denominator from
   * whether currentLead.canonicalScore is non-null — this test asserts the
   * underlying invariant that fix depends on: total is ALWAYS on the 0-100
   * scale whenever canonicalScore is present, never a 0-12 value smuggled
   * through under the same field name.
   */
  it('total is always on the 0-100 canonical scale when canonicalScore is present, never a 0-12 legacy value under the same field', () => {
    for (const score of [0, 1, 12, 13, 50, 99, 100]) {
      const result = canonicalToLegacyScoreResult({ canonicalScore: score, qualification: 'maybe' })
      expect(result!.total).toBe(score) // never divided, scaled, or reinterpreted
    }
  })
})
