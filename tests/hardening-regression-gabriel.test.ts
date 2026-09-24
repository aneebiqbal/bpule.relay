import { describe, expect, it } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical, describeVerdictForDisplay, describeMessagingPolicy } from '@/lib/relay/revenue-strategy'
import { GABRIEL_TOKUSHEV_LOGICDESK_RAW } from './fixtures/hardening-regressions/gabriel-tokushev-logicdesk'

/**
 * Hardening regression fixture — Gabriel Tokushev / LogicDesk
 * (relationship-direction / offering-vs-need regression).
 *
 * Root-caused failure: Relay correctly detected heavy engineering/
 * architecture language in Gabriel's posts, but inverted its direction —
 *   person discusses technical problems (as a SELLER pitching a fix to
 *   CUSTOMERS) → incorrectly inferred as: person's own company HAS that
 *   problem → buyer need → HIGH intent → immediate need.
 *
 * LogicDesk's own positioning ("Partnerships with specialized engineering
 * teams to unblock critical roadmaps... We map those exact friction points
 * and drop in the right engineering pod to unblock them") is an OFFERING
 * statement — what LogicDesk sells its clients — not evidence LogicDesk
 * itself has architecture/technical-debt problems or is shopping for
 * external delivery help.
 *
 * GENERAL INVARIANT (not specific to Gabriel):
 *   PROBLEM I SELL AGAINST ≠ PROBLEM MY COMPANY HAS
 *   THOUGHT LEADERSHIP ABOUT CUSTOMER PAIN ≠ CURRENT BUYING INTENT
 *   "I help companies solve X" ≠ "I need someone to solve X for me"
 *
 * At the same time, LogicDesk's "partnerships with specialized engineering
 * teams" is REAL partnership evidence — this must not overcorrect to SKIP.
 * Gabriel is the positive PARTNERSHIP control (paired with Abdulhakim as the
 * positive BUYER/HIRING control): expected relationship = POTENTIAL_PARTNER,
 * buyer intent = UNKNOWN, a valid non-SKIP relationship action, confidence
 * can be HIGH (attribution is strong), remote eligibility NOT_APPLICABLE,
 * no fabricated growth_signal from other companies' funding/hiring news.
 *
 * DO NOT special-case "Gabriel", "Tokushev", "LogicDesk", or any wording
 * from this profile anywhere in application code, and do not tune his
 * numeric score. Fixes derived from this fixture must be general semantic
 * fixes (service-provider business-model classification, offering-vs-need
 * attribution, market/other-company evidence scoping), verified by running
 * this fixture, not fixes that pattern-match this text.
 */
describe('Hardening regression — Gabriel Tokushev / LogicDesk (positive partnership control)', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(GABRIEL_TOKUSHEV_LOGICDESK_RAW, {})
    intel = result.intelligence
  })

  // ── Invariant 1/4: service provider describing customer pain != buyer need; selling engineering services != buying engineering services ──
  it('classifies LogicDesk as a service-provider business, not a product/buyer', () => {
    expect(intel.intelligence.businessModel).toBe('SERVICE_PROVIDER')
  })

  // ── Invariant 5: partnership language creates a partnership opportunity, not SKIP ──
  it('classifies the relationship as POTENTIAL_PARTNER — not POTENTIAL_BUYER, not forced to SKIP', () => {
    expect(intel.intelligence.relationship).toBe('POTENTIAL_PARTNER')
  })

  // ── Invariant 2/3: thought leadership != internal problem; market problem != company problem ──
  it('does not infer LogicDesk itself has a technical-debt/architecture problem from its own sales pitch language', () => {
    const need = (intel.intelligence.probableNeed ?? '').toLowerCase()
    const trigger = (intel.intelligence.opportunityTrigger ?? '').toLowerCase()
    expect(need).not.toMatch(/logicdesk (?:has|lacks|needs) (?:a |an )?(?:single owner|architecture|engineering)/)
    expect(trigger).not.toMatch(/logicdesk (?:has|lacks|needs)/)
  })

  // ── Invariant 6/7: partnership intent != buyer intent; partnership fit cannot inflate service-buyer intent ──
  it('buyer intent stays UNKNOWN — no first-person "we need"/"looking for" evidence exists', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intent).toBe('UNKNOWN')
    expect(strategy.assessment.intent).not.toBe('HIGH')
  })

  it('buyer fit is LOW/not-a-buyer, explicitly labeled — not inflated by partnership relevance', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.fit).toBe('LOW')
    expect(strategy.assessment.fitWhy.toLowerCase()).toMatch(/not.*(?:software-delivery )?buyer/)
  })

  // ── "immediate need" must not be inferred from thought-leadership/positioning text ──
  it('does not report an immediate buying need with no first-person buyer-ask evidence', () => {
    expect(intel.intelligence.opportunity.urgency).toBe('unknown')
    const reasonsJoined = intel.scoreBreakdown.reasons.join(' ').toLowerCase()
    expect(reasonsJoined).not.toMatch(/immediate need detected/)
  })

  // ── Invariant 8: market/company news != prospect growth ──
  it('does not fabricate a growth_signal from other companies\' funding/hiring news in the Tech Intel posts', () => {
    expect(intel.intelligence.opportunity.signals).not.toContain('growth_signal')
    expect(intel.intelligence.opportunity.signals).not.toContain('funding')
    // WHOOP, Harvey, OpenAI, Snyk etc. are third-party companies mentioned in
    // Gabriel's newsletter-style posts — never LogicDesk's own funding/growth.
    const signalsJson = JSON.stringify(intel.intelligence.opportunity).toLowerCase()
    expect(signalsJson).not.toMatch(/whoop|harvey|openai raised|\$10\.1b|\$11b/)
  })

  // ── Invariant 9/10: absence of geo restriction != verified worldwide remote; partnership/service relationship can make remote N/A ──
  it('remote eligibility is NOT_APPLICABLE — absence of a restriction is not converted into verified worldwide remote eligibility', () => {
    expect(intel.remoteEligibility.eligibility).toBe('NOT_APPLICABLE')
    const reason = intel.remoteEligibility.reason.toLowerCase()
    expect(reason).not.toMatch(/eligible from pakistan/)
    expect(reason).not.toMatch(/no geographic restrictions/)
  })

  it('does not fabricate an "explicit ask for external project help" from generic engineering vocabulary', () => {
    const evidence = (intel.remoteEligibility.evidence ?? []).join(' ').toLowerCase()
    expect(evidence).not.toMatch(/explicit ask for external project help/)
  })

  // ── No SKIP overcorrection: real partnership evidence exists ──
  it('does not overcorrect to SKIP — a valid non-buyer relationship action is recommended', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.contact.action).not.toBe('SKIP')
  })

  // ── Verdict/action must not contradict (reuses the shared display helper) ──
  it('verdict display does not render a bare contradictory "skip" alongside a valid connect/observe action', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    const display = describeVerdictForDisplay(intel.qualification, strategy.contact.action, describeMessagingPolicy(strategy.messagingPolicy))
    if (strategy.contact.action !== 'SKIP') {
      expect(display.headline.toLowerCase()).not.toBe('probably skip')
    }
  })

  // ── Invariant 11: message cannot diagnose the seller with the problem they sell against ──
  it('does not recommend a message that diagnoses LogicDesk with technical debt or missing architecture ownership', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    // No buyer need to pitch — CONNECT_WITHOUT_NOTE/OBSERVE carries no
    // generated message at all, which is the correct outcome here (per the
    // approved design: do not force a discovery question about the problem
    // Gabriel already sells against).
    expect(strategy.contact.messageRecommended).toBe(false)
    expect(strategy.allowedNow.join(' ').toLowerCase()).not.toMatch(/logicdesk (?:has|lacks)|gabriel needs help/)
  })

  // ── Invariant 12: selected-sender proof remains distinct from general available proof ──
  it('does not claim "relevant proof on file" for a non-buyer relationship with no pitching action', () => {
    const reasonsJoined = intel.scoreBreakdown.reasons.join(' ').toLowerCase()
    expect(reasonsJoined).not.toMatch(/relevant proof on file/)
  })

  // ── Confidence can legitimately be HIGH even though buyer intent is UNKNOWN ──
  it('confidence can be HIGH on strong attribution even though buyer intent is UNKNOWN (not conflated)', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    // Not a strict requirement that it MUST be HIGH, but if it is, intent
    // must still independently read UNKNOWN — confidence-in-attribution and
    // buyer-intent are different axes and must not be forced to agree.
    if (strategy.assessment.confidence === 'HIGH') {
      expect(strategy.assessment.intent).toBe('UNKNOWN')
    }
  })
})
