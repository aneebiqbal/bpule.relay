/**
 * Cross-surface parity (production QA, 26 Oct 2026).
 *
 * The same lead must not read differently on Today, Leads, Conversation,
 * Archive, My Numbers and the follow-up surfaces. This asserts parity for the
 * canonical states without a browser: score, qualification, action, pipeline
 * stage, relationship display, conversation presence and the thread.
 */
import { describe, expect, it } from 'vitest'
import { buildLeadParityReport } from '@/lib/relay/lead-parity'
import type { LeadDetail } from '@/lib/store/types'
import type { Message } from '@/lib/domain/types'

const NOW = new Date('2026-10-26T12:00:00Z').getTime()

function makeLead(overrides: Partial<LeadDetail> = {}): LeadDetail {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    company: 'Acme',
    companyKey: 'acme',
    contactName: 'Sarah',
    contactTitle: 'VP Engineering',
    url: 'https://linkedin.com/in/sarah',
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

function msg(overrides: Partial<Message>): Message {
  return {
    id: crypto.randomUUID(),
    organizationId: 'org-1',
    leadId: 'lead-1',
    repId: 'rep-1',
    type: 'dm',
    draftText: null,
    sentText: 'Hello!',
    sentAt: '2026-10-21T10:00:00Z',
    modelUsed: null,
    direction: 'outbound',
    createdAt: '2026-10-21T10:00:00Z',
    ...overrides,
  }
}

describe('cross-surface parity', () => {
  it('NADIA_EXPLICIT_BUYER: an unscored-contact lead is consistent', () => {
    const report = buildLeadParityReport(makeLead({ canonicalScore: 80 }), NOW)
    expect(report.consistent).toBe(true)
    expect(report.divergences).toEqual([])
    expect(report.displayText).toBe('8/10')
    expect(report.qualification).toBe('STRONG')
  })

  it('THREAD_WITH_INBOUND: an inbound-first lead is never "to contact" and never "no conversation"', () => {
    const report = buildLeadParityReport(
      makeLead({
        direction: 'inbound',
        inboundMessage: 'We need an external team to rebuild our booking platform.',
        messages: [],
      }),
      NOW,
    )
    expect(report.consistent).toBe(true)
    expect(report.pipelineStage).toBe('needs_reply')
    expect(report.relationshipDisplay).toBe('NEEDS_REPLY')
    expect(report.conversationPresence).not.toBe('NO_MESSAGES')
    expect(report.threadTurnCount).toBe(1)
  })

  it('NO_THREAD: a lead with nothing is NO_MESSAGES and To Contact', () => {
    const report = buildLeadParityReport(makeLead({ direction: 'outbound', canonicalScore: null, score: null }), NOW)
    expect(report.consistent).toBe(true)
    expect(report.conversationPresence).toBe('NO_MESSAGES')
    expect(report.displayText).toBe('—')
    expect(report.pipelineStage).toBe('to_contact')
  })

  it('REPLIED_NEEDS_REPLY: the rep owes a reply and both surfaces say so', () => {
    const report = buildLeadParityReport(
      makeLead({
        status: 'replied',
        connectionAcceptedAt: '2026-10-20T12:00:00Z',
        messages: [
          msg({ type: 'connection', sentText: 'Hi!', sentAt: '2026-10-20T10:00:00Z' }),
          msg({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-10-20T14:00:00Z' }),
          msg({ type: 'dm', direction: 'inbound', sentText: 'Tell me more', sentAt: '2026-10-25T09:00:00Z' }),
        ],
      }),
      NOW,
    )
    expect(report.consistent).toBe(true)
    expect(report.relationshipDisplay).toBe('NEEDS_REPLY')
    expect(report.relationshipLabel).toBe('Needs reply')
    expect(report.pipelineStage).toBe('needs_reply')
  })

  it('WAITING_ON_CLIENT: we replied last, so both surfaces wait', () => {
    const report = buildLeadParityReport(
      makeLead({
        status: 'contacted',
        connectionAcceptedAt: '2026-10-20T12:00:00Z',
        messages: [
          msg({ type: 'connection', sentText: 'Hi!', sentAt: '2026-10-20T10:00:00Z' }),
          msg({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-10-20T14:00:00Z' }),
          msg({ type: 'dm', direction: 'inbound', sentText: 'Tell me more', sentAt: '2026-10-25T16:00:00Z' }),
          msg({ type: 'reply', sentText: 'Sure! We have...', sentAt: '2026-10-26T09:00:00Z' }),
        ],
      }),
      NOW,
    )
    expect(report.consistent).toBe(true)
    expect(report.relationshipDisplay).toBe('WAITING_ON_CLIENT')
    expect(report.pipelineStage).toBe('waiting')
  })

  it('FOLLOW_UP_DUE: a quiet lead past the window is a follow-up on both surfaces', () => {
    const report = buildLeadParityReport(
      makeLead({
        status: 'contacted',
        connectionAcceptedAt: '2026-10-01T12:00:00Z',
        messages: [
          msg({ type: 'connection', sentText: 'Hi!', sentAt: '2026-10-01T10:00:00Z' }),
          msg({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-10-01T14:00:00Z' }),
        ],
      }),
      NOW,
    )
    expect(report.consistent).toBe(true)
    expect(report.relationshipDisplay).toBe('FOLLOW_UP_DUE')
    expect(report.pipelineStage).toBe('follow_up_due')
  })

  it('CLOSED_OPPORTUNITY: a won lead is connected on both surfaces', () => {
    const report = buildLeadParityReport(makeLead({ status: 'won' }), NOW)
    expect(report.consistent).toBe(true)
    expect(report.relationshipDisplay).toBe('CONNECTED')
    expect(report.pipelineStage).toBe('done')
  })

  it('STALE_SCORE: a stale qualification is reported, not hidden', () => {
    const report = buildLeadParityReport(
      makeLead({ canonicalScore: 80, displayQualification: 'low', displayIntelligenceVersion: 'relay_decision_v1' }),
      NOW,
    )
    // The band still wins for display; the report names the qualification.
    expect(report.qualification).toBe('STRONG')
  })
})
