import { describe, it, expect } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { HARVEY_SCHWARTZ_CARLYLE_RAW } from './fixtures/hardening-regression-harvey-schwartz-carlyle'
import { MICK_CUNNINGHAM_RALCO_RAW } from './fixtures/hardening-regression-mick-cunningham-ralco'

describe('Hardening regression — Harvey Schwartz / Carlyle', () => {
  it('does not fabricate an external project from AI exploration', async () => {
    const result = await produceCanonicalIntelligence(HARVEY_SCHWARTZ_CARLYLE_RAW, {})
    const canon = result.intelligence
    const intel = canon.intelligence
    // Carlyle's MIT AI partnership is exploration, not an external project ask.
    expect(intel.opportunity.signals).not.toContain('explicit_ask')
    expect(canon.remoteEligibility.eligibility).toBe('NOT_APPLICABLE')
    const strategy = buildRevenueStrategy(sourceFromCanonical(canon, { channel: 'connection' }))
    expect(strategy.assessment.intent).toBe('UNKNOWN')
    // Harvey/Carlyle is a fully identifiable lead.
    expect(canon.extractionCompleteness.score).toBeGreaterThan(50)
  })
})

describe('Hardening regression — Mick Cunningham / RALCO', () => {
  it('does not transfer reposted Pendo content to RALCO', async () => {
    const result = await produceCanonicalIntelligence(MICK_CUNNINGHAM_RALCO_RAW, {})
    const canon = result.intelligence
    const intel = canon.intelligence
    // Pierce Healy's Pendo posts (Cursor Marketplace, Claude Cowork) are
    // third-party reposts — must not create RALCO opportunity signals.
    const allSignals = intel.opportunity.signals.join(' ').toLowerCase()
    expect(allSignals).not.toMatch(/cursor marketplace|claude cowork|mcp server|agent analytics/i)
    expect(canon.remoteEligibility.eligibility).toBe('NOT_APPLICABLE')
  })

  it('does not fabricate immediate need from reposted content', async () => {
    const result = await produceCanonicalIntelligence(MICK_CUNNINGHAM_RALCO_RAW, {})
    const canon = result.intelligence
    const intel = canon.intelligence
    expect(intel.opportunity.urgency).not.toBe('immediate')
  })
})
