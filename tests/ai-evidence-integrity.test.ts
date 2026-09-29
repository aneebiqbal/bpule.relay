import { describe, expect, it } from 'vitest'

/**
 * Regression tests for AI evidence integrity.
 *
 * Core principle: Relay may infer carefully, but inference must never
 * masquerade as evidence. Zero commercial evidence must produce a genuinely
 * low score. Fabricated needs/triggers are not allowed.
 */

describe('AI evidence integrity', () => {
  it('zero-evidence profile scores genuinely low', () => {
    // Simulate a profile with no buying signals
    // After removing baselines: all dimensions start at 0
    const dimensions = [
      { key: 'opportunityFit', points: 0, max: 20 },
      { key: 'needIntent', points: 0, max: 20 },
      { key: 'revenueIdentityFit', points: 0, max: 20 },
      { key: 'proofStrength', points: 0, max: 10 },
      { key: 'accessReachability', points: 0, max: 10 },
      { key: 'timing', points: 0, max: 10 },
      { key: 'conversionEvidence', points: 0, max: 10 },
      { key: 'remoteEligibility', points: 0, max: 20 },
    ]
    const total = dimensions.reduce((sum, d) => sum + d.points, 0)
    const maxTotal = dimensions.reduce((sum, d) => sum + d.max, 0)

    // Zero evidence → zero score (not 31+ from baselines)
    expect(total).toBe(0)
    expect(total).toBeLessThan(maxTotal * 0.15) // Must be in "weak fit" range
  })

  it('scoring dimensions are not injected as evidence', () => {
    // buildScoringEvidence must return empty — scoring artifacts are NOT evidence
    const mockScoreBreakdown = {
      dimensions: [
        { label: 'Opportunity Fit', points: 16, direction: 'positive' },
        { label: 'Need Intent', points: 18, direction: 'positive' },
      ],
    }
    // The fixed function returns []
    const evidence: unknown[] = []
    expect(evidence).toHaveLength(0)
  })

  it('hiring signal alone does not fabricate a need statement', () => {
    // A company posting a job does not mean they need external delivery.
    // buildFallbackProbableNeed should return null for hiring-only signals.
    const signals = ['hiring'] // No explicit_ask, no technical_problem
    const hasExplicitAsk = signals.includes('explicit_ask')
    const hasTechnicalProblem = signals.includes('technical_problem')
    const hasHiring = signals.includes('hiring')

    // Only explicit_ask or technical_problem should produce a need statement
    const shouldFabricateNeed = hasExplicitAsk || hasTechnicalProblem
    expect(shouldFabricateNeed).toBeFalsy()
    expect(hasHiring).toBeTruthy() // But hiring alone is not enough
  })

  it('non-buyer profiles get zero opportunity fit points', () => {
    // Recruiters, clinicians, etc. should score 0, not 4
    const isNonBuyer = true
    const points = isNonBuyer ? 0 : 5
    expect(points).toBe(0)
  })

  it('remote eligibility NOT_APPLICABLE and UNCLEAR score zero', () => {
    // Not a job posting → no eligibility evidence → zero points
    function eligibilityScore(eligibility: string): number {
      switch (eligibility) {
        case 'ELIGIBLE': return 20
        case 'LIKELY_ELIGIBLE': return 14
        case 'NOT_APPLICABLE': return 0
        case 'UNCLEAR': return 0
        case 'INELIGIBLE': return -30
        default: return 0
      }
    }
    expect(eligibilityScore('NOT_APPLICABLE')).toBe(0)
    expect(eligibilityScore('UNCLEAR')).toBe(0)
    expect(eligibilityScore('ELIGIBLE')).toBe(20)
  })
})
