import { describe, it, expect } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { JAY_M_VYYER_RAW } from './fixtures/hardening-regression-jay-m-vyyer'

/**
 * Hardening regression fixture — Jay M. / Vyyer Technologies.
 *
 * Vyyer seeks "beta testers and design partners" — a DESIGN_PARTNER_REQUEST,
 * not a SOFTWARE_VENDOR_REQUEST. This is a real current ask but for a
 * different commercial relationship.
 */
describe('Hardening regression — Jay M. / Vyyer Technologies', () => {
  let intel: Awaited<ReturnType<typeof produceCanonicalIntelligence>>['intelligence']

  it('runs', async () => {
    const result = await produceCanonicalIntelligence(JAY_M_VYYER_RAW, {})
    intel = result.intelligence
  })

  it('does not fabricate a software-buying need from a design-partner request', () => {
    // "seeking beta testers and design partners" is NOT "looking for a
    // development partner" or engineering vendor. Must not produce explicit_ask
    // or freelance_project_need signals.
    expect(intel.intelligence.opportunity.signals).not.toContain('explicit_ask')
    expect(intel.intelligence.opportunity.signals).not.toContain('freelance_project_need')
    expect(intel.intelligence.opportunity.signals).not.toContain('technical_problem')
  })

  it('keeps buyer intent UNKNOWN', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    expect(strategy.assessment.intent).toBe('UNKNOWN')
  })

  it('no fabricated software-delivery need', () => {
    // Must not show migration/rebuild/hiring signals from a design-partner ask.
    expect(intel.intelligence.opportunity.signals).not.toContain('migration')
    expect(intel.intelligence.opportunity.signals).not.toContain('rebuild')
    expect(intel.intelligence.opportunity.signals).not.toContain('hiring')
  })

  it('maintains confidence on attribution', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(intel, { channel: 'connection' }))
    // Even without a buyer opportunity, we can understand who Jay is.
    // Confidence is at least MEDIUM (we have a clear person/role).
    expect(['HIGH', 'MEDIUM']).toContain(strategy.assessment.confidence)
  })
})
