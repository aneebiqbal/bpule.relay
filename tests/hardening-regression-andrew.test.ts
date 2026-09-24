import { describe, it, expect } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { ANDREW_BLEXRUD_ORTHOBOOST_RAW } from './fixtures/hardening-regression-andrew-blexrud-orthoboost'

/**
 * Hardening regression — Andrew Blexrud / Orthoboost (P0 seller-CTA vs.
 * buyer-ask regression).
 *
 * See fixtures/hardening-regression-andrew-blexrud-orthoboost.ts for the
 * full source-truth writeup. Andrew is a growth/marketing-services seller
 * whose customer segment (orthopedic practices) has the growth-plateau
 * problem — Andrew SOLVES it as a service. His closing "let's connect" is an
 * outbound seller CTA aimed at that customer segment, never a buyer request
 * directed at BPulse.
 *
 * Root-caused failure: classifyBusinessModel/deriveRelationship had no
 * general pattern for a first-person "I/we help [named customer segment]
 * [with their problem]" services-business self-introduction outside the
 * engineering vertical — SERVICE_PROVIDER_PATTERNS was scoped to engineering
 * consulting only, so a marketing/growth-services seller fell through to
 * businessModel UNKNOWN and defaulted to relationship POTENTIAL_BUYER. That
 * single misclassification cascaded into every other symptom: an
 * `explicit_ask`-style buyer read of the seller CTA, remote eligibility
 * UNCLEAR instead of NOT_APPLICABLE, and a HIGH-ish fit read of a company
 * that has zero relationship to buying software delivery.
 *
 * DO NOT special-case "Andrew" or "Orthoboost" anywhere in application code,
 * and do not tune his numeric score. Fixes must be general semantic fixes
 * verified by running this fixture, not fixes that pattern-match this text.
 */
describe('Hardening regression — Andrew Blexrud / Orthoboost (seller CTA vs. buyer ask)', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(ANDREW_BLEXRUD_ORTHOBOOST_RAW, {})
    intel = result.intelligence
  })

  it('classifies Orthoboost as a SERVICE_PROVIDER — Andrew sells growth services to a named customer segment', () => {
    expect(intel.intelligence.businessModel).toBe('SERVICE_PROVIDER')
  })

  it('classifies the relationship as non-buyer (POTENTIAL_PARTNER), never POTENTIAL_BUYER', () => {
    expect(intel.intelligence.relationship).toBe('POTENTIAL_PARTNER')
    expect(intel.intelligence.relationship).not.toBe('POTENTIAL_BUYER')
  })

  it('does not classify the seller CTA ("let\'s connect") as an explicit buyer ask', () => {
    expect(intel.intelligence.opportunity.signals).not.toContain('explicit_ask')
    expect(intel.intelligence.opportunity.signals).not.toContain('freelance_project_need')
    expect(intel.intelligence.opportunity.signals).not.toContain('technical_problem')
  })

  it('service-buyer intent is UNKNOWN with no external engineering need — automation mention is not a development request', () => {
    const reading = intel.intelligence.commercialReading
    expect(reading?.serviceBuyerIntent).toBe('UNKNOWN')
    expect(reading?.externalEngineeringNeed).toBe('NONE_DETECTED')
    expect(reading?.immediateBuyerNeed).toBe(false)
    expect(reading?.buyerTiming).toBe('UNKNOWN')
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intent).toBe('UNKNOWN')
  })

  it('buyer fit is LOW, explicitly labeled not-a-buyer', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.fit).toBe('LOW')
    expect(strategy.assessment.fitWhy.toLowerCase()).toMatch(/not.*(?:software-delivery )?buyer/)
  })

  it('remote eligibility is NOT_APPLICABLE — there is no geography-sensitive engagement opportunity at all', () => {
    // Must be NOT_APPLICABLE, never UNCLEAR: UNCLEAR would imply a real
    // opportunity exists but geography is undetermined, which is wrong here
    // — there is no opportunity of any kind.
    expect(intel.remoteEligibility.eligibility).toBe('NOT_APPLICABLE')
    expect(intel.remoteEligibility.eligibility).not.toBe('UNCLEAR')
  })

  it('does not fabricate a growth_signal or opportunity from Andrew\'s customer-facing growth/marketing language', () => {
    expect(intel.intelligence.opportunity.signals).not.toContain('growth_signal')
  })

  it('does not attribute the orthopedic practices\' growth-plateau problem to Andrew/Orthoboost', () => {
    const canonicalJson = JSON.stringify(intel).toLowerCase()
    expect(canonicalJson).not.toMatch(/explicitly seeking external help/)
    expect(canonicalJson).not.toMatch(/orthoboost.{0,60}(?:needs?|seeking|looking for).{0,40}(?:developer|engineer|help)/)
  })

  it('does not recommend CONNECT_WITH_NOTE without an approved note (no impossible final state)', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    if (strategy.messagingPolicy === 'CONNECT_WITH_NOTE') {
      expect(strategy.contact.messageRecommended).toBe(true)
    } else {
      expect(strategy.contact.messageRecommended).toBe(false)
    }
  })

  it('does not overcorrect to SKIP — a real, named, titled founder remains a legitimate contact', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.contact.action).not.toBe('SKIP')
  })
})
