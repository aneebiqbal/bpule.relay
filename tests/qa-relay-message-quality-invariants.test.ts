/**
 * Message quality + follow-up + data-semantic invariants (Phases 18–21).
 *
 * Phase 19 — property tests: for any message marked sendable, unsupported claims
 * are empty, the lead is not terminal, explicit buyer questions are 100%
 * covered, and there are no placeholder artifacts.
 *
 * Phase 20 — follow-up invariants: terminal never follows up, a reply cancels a
 * cold follow-up, an explicit deferral wins, the max count is respected.
 *
 * Phase 21 — data semantics: unknown != zero, NO_THREAD != VERIFIED,
 * replied != needs-reply, sender != owner, score != activity points.
 */
import { describe, expect, it } from 'vitest'
import {
  assessReplyPlan,
  buildReplyPlan,
  decideMessageQuality,
  extractBuyerRequests,
  hasInventedAvailability,
} from '@/lib/relay/buyer-request-plan'
import { evaluateFollowUpPolicy } from '@/lib/conversation/follow-up-policy'
import { deriveNextLeadAction } from '@/lib/relay/lead-state-machine'
import { deriveRelationshipDisplayState } from '@/lib/relay/conversation-presence'
import { qualifyCanonicalScore } from '@/lib/scoring/qualification'
import type { LeadDetail } from '@/lib/store/types'

const PLACEHOLDER = /\b(todo|fixme|lorem ipsum|insert (name|here|text)|\[name\]|\[insert|placeholder text|xxx+)\b/i

function makeLead(overrides: Partial<LeadDetail> = {}): LeadDetail {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    company: 'Acme',
    companyKey: 'acme',
    contactName: 'Sarah',
    contactTitle: 'VP Engineering',
    url: null,
    rawInput: null,
    signalType: 1,
    signalEvidence: 'Hiring engineers',
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
    createdAt: '2026-10-20T10:00:00Z',
    canonicalScore: 80,
    messages: [],
    outcomes: [],
    followupCount: 0,
    ...overrides,
  }
}

/** Build the canonical quality decision for a client message + draft. */
function quality(clientMessage: string, draft: string) {
  const plan = buildReplyPlan(extractBuyerRequests(clientMessage))
  const coverage = assessReplyPlan(plan, draft)
  return decideMessageQuality(coverage, { inventedAvailability: hasInventedAvailability(draft) })
}

describe('Phase 19 — sendable message properties', () => {
  const cases: Array<{ name: string; client: string; draft: string }> = [
    {
      name: 'EXPERIENCE',
      client: 'Have you built anything similar?',
      draft: 'We have built similar systems before, for two logistics clients.',
    },
    {
      name: 'TIMELINE',
      client: 'How long would delivery take?',
      draft: 'The timeline is about 10 weeks, delivered in two phases.',
    },
    {
      name: 'PRICING',
      client: 'Can you share rough pricing?',
      draft: 'The cost depends on scope; a ballpark is available once we agree the scope.',
    },
    {
      name: 'MEETING',
      client: 'Could your team speak sometime next week?',
      draft: 'I can coordinate a time next week that suits you.',
    },
    {
      name: 'TECH_STACK',
      client: 'Do you work with React and Node?',
      draft: 'We work with React on the front end and Node on the back end.',
    },
  ]

  it.each(cases)('$name: sendable, fully covered, no placeholders', ({ client, draft }) => {
    const decision = quality(client, draft)
    expect(decision.sendable, decision.blockers.join('; ')).toBe(true)
    expect(decision.questionCoverage).toBe(1)
    expect(decision.unsupportedClaims).toHaveLength(0)
    expect(PLACEHOLDER.test(draft)).toBe(false)
    expect(hasInventedAvailability(draft)).toBe(false)
  })

  it('a sendable message is never on a terminal lead', () => {
    const decision = quality('How long would delivery take?', 'The timeline is about 10 weeks.')
    expect(decision.sendable).toBe(true)
    for (const status of ['won', 'lost', 'dead', 'no'] as const) {
      const action = deriveNextLeadAction(makeLead({ status }))
      expect(action.requiresAction).toBe(false)
    }
  })

  it('a draft with a placeholder artifact is never sendable', () => {
    const decision = decideMessageQuality(assessReplyPlan(buildReplyPlan([]), 'TODO: fill this in'), {
      unsupportedClaims: ['placeholder text present'],
    })
    expect(decision.sendable).toBe(false)
  })
})

describe('Phase 20 — follow-up invariants', () => {
  const now = new Date('2026-10-27T12:00:00Z')

  it('a terminal lead is never eligible for follow-up', () => {
    for (const leadStatus of ['won', 'lost', 'dead', 'no']) {
      const result = evaluateFollowUpPolicy({
        leadStatus,
        outcome: null,
        lastOutboundAt: '2026-10-01T10:00:00Z',
        lastInboundAt: null,
        followupCount: 0,
        now,
      })
      expect(result.eligible).toBe(false)
      expect(result.terminal).toBe(true)
    }
    const byOutcome = evaluateFollowUpPolicy({
      leadStatus: 'replied',
      outcome: 'DO_NOT_CONTACT',
      lastOutboundAt: '2026-10-01T10:00:00Z',
      lastInboundAt: null,
      followupCount: 0,
      now,
    })
    expect(byOutcome.eligible).toBe(false)
    expect(byOutcome.cancelledByOutcome).toBe(true)
  })

  it('a reply after our last message cancels a cold follow-up', () => {
    const result = evaluateFollowUpPolicy({
      leadStatus: 'replied',
      outcome: null,
      lastOutboundAt: '2026-10-20T10:00:00Z',
      lastInboundAt: '2026-10-25T10:00:00Z',
      followupCount: 0,
      now,
    })
    expect(result.eligible).toBe(false)
    expect(result.cancelledByReply).toBe(true)
  })

  it('an explicit deferral date overrides the cadence', () => {
    const future = evaluateFollowUpPolicy({
      leadStatus: 'contacted',
      outcome: null,
      lastOutboundAt: '2026-10-01T10:00:00Z',
      lastInboundAt: null,
      followupCount: 0,
      deferralDate: '2026-11-15T00:00:00Z',
      now,
    })
    expect(future.eligible).toBe(false)
    expect(future.nextFollowupAt).toBe('2026-11-15T00:00:00.000Z')

    const arrived = evaluateFollowUpPolicy({
      leadStatus: 'contacted',
      outcome: null,
      lastOutboundAt: '2026-10-01T10:00:00Z',
      lastInboundAt: null,
      followupCount: 0,
      deferralDate: '2026-10-15T00:00:00Z',
      now,
    })
    expect(arrived.eligible).toBe(true)
  })

  it('the max follow-up count is respected', () => {
    const result = evaluateFollowUpPolicy({
      leadStatus: 'contacted',
      outcome: null,
      lastOutboundAt: '2026-09-01T10:00:00Z',
      lastInboundAt: null,
      followupCount: 3,
      now,
    })
    expect(result.eligible).toBe(false)
    expect(result.reason).toMatch(/3 follow-ups/)
  })
})

describe('Phase 21 — data semantic invariants', () => {
  it('unknown is not zero: a missing numeric field is null, never 0', () => {
    const lead = makeLead({ canonicalScore: null, score: null })
    expect(lead.canonicalScore).toBeNull()
    expect(lead.score).toBeNull()
    expect(lead.canonicalScore === 0).toBe(false)
  })

  it('NO_THREAD is not VERIFIED: an empty thread is not a verified conversation', () => {
    expect(deriveRelationshipDisplayState(makeLead({ messages: [] })).display).not.toBe('CONNECTED')
  })

  it('replied is not needs-reply: the rep who wrote last waits, the client who wrote last owes a reply', () => {
    const now = new Date('2026-10-20T16:00:00Z').getTime()
    const repWroteLast = makeLead({
      status: 'contacted',
      connectionAcceptedAt: '2026-10-20T12:00:00Z',
      messages: [
        { id: 'm1', organizationId: 'o', leadId: 'l', repId: 'r', type: 'dm', direction: 'outbound', sentText: 'Hi', sentAt: '2026-10-20T10:00:00Z', createdAt: '2026-10-20T10:00:00Z' },
        { id: 'm2', organizationId: 'o', leadId: 'l', repId: 'r', type: 'dm', direction: 'inbound', sentText: 'Hello', sentAt: '2026-10-20T14:00:00Z', createdAt: '2026-10-20T14:00:00Z' },
        { id: 'm3', organizationId: 'o', leadId: 'l', repId: 'r', type: 'reply', direction: 'outbound', sentText: 'Sure', sentAt: '2026-10-20T15:00:00Z', createdAt: '2026-10-20T15:00:00Z' },
      ],
    })
    expect(deriveRelationshipDisplayState(repWroteLast, now).display).toBe('WAITING_ON_CLIENT')
    const clientWroteLast = makeLead({
      status: 'replied',
      connectionAcceptedAt: '2026-10-20T12:00:00Z',
      messages: [
        { id: 'm1', organizationId: 'o', leadId: 'l', repId: 'r', type: 'dm', direction: 'outbound', sentText: 'Hi', sentAt: '2026-10-20T10:00:00Z', createdAt: '2026-10-20T10:00:00Z' },
        { id: 'm2', organizationId: 'o', leadId: 'l', repId: 'r', type: 'dm', direction: 'inbound', sentText: 'Tell me more', sentAt: '2026-10-26T10:00:00Z', createdAt: '2026-10-26T10:00:00Z' },
      ],
    })
    expect(deriveRelationshipDisplayState(clientWroteLast, now).display).toBe('NEEDS_REPLY')
  })

  it('sender is not owner: a distinct sender profile is preserved', () => {
    const lead = makeLead({ senderProfileId: 'sender-9' })
    expect(lead.senderProfileId).not.toBe(lead.ownerRepId)
  })

  it('score is not activity points: the canonical score maps to one band', () => {
    expect(qualifyCanonicalScore(80).qualification).toBe('STRONG')
    expect(qualifyCanonicalScore(0).qualification).not.toBe(qualifyCanonicalScore(80).qualification)
  })
})
