import { describe, expect, it } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { TAMMO_STRUNK_FAJIG_RAW } from './fixtures/hardening-regressions/tammo-strunk-fajig'

/**
 * Hardening regression fixture — Tammo Strunk / Find a Job in Germany.
 *
 * Root-caused failure: the pipeline had no subject/relationship attribution.
 * Market statistics ("79,000 unfilled IT positions"), audience language
 * ("anyone looking for a job"), and a recruiter's service descriptions were
 * all treated as the prospect's own buying intent, producing score 87 / HIGH
 * intent / CONNECT_NOW from evidence that describes the German labor market,
 * not Tammo.
 *
 * These tests assert the GENERAL mechanisms the fix touches, using Tammo as
 * one concrete input. DO NOT special-case "Tammo" / "Find a Job in Germany"
 * in application code — fixes are general attribution/relationship logic.
 *
 * For each invariant, we assert the canonical interpretation that MUST survive
 * the full Prospect Check → Save Lead → Lead Detail → strategy path.
 */
describe('Hardening regression — Tammo Strunk / Find a Job in Germany', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(TAMMO_STRUNK_FAJIG_RAW, {})
    intel = result.intelligence
  })

  // ── Invariant 1: MARKET STATISTIC ≠ TARGET BUYING INTENT ────────────────
  it('does not convert German labor-market statistics into buyer intent', () => {
    // "79,000 unfilled IT positions in Germany" is a market statistic.
    // It must NOT produce immediate_need, HIGH intent, or an explicit ask.
    expect(intel.canonicalScore).toBeLessThan(40)
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intent).not.toBe('HIGH')
    // No "current, explicit need" justification from market data.
    expect(strategy.assessment.intentWhy).not.toMatch(/current.*explicit|explicit.*need|active hiring.*project ask/i)
  })

  // ── Invariant 2: RECRUITER / TALENT BUSINESS ≠ SOFTWARE BUYER ──────────
  it('classifies the career-coaching business as a non-buyer relationship', () => {
    expect(intel.intelligence.businessModel).toBe('RECRUITER')
    expect(intel.intelligence.relationship).toBe('RECRUITER')
  })

  it('names the company correctly from the headline', () => {
    expect(intel.intelligence.company.name?.toLowerCase()).toContain('find a job in germany')
  })

  it('extracts the correct title from the profile header (not a post line)', () => {
    const title = intel.intelligence.person.title ?? ''
    // The title is the headline, not "Software Engineer → use AI in development"
    // which is a line from a post enumerating audience roles.
    expect(title.toLowerCase()).toContain('managing partner')
    expect(title.toLowerCase()).not.toContain('use ai in development')
  })

  it('extracts location from the header, not prose deep in a post', () => {
    expect(intel.intelligence.person.location?.toLowerCase()).toContain('berlin')
    // Must NOT be the garbage "Germany, I would therefore think much broader..."
    expect(intel.intelligence.person.location ?? '').not.toMatch(/i would therefore/)
  })

  // ── Invariant 3: GROWTH SIGNAL (market) ≠ EXPLICIT NEED ─────────────────
  it('does not carry a growth signal derived from German-market commentary', () => {
    // German GDP/AI-market growth in Tammo's posts is market commentary.
    // It must not survive as a buyer opportunity signal.
    expect(intel.intelligence.opportunity.signals).not.toContain('growth_signal')
  })

  // ── Invariant 4: SUBJECT ATTRIBUTION — audience ≠ prospect ──────────────
  it('does not treat audience/candidate language as the prospect seeking work', () => {
    // "anyone looking for a job in Germany" / "professionals looking at Germany"
    // describes Tammo's AUDIENCE, not Tammo. The profile must NOT be treated
    // as a job seeker.
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intentWhy).not.toMatch(/candidate is open to opportunities/i)
    // No fabricated job-seeker framing.
    expect(JSON.stringify(intel.scoreBreakdown.watchOut).toLowerCase()).not.toMatch(/candidate is open/i)
  })

  // ── Invariant 5: REMOTE SEMANTICS — employment eligibility ≠ service ────
  it('marks remote eligibility as NOT_APPLICABLE for a non-employment contact', () => {
    // Tammo is not a job. Pakistan remote eligibility (worker-geography fit)
    // does not apply to a networking/partnership contact.
    expect(intel.remoteEligibility.eligibility).toBe('NOT_APPLICABLE')
    expect(intel.remoteEligibility.workplaceType).toBe('UNKNOWN')
    // Must NOT say "candidate is open to opportunities" or similar job-seeker framing.
    expect(intel.remoteEligibility.reason.toLowerCase()).not.toMatch(/candidate.*open|job seeker/i)
  })

  // ── Invariant 6: INTENT requires attributable current evidence ──────────
  it('resolves intent to UNKNOWN in the absence of attributable buying evidence', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intent).toBe('UNKNOWN')
  })

  it('does not recommend CONTACT_NOW / EXPLICIT_NEED for a non-buyer', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    // CONNECT_NOW would require EXPLICIT_NEED / DEMONSTRATED_PROBLEM — neither
    // is supported for a recruiter. CONNECT_OR_OBSERVE or SKIP is correct.
    expect(strategy.contact.action).not.toBe('CONTACT_NOW')
    expect(strategy.contact.reason).not.toBe('EXPLICIT_NEED')
  })

  // ── Invariant 7: PROOF CONSISTENCY ──────────────────────────────────────
  it('does not fabricate sender proof from the prospect\'s own tech keywords', () => {
    // Tammo mentions "JavaScript" (a mutual group) and "AI" in market commentary.
    // Those must NOT become "relevant proof on file" for a sender.
    const proofDim = intel.scoreBreakdown.dimensions.find((d: { key: string }) => d.key === 'proofStrength')
    // No sender proof is available for this sender+prospect pair.
    expect(proofDim?.points).toBeLessThan(5)
    expect(proofDim?.note.toLowerCase()).not.toMatch(/relevant proof on file|relevant proof available/i)
  })

  // ── Invariant 9: RELATIONSHIP BEFORE SCORE ──────────────────────────────
  it('derives score from the RECRUITER relationship, not from raw text matches', () => {
    // The score is low because the relationship is a non-buyer, regardless of
    // how many hiring/tech keywords appear in the posts.
    expect(intel.canonicalScore).toBeLessThan(25)
    // The watch out names the recruiter classification.
    const watchOut = intel.scoreBreakdown.watchOut.join(' ').toLowerCase()
    expect(watchOut).toContain('recruiter')
  })

  // ── Invariant 10: CONSISTENCY across surfaces ───────────────────────────
  it('produces a consistent canonical interpretation across score, remote, and strategy', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    // Score says LOW/not-a-fit, remote says NOT_APPLICABLE, strategy says
    // CONNECT_OR_OBSERVE/Skip with UNKNOWN intent. All describe the same
    // interpretation: "well-understood person, no evidence they want to buy."
    expect(intel.canonicalScore).toBeLessThan(25)
    expect(intel.remoteEligibility.eligibility).toBe('NOT_APPLICABLE')
    expect(strategy.assessment.intent).toBe('UNKNOWN')
    expect(['CONNECT_OR_OBSERVE', 'SKIP']).toContain(strategy.contact.action)
  })

  // ── HIGH confidence + UNKNOWN intent is valid ───────────────────────────
  it('can be HIGH confidence about what the person does while intent is UNKNOWN', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    // We understand Tammo well (HIGH confidence in extraction) but have no
    // evidence of buying intent. This combination must be valid.
    expect(strategy.assessment.confidence).toBe('HIGH')
    expect(strategy.assessment.intent).toBe('UNKNOWN')
  })

  // ── No fabricated buying signals from the attributable text ─────────────
  it('does not produce hiring/explicit_ask/freelance signals from market commentary', () => {
    const signals = intel.intelligence.opportunity.signals
    expect(signals).not.toContain('hiring')
    expect(signals).not.toContain('explicit_ask')
    expect(signals).not.toContain('freelance_project_need')
    expect(signals).not.toContain('migration')
    // Empty signals is acceptable for a non-buyer with no attributable ask.
    expect(signals.length).toBeLessThanOrEqual(0)
  })

  // ── Temporal ambiguity preserved ────────────────────────────────────────
  it('does not silently resolve the headline/experience temporal disagreement', () => {
    // Headline says "Managing Partner @ Find a Job in Germany" (present) but the
    // experience entry reads "Apr 2020 - Mar 2026" (ended). This ambiguity must
    // not be silently resolved into a stronger opportunity. The current company
    // may or may not be active — we don't fabricate certainty.
    // We assert the relationship is still RECRUITER (the business model is clear
    // regardless of whether the role is current) and the score is not inflated.
    expect(intel.intelligence.relationship).toBe('RECRUITER')
    expect(intel.canonicalScore).toBeLessThan(25)
  })

  // ── Historical employer evidence ≠ current-company need ────────────────
  it('does not treat past employer (AfricaWorks) recruitment as a current buying signal', () => {
    // "Recruited and placed international IT and tech professionals..." describes
    // AfricaWorks (2016-2020), a past role. It must not produce a current
    // hiring signal for Tammo's present company.
    const signals = intel.intelligence.opportunity.signals
    expect(signals).not.toContain('hiring')
    expect(signals).not.toContain('hiring_pressure')
  })
})
