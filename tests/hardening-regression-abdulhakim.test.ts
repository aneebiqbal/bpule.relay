import { describe, expect, it } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { ABDULHAKIM_SHEIK_TAYO360_RAW } from './fixtures/hardening-regressions/abdulhakim-sheik-tayo360'

/**
 * Hardening regression fixture — Abdulhakim Sheik / Tayo360 (POSITIVE control).
 *
 * Unlike the Tammo/Saar/Avigail fixtures, this profile contains a REAL
 * explicit first-person hiring post. The attribution/relationship fixes
 * applied for the other fixtures (subject attribution, relationship-aware
 * gating, remote-eligibility NOT_APPLICABLE handling, repost scoping) must
 * NOT cause this genuine hiring signal to be suppressed. The critical
 * distinction: "Tammo discusses hiring (a recruiter describing his own
 * audience/service)" vs "Abdulhakim IS hiring (a prospect's own first-person
 * hiring post with explicit apply instructions)".
 *
 * DO NOT tune Abdulhakim's numeric score to hit a specific number — these
 * assertions are qualitative (intent stays HIGH, hiring signal verified, a
 * real contact action survives), not tied to a specific score value.
 */
describe('Hardening regression — Abdulhakim Sheik / Tayo360 (positive control)', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']
  let strategy: ReturnType<typeof buildRevenueStrategy>

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(ABDULHAKIM_SHEIK_TAYO360_RAW, {})
    intel = result.intelligence
    strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
  })

  it('hiring signal present and verified', () => {
    expect(intel.intelligence.opportunity.signals).toContain('hiring')
    expect(intel.intelligence.content.hiringSignals.length).toBeGreaterThan(0)
    expect(intel.intelligence.content.hiringSignals.join(' ')).toMatch(/hiring/i)
  })

  it('intent is HIGH (top-tier), not suppressed to UNKNOWN/LOW by the non-buyer relationship fixes', () => {
    expect(strategy.assessment.intent).toBe('HIGH')
  })

  it('recommends a real contact action — not SKIP, not a no-message CONNECT_OR_OBSERVE', () => {
    expect(strategy.contact.action).not.toBe('SKIP')
    expect(strategy.contact.messageRecommended).toBe(true)
    expect(strategy.messagingPolicy).not.toBe('SKIP')
    expect(strategy.messagingPolicy).not.toBe('OBSERVE')
  })

  it('explicit first-person hiring post survives subject attribution as PROSPECT-attributed evidence', () => {
    // The post is authored by Abdulhakim himself (no "reposted this" framing),
    // so it must remain attributable and drive the opportunity signal — not be
    // stripped as third-party/repost content.
    expect(intel.intelligence.businessModel).toBe('PRODUCT')
    expect(intel.intelligence.opportunityTrigger ?? '').toMatch(/hiring|tayo360/i)
  })

  it('relationship is not misclassified as a non-buyer (recruiter/partner/peer)', () => {
    expect(['RECRUITER', 'POTENTIAL_PARTNER', 'PEER']).not.toContain(intel.intelligence.relationship)
  })

  // ── 5a: sender channel authorization (structural check — no store/profiles
  // wired in this pure-pipeline test, so we assert the strategy's channel is
  // what a LinkedIn connection-note flow would use; the actual sender-gate is
  // exercised at the route level, covered by the route.ts implementation).
  it('strategy channel is connection (LinkedIn), consistent with a connection-note recommendation', () => {
    expect(strategy.channel).toBe('connection')
    expect(strategy.messagingPolicy).toMatch(/CONNECT_WITH_NOTE|CONNECT_WITHOUT_NOTE/)
  })

  // ── 5c: CONNECT_WITH_NOTE cannot coexist with an empty/no-note final state.
  it('if action is CONNECT_WITH_NOTE, that implies a note is expected (not an empty-note contradiction)', () => {
    if (strategy.messagingPolicy === 'CONNECT_WITH_NOTE') {
      expect(strategy.messageJob).not.toBeNull()
      expect(strategy.contact.messageRecommended).toBe(true)
    }
  })

  it('does not assert a specific score value — only qualitative invariants', () => {
    // Deliberately weak assertion: score must be reasonably high (top half),
    // but the EXACT number is never pinned, per instructions not to tune it.
    expect(intel.canonicalScore).toBeGreaterThanOrEqual(60)
  })
})
