/**
 * REL-QA-001 — explicit buyer integrity (production QA, 26 Oct 2026).
 *
 * Reported: an explicit, prospect-owned buyer request with an approved budget
 * and a start date was scored as "no verified buyer request".
 *
 * Root cause: the canonical line classifier did not recognise
 * "searching for an external software development company to build …" as an
 * external request, so `readBuyerSourceFacts` returned no request and
 * `resolveVerifiedBuyerIntent` correctly reported no verified buyer.
 *
 * The fix belongs at the RAW INPUT → CANONICAL FACT layer (EXTERNAL_PROVIDER in
 * source-facts.ts), not in the UI, the scorer, or the action policy.
 *
 * Fixtures are synthetic. The Nadia fixture is the exact reported example; the
 * siblings are the generalisation matrix required by the release program.
 */
import { describe, expect, it } from 'vitest'
import { resolveBuyerIntentFromSource } from '@/lib/intelligence-v3/buyer-intent'
import { classifyLine } from '@/lib/intelligence-v3/source-facts'

// ── The exact reported fixture ────────────────────────────────────────────────
const NADIA = `Nadia Ahmed
Operations Director
QA Horizon Logistics

We're actively searching for an external software development company to build a custom warehouse management system. Our approved budget is $85,000, and we want to begin development in February 2027.`

describe('REL-QA-001 — explicit buyer integrity', () => {
  it('NADIA_EXPLICIT_BUYER: the reported example is a verified HIGH buyer with a budget', () => {
    const intent = resolveBuyerIntentFromSource(NADIA)

    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.buyerIntentLevel).toBe('HIGH')
    expect(intent.relationshipRole).toBe('BUYER')
    expect(intent.verifiedBudget).toBe(true)
    expect(intent.terminalState).toBeNull()
    // The stored decision must never contradict the source it was built from.
    expect(intent.contradictions).toEqual([])
  })

  it('the reported line classifies as an external request', () => {
    const line = "We're actively searching for an external software development company to build a custom warehouse management system."
    expect(classifyLine(line)).toBe('external_request')
  })

  it('explicit buyer + budget + date: budget survives provenance', () => {
    const intent = resolveBuyerIntentFromSource(NADIA)
    expect(intent.evidence.some((e) => e.kind === 'budget')).toBe(true)
  })

  it('explicit buyer without a budget is still a verified buyer', () => {
    const intent = resolveBuyerIntentFromSource(
      `Priya Nair\nCTO at Delta Freight\n\nWe are looking for an external software company to build our dispatch tool.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.buyerIntentLevel).toBe('HIGH')
    expect(intent.verifiedBudget).toBe(false)
  })

  it('explicit buyer without a date is still a verified buyer', () => {
    const intent = resolveBuyerIntentFromSource(
      `Marcus Webb\nCOO at Harbor Freight\n\nWe need an external development company to rebuild our booking platform.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.buyerIntentLevel).toBe('HIGH')
  })

  // ── Generalisation matrix: these must NOT be read as buyers ────────────────
  it('employee hiring is not an external buyer request', () => {
    const intent = resolveBuyerIntentFromSource(
      `Sofia Reyes\nHead of People at Northwind\n\nWe are hiring a senior backend engineer to join our internal platform team.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(intent.verifiedHiringNeed).toBe(true)
  })

  it('seller-side "contact me if you need…" is never a buyer request', () => {
    const intent = resolveBuyerIntentFromSource(
      `Daniel Brooks\nFreelance Full Stack Developer\n\nI'm a freelance developer. Contact me if your company needs a developer.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(intent.relationshipRole).toBe('SELLER')
  })

  it('a candidate seeking work is not a buyer', () => {
    const intent = resolveBuyerIntentFromSource(
      `Alex Turner\nSenior Frontend Engineer\n\nI'm open to new contract opportunities.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(intent.relationshipRole).toBe('CANDIDATE')
  })

  it('a service provider selling software is not a buyer', () => {
    const intent = resolveBuyerIntentFromSource(
      `Bright Labs\nWe build custom CRM software for logistics companies. Book a demo.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(intent.relationshipRole).toBe('SELLER')
  })

  it('a founder with no buying request is a builder, not a buyer', () => {
    const intent = resolveBuyerIntentFromSource(
      `Nadia Krol\nFounder at Wildroot Botanicals\n\nWildroot is a bootstrapped DTC skincare brand on Shopify. We crossed 20,000 customers this spring.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(intent.relationshipRole).toBe('BUILDER')
  })

  it('a buyer who also sells stays a verified buyer (BUYER_AND_SELLER)', () => {
    const intent = resolveBuyerIntentFromSource(
      `Owen Hart\nFounder at Kiln Works\n\nWe need an external development company to build our new ordering portal.\nWe can build custom inventory software for warehouses.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.relationshipRole).toBe('BUYER_AND_SELLER')
    expect(intent.sellerSideContent).toBe(true)
  })

  it('a request later cancelled is terminal, not a buyer', () => {
    const intent = resolveBuyerIntentFromSource(
      `Lena Fischer\nCOO at Alpen Logistics\n\nWe are looking for an agency to build our new warehouse system.\n\nUpdate: we selected a partner and the project is complete. Please do not contact us with agency offers.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(false)
    expect(intent.terminalState).not.toBeNull()
  })

  it('a cancelled request later reopened is a buyer again', () => {
    const intent = resolveBuyerIntentFromSource(
      `Lena Fischer\nCOO at Alpen Logistics\n\nWe selected a partner and the project is complete. Please do not contact us.\n\nUpdate: the project was cancelled and we are now looking for a new external development company for phase two.`,
    )
    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.buyerIntentLevel).toBe('HIGH')
  })
})
