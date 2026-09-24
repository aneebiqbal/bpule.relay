import { describe, it, expect } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { DANIEL_PROTOPOPOV_PIPEFORM_RAW } from './fixtures/hardening-regression-daniel-protopopov-pipeform'

/**
 * Hardening regression fixture — Daniel Protopopov / PipeForm.
 *
 * Daniel's Vyyer experience ("solved complex PII processing challenges") must
 * not become PipeForm's current problem. Company ownership must survive.
 *
 * Note: growth_signal/funding from generic first-person posts and past
 * experience requires deeper company-attribution modeling (evidence provenance
 * per-signal). The invariants tested here are the ones the current fix
 * addresses: no technical_problem inversion, no cross-company fact transfer,
 * confidence stays high on attribution.
 */
describe('Hardening regression — Daniel Protopopov / PipeForm', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(DANIEL_PROTOPOPOV_PIPEFORM_RAW, {})
    intel = result.intelligence
  })

  it('preserves correct person/company identity', () => {
    expect(intel.intelligence.person.fullName).toBe('Daniel Protopopov')
    expect(intel.intelligence.person.title?.toLowerCase()).toContain('ceo')
    expect(intel.intelligence.company.name?.toLowerCase()).toContain('pipeform')
  })

  it('does not invert a SOLVED achievement into a CURRENT technical problem', () => {
    // "Designed and implemented architecture that solved complex PII processing
    // and protection challenges" is a SOLVED achievement at Vyyer, not a
    // current problem at PipeForm.
    expect(intel.intelligence.opportunity.signals).not.toContain('technical_problem')
    const problems = intel.intelligence.content.explicitProblems.join(' ').toLowerCase()
    expect(problems).not.toMatch(/pii.*challenge|challenge.*pii/i)
  })

  it('does not transfer Vyyer facts to PipeForm opportunity signals', () => {
    // Vyyer's PII/identity-verification content must not appear as PipeForm's
    // opportunity signals or explicit problems.
    const allSignals = intel.intelligence.opportunity.signals.join(' ').toLowerCase()
    const allProblems = intel.intelligence.content.explicitProblems.join(' ').toLowerCase()
    expect(allSignals).not.toMatch(/identity verification|pii processing/i)
    expect(allProblems).not.toMatch(/identity verification/i)
  })

  it('does not produce immediate_need from market commentary or generic posts', () => {
    expect(intel.intelligence.opportunity.urgency).not.toBe('immediate')
    expect(intel.intelligence.timingSignal || '').not.toMatch(/immediate signal from source/i)
  })

  it('does not produce a remote INELIGIBLE from generic content', () => {
    // Generic content shouldn't make Daniel ineligible based on fabricated
    // location restrictions. (Eligibility may be UNCLEAR if weak signals are
    // present, but must not be INELIGIBLE from unrelated geography.)
    expect(intel.remoteEligibility.eligibility).not.toBe('INELIGIBLE')
    expect(intel.remoteEligibility.reason.toLowerCase()).not.toMatch(/uk.*israel|israel.*uk/i)
  })

  it('maintains high confidence on strong attribution even without buyer signals', () => {
    // We understand Daniel very well (strong attribution) but have no evidence
    // he wants to buy. Confidence HIGH + intent UNKNOWN is valid.
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.confidence).toBe('HIGH')
  })
})
