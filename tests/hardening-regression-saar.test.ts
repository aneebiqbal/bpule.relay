import { describe, expect, it } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { SAAR_MEENTS_SETTWIZ_RAW } from './fixtures/hardening-regressions/saar-meents-settwiz'

/**
 * Hardening regression fixture — Saar Meents / SettWiz.
 *
 * Root-caused failure: pasted LinkedIn activity feeds interleave the
 * prospect's OWN posts with REPOSTS of other people's posts. Without
 * repost-authorship scoping, a third party's post (Kobi Bendelak's repost
 * describing an InsurTech roadshow visiting Physicians Mutual, Mutual of
 * Omaha, etc.) was read as if it were Saar's own text — producing a
 * fabricated "On-site role required in Physicians Mutual, Mutual — not
 * compatible with Pakistan-based remote work" remote barrier and spurious
 * opportunity signals (migration/growth_signal) from market/conference
 * commentary that has nothing to do with Saar's own commercial situation.
 *
 * These tests assert the GENERAL mechanisms the fix touches (repost
 * authorship scoping, employment-workplace-type vs service-engagement-
 * restriction separation), using Saar as one concrete input. DO NOT
 * special-case "Saar" / "SettWiz" / "Kobi Bendelak" in application code.
 */
describe('Hardening regression — Saar Meents / SettWiz', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(SAAR_MEENTS_SETTWIZ_RAW, {})
    intel = result.intelligence
  })

  // ── Invariant 1/2/3: third-party repost content not attributed to Saar ──
  it('does not attribute reposted company mentions to Saar as employer/location/remote-restriction', () => {
    const remoteReason = intel.remoteEligibility.reason.toLowerCase()
    expect(remoteReason).not.toMatch(/physicians mutual|mutual of omaha|blue cross|woodmenlife|aflac|ameritas/i)
    const canonicalJson = JSON.stringify(intel).toLowerCase()
    // The reposted meeting-location companies must never surface as Saar's
    // own workplace/office/employer anywhere in canonical intelligence.
    expect(canonicalJson).not.toMatch(/on-site role required in physicians mutual/i)
  })

  it('does not treat visited/meeting companies as prospect office/workplace', () => {
    expect(intel.remoteEligibility.workplaceType).not.toBe('ONSITE')
  })

  it('does not turn third-party meeting locations (Omaha, Des Moines) into Saar\'s own location', () => {
    const location = (intel.intelligence.person.location ?? '').toLowerCase()
    expect(location).not.toMatch(/omaha|des moines|cincinnati|columbus/i)
  })

  it('meeting/roadshow location does not become a remote-work restriction', () => {
    expect(intel.remoteEligibility.eligibility).not.toBe('INELIGIBLE')
  })

  // ── Invariant 5: employment workplace_type vs service-engagement restriction ─
  it('Saar\'s own "Israel · Hybrid" employment entry does not produce a service-delivery remote restriction', () => {
    expect(intel.remoteEligibility.eligibility).not.toBe('INELIGIBLE')
    expect(intel.remoteEligibility.reason.toLowerCase()).not.toMatch(/on-site role required in israel|hybrid role requires presence in israel/i)
    expect(['NOT_APPLICABLE', 'UNCLEAR', 'ELIGIBLE', 'LIKELY_ELIGIBLE']).toContain(intel.remoteEligibility.eligibility)
  })

  // ── Invariant 6: repost authorship preserved ────────────────────────────
  it('does not attribute Kobi Bendelak\'s repost words to Saar', () => {
    // Kobi's repost content (roadshow logistics, meeting Nebraska insurers)
    // must not appear as Saar's own opportunityTrigger/probableNeed evidence.
    const ownText = JSON.stringify({
      trigger: intel.intelligence.opportunityTrigger,
      need: intel.intelligence.probableNeed,
    }).toLowerCase()
    expect(ownText).not.toMatch(/nebraska insurance federation|physicians mutual/i)
  })

  // ── Invariant 7: founder selling own product ≠ buyer intent for BPulse ──
  it('does not classify founder selling own product (SettWiz) as buyer intent for BPulse services', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intent).not.toBe('HIGH')
    expect(intel.intelligence.businessModel).toBe('PRODUCT')
  })

  // ── Invariant 8: "open to partnerships" ≠ software-vendor buyer intent ──
  it('"open to partnerships" language does not become software-vendor buyer intent', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intentWhy).not.toMatch(/explicit.*need|active hiring.*project ask/i)
  })

  // ── Invariant 9: conference/roadshow activity alone doesn't fabricate a growth signal ─
  it('conference/roadshow/sponsorship activity does not automatically produce a generic growth_signal without specific supporting evidence', () => {
    expect(intel.intelligence.opportunity.signals).not.toContain('growth_signal')
    expect(intel.intelligence.opportunity.signals).not.toContain('migration')
  })

  // ── Invariant 10: remote eligibility never renders "unclear" for NOT_APPLICABLE ─
  it('remote eligibility renders as NOT_APPLICABLE/UNCLEAR/ELIGIBLE — never "unclear" wording, never an onsite/geographic barrier from third-party or employment data', () => {
    const reason = intel.remoteEligibility.reason.toLowerCase()
    if (intel.remoteEligibility.eligibility === 'NOT_APPLICABLE') {
      expect(reason).not.toMatch(/unclear/)
    }
    expect(intel.remoteEligibility.eligibility).not.toBe('INELIGIBLE')
    const watchOutJoined = intel.scoreBreakdown.watchOut.join(' ').toLowerCase()
    expect(watchOutJoined).not.toMatch(/remote eligibility unclear/i)
  })

  // ── Invariant 11: no contradictory SKIP+CONNECT_WITHOUT_NOTE simultaneous state ─
  it('does not produce a contradictory SKIP action alongside a CONNECT_WITHOUT_NOTE messaging policy', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    if (strategy.messagingPolicy === 'CONNECT_WITHOUT_NOTE' || strategy.messagingPolicy === 'CONNECT_WITH_NOTE') {
      expect(strategy.contact.action).not.toBe('SKIP')
    }
    if (strategy.contact.action === 'SKIP') {
      expect(strategy.messagingPolicy).toBe('SKIP')
    }
  })
})
