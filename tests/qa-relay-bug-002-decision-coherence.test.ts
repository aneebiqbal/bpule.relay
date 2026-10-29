/**
 * BUG-002 — the lead UI must not contradict the canonical buyer decision.
 *
 * A HIGH / verified buyer request can never be shown next to "No verified
 * buyer request", even when the dimension share is low (a deterministic
 * override or a future start date).
 */
import { describe, expect, it } from 'vitest'
import { buildNegativeSignals, buildPositiveSignals } from '@/components/lead-workspace-simple'
import type { LeadDetail } from '@/lib/store/types'

function lead(overrides: Partial<LeadDetail> = {}): LeadDetail {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    company: 'NorthPeak',
    companyKey: 'northpeak',
    contactName: 'Ethan Mitchell',
    contactTitle: 'CTO',
    url: null,
    rawInput: null,
    signalType: 1,
    signalEvidence: 'We need an external team to build our platform.',
    verbatimQuote: null,
    score: 8,
    verdict: 'send',
    status: 'new',
    playId: null,
    tags: [],
    direction: 'outbound',
    source: 'linkedin',
    connectionAcceptedAt: null,
    lockedUntil: null,
    lockedReason: null,
    archived: false,
    archivedAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    canonicalScore: 80,
    canonicalIntelligence: {
      scoreBreakdown: {
        dimensions: [
          { key: 'buyerIntent', label: 'Buyer intent', points: 0, max: 25 },
          { key: 'fit', label: 'Fit', points: 18, max: 25 },
        ],
      },
    },
    messages: [],
    outcomes: [],
    followupCount: 0,
    ...overrides,
  } as unknown as LeadDetail
}

describe('BUG002_RECRUITER_DECISION_COHERENCE', () => {
  it('does not say "no verified buyer request" when the canonical intent is HIGH', () => {
    const negative = buildNegativeSignals(lead({ buyerIntent: { buyerIntentLevel: 'HIGH', verifiedBuyerRequest: false } }))
    expect(negative).not.toContain('No verified buyer request')
    expect(buildPositiveSignals(lead({ buyerIntent: { buyerIntentLevel: 'HIGH', verifiedBuyerRequest: false } }))).toContain('High buyer intent')
  })

  it('does not say "no verified buyer request" when the request is verified', () => {
    const negative = buildNegativeSignals(lead({ buyerIntent: { buyerIntentLevel: 'MEDIUM', verifiedBuyerRequest: true } }))
    expect(negative).not.toContain('No verified buyer request')
    expect(buildPositiveSignals(lead({ buyerIntent: { buyerIntentLevel: 'MEDIUM', verifiedBuyerRequest: true } }))).toContain('Verified request for outside help')
  })

  it('still reports a genuinely weak, unverified lead', () => {
    const negative = buildNegativeSignals(lead({ buyerIntent: { buyerIntentLevel: 'LOW', verifiedBuyerRequest: false } }))
    expect(negative).toContain('No verified buyer request')
  })
})
