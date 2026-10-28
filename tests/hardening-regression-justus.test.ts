import { describe, it, expect } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { JUSTUS_HANNA_GREGORIO_AI_RAW } from './fixtures/hardening-regression-justus-hanna-grego'

/**
 * Hardening regression fixture — Justus Hanna / Grego AI.
 *
 * Grego AI SOLVES security vulnerabilities for protocols — it is the solution
 * provider, not a buyer. Justus discusses "critical vulnerabilities" because
 * Grego AI finds them for others, not because Grego AI has them.
 */
describe('Hardening regression — Justus Hanna / Grego AI', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(JUSTUS_HANNA_GREGORIO_AI_RAW, {})
    intel = result.intelligence
  })

  it('extracts the correct person name despite the nickname format', () => {
    expect(intel.intelligence.person.fullName).toBe('Justus Hanna')
  })

  it('does not flag a micro-business false positive from an analogy', () => {
    // "I can hook up an electrical outlet without being an electrician" is an
    // analogy, not evidence Grego AI is an electrical business.
    const watchOut = intel.scoreBreakdown.watchOut.join(' ').toLowerCase()
    expect(watchOut).not.toMatch(/non-technical micro business/i)
  })

  it('does not produce a technical_problem signal from solver-context language', () => {
    // "Earned $600K in bug bounty rewards" + "finds critical vulnerabilities in
    // protocols" describes what Grego AI SOLVES for others, not a problem it
    // has. Must NOT produce technical_problem.
    expect(intel.intelligence.opportunity.signals).not.toContain('technical_problem')
  })

  it('classifies buyer intent as UNKNOWN — Grego AI is a seller, not buyer', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intent).toBe('UNKNOWN')
  })

  it('does not fabricate growth_signal from own-company building language', () => {
    // "building Grego AI", "spent almost two years building the scaffolding" →
    // own product development, not a market growth signal creating buyer need.
    expect(intel.intelligence.opportunity.signals).not.toContain('growth_signal')
  })

  // A seller's own remote arrangement must never be read as a location
  // restriction that makes them INELIGIBLE. Whether the exact state is
  // NOT_APPLICABLE or ELIGIBLE depends on whether the text carries real
  // workplace evidence (e.g. "Remote OK"), so the exact value is model-dependent
  // and is deliberately not asserted here.
  it('never treats a seller\'s remote arrangement as a location restriction', () => {
    expect(intel.remoteEligibility.eligibility).not.toBe('INELIGIBLE')
  })

  it('keeps canonical score out of buyer-opportunity territory', () => {
    // No buying signal → score must not suggest a real opportunity.
    expect(intel.canonicalScore).toBeLessThan(50)
  })

  it('does not penalize for fraud or student based on security language intensity', () => {
    const watchOut = intel.scoreBreakdown.watchOut.join(' ').toLowerCase()
    expect(watchOut).not.toMatch(/fraud|student|job seeker/i)
  })

  it('preserves strong technical identity without inflating buyer fit', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    // Confidence can be high (we understand who Justus is) while intent stays UNKNOWN.
    expect(strategy.assessment.confidence).toBe('HIGH')
    expect(strategy.assessment.intent).toBe('UNKNOWN')
  })
})
