import { describe, it, expect } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { normalizeGreeting } from '@/lib/prospect/connection-note'
import { MD_ABUL_MANSUR_XHYRE_RAW } from './fixtures/hardening-regression-md-abul-mansur-xhyre'

/**
 * Hardening regression — MD ABUL MANSUR / XHYRE (cross-company temporal
 * attribution).
 *
 * See fixtures/hardening-regression-md-abul-mansur-xhyre.ts for the full
 * source-truth writeup. Root-caused failures fixed by this fixture:
 *
 * 1. stripThirdPartyRepostBlocks never resumed after the LAST repost block in
 *    a pasted Activity feed if that block had no closing "View <prospect>'s
 *    profile" marker of its own — the entire Experience section (always the
 *    prospect's own data) that followed was silently swallowed, hiding
 *    XHYRE's current-company description from business-model classification
 *    entirely. Fixed: a profile-section header (Experience/Education/etc.)
 *    always ends an active repost skip.
 * 2. PRODUCT_MODEL_PATTERNS had no shape for LinkedIn's third-person
 *    "Experience" company-description style ("XHYRE Ltd. is the next
 *    generation ... platform"), only first-person "we're building X".
 * 3. deriveRelationship had no fallback for a decision-maker at their own
 *    CURRENT product company with no external-delivery-seeking language —
 *    it fell through to the POTENTIAL_BUYER default. A technical
 *    decision-maker is not automatically an active buyer.
 * 4. The bare word "procurement" and bare "need" (extraction-pipeline's
 *    hiringSignals heuristic) matched completely unrelated text describing
 *    a former employer's e-government procurement PROJECT and a payments
 *    company's marketing copy, respectively — fabricating a "Hiring
 *    activity detected" evidence entry from Nuspay's historical company
 *    description, which then grounded the connection-note/strongestEvidence
 *    output.
 * 5. Bare "agency" (deriveRelationship's agency/vendor pattern) matched
 *    "Donor Agency" in an unrelated government-project bullet point.
 * 6. normalizeGreeting's full-name-greeting regex consumed only one word
 *    after the extracted first name, leaving trailing name tokens dangling
 *    for multi-token display names ("Hi MD Abul Mansur," → "Hi MD, Mansur,"
 *    instead of "Hi MD,").
 *
 * DO NOT special-case "Mansur", "XHYRE", or "Nuspay" anywhere in application
 * code, and do not tune his numeric score. Fixes must be general semantic
 * fixes verified by running this fixture, not fixes that pattern-match this
 * text.
 */
describe('Hardening regression — MD ABUL MANSUR / XHYRE (cross-company temporal attribution)', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(MD_ABUL_MANSUR_XHYRE_RAW, {})
    intel = result.intelligence
  })

  it('classifies XHYRE as a PRODUCT business from the Experience-section company description', () => {
    expect(intel.intelligence.businessModel).toBe('PRODUCT')
  })

  it('classifies the relationship as non-buyer (NETWORKING) — a technical decision-maker is not automatically an active buyer', () => {
    expect(intel.intelligence.relationship).toBe('NETWORKING')
  })

  it('service-buyer intent stays UNKNOWN with no external engineering need detected', () => {
    const reading = intel.intelligence.commercialReading
    expect(reading?.serviceBuyerIntent).toBe('UNKNOWN')
    expect(reading?.externalEngineeringNeed).toBe('NONE_DETECTED')
    expect(reading?.immediateBuyerNeed).toBe(false)
    expect(reading?.buyerTiming).toBe('UNKNOWN')
    expect(reading?.technicalRelevance).toBe('HIGH')
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intent).toBe('UNKNOWN')
  })

  it('buyer fit is LOW, explicitly labeled not-a-buyer', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.fit).toBe('LOW')
    expect(strategy.assessment.fitWhy.toLowerCase()).toMatch(/not.*(?:software-delivery )?buyer/)
  })

  it('does not fabricate a growth_signal from an ambitious company description or global-market language', () => {
    expect(intel.intelligence.opportunity.signals).not.toContain('growth_signal')
  })

  it('does not fabricate a hiring/buyer signal from a former employer\'s marketing copy or a past e-government project', () => {
    expect(intel.intelligence.opportunity.signals).not.toContain('hiring')
    expect(intel.intelligence.opportunity.signals).not.toContain('explicit_ask')
    const canonicalJson = JSON.stringify(intel).toLowerCase()
    expect(canonicalJson).not.toMatch(/hiring activity detected/)
  })

  it('does not classify the relationship as POTENTIAL_PARTNER from an unrelated "Donor Agency" mention', () => {
    expect(intel.intelligence.relationship).not.toBe('POTENTIAL_PARTNER')
  })

  it('remote eligibility is NOT_APPLICABLE — no employment/engagement opportunity exists', () => {
    expect(intel.remoteEligibility.eligibility).toBe('NOT_APPLICABLE')
  })

  it('does not ground outreach evidence in historical Nuspay achievements when current XHYRE evidence exists', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.strongestEvidence ?? '').not.toMatch(/Nuspay/i)
    expect(strategy.uiRationale.toLowerCase()).not.toMatch(/nuspay/i)
  })

  it('does not overcorrect to SKIP — a real, named, titled technical decision-maker is a legitimate contact', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.contact.action).not.toBe('SKIP')
  })

  it('fixes the multi-token display name greeting bug: "MD ABUL MANSUR" must never render as "Hi MD, Mansur,"', () => {
    const result = normalizeGreeting('Hi MD Abul Mansur, saw your work on XHYRE.', intel.intelligence.person.fullName)
    expect(intel.intelligence.person.fullName).toBe('MD ABUL MANSUR')
    expect(result).not.toMatch(/Hi MD, Mansur,/)
  })

  it('does not manufacture an opportunity from technical/domain similarity alone', () => {
    const canonicalJson = JSON.stringify(intel).toLowerCase()
    expect(canonicalJson).not.toMatch(/verified proof.*xhyre needs|xhyre.*implementation problem/)
  })
})
