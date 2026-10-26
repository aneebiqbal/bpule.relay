/**
 * REL-QA-002 / REL-QA-005 — one conversation truth (production QA, 26 Oct 2026).
 *
 * Reported: a lead with a visible inbound message, a "Received" history event
 * and 1 turn in Archive still rendered "No conversation thread" / "This lead
 * has no messages yet" on the Overview.
 *
 * Root cause: conversation presence was derived from raw `messages` rows, while
 * the Conversation tab, History and Archive derive the thread from
 * `buildThread(lead)`, which also counts an inbound-first lead's opening message
 * stored on `lead.inboundMessage`. The two definitions disagreed.
 *
 * Fix: one canonical presence contract that reads the same thread the other
 * surfaces read, plus one canonical relationship display contract so no surface
 * reinterprets the internal `replied` phase as "Replied" when the rep owes a
 * reply.
 */
import { describe, expect, it } from 'vitest'
import {
  deriveConversationPresence,
  deriveRelationshipDisplayState,
  RELATIONSHIP_DISPLAY_LABEL,
} from '@/lib/relay/conversation-presence'
import type { LeadDetail } from '@/lib/store/types'
import type { Message } from '@/lib/domain/types'

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
    createdAt: '2026-09-24T10:00:00Z',
    messages: [],
    outcomes: [],
    followupCount: 0,
    ...overrides,
  }
}

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: crypto.randomUUID(),
    organizationId: 'org-1',
    leadId: 'lead-1',
    repId: 'rep-1',
    type: 'dm',
    draftText: null,
    sentText: 'Hello!',
    sentAt: '2026-09-25T10:00:00Z',
    modelUsed: null,
    direction: 'outbound',
    createdAt: '2026-09-25T10:00:00Z',
    ...overrides,
  }
}

describe('REL-QA-002 — conversation presence', () => {
  it('THREAD_WITH_INBOUND: an inbound-first lead with a stored opening message is NOT "no conversation"', () => {
    const lead = makeLead({
      direction: 'inbound',
      inboundMessage: 'We need an external team to rebuild our booking platform.',
      messages: [],
    })
    expect(deriveConversationPresence(lead)).not.toBe('NO_MESSAGES')
  })

  it('the reported scenario: inbound-first presence is UNVERIFIED_THREAD, matching Archive/Conversation', () => {
    const lead = makeLead({
      direction: 'inbound',
      inboundMessage: 'We need an external team to rebuild our booking platform.',
      messages: [],
    })
    expect(deriveConversationPresence(lead)).toBe('UNVERIFIED_THREAD')
  })

  it('NO_THREAD: a lead with no messages and no opening message is NO_MESSAGES', () => {
    const lead = makeLead({ direction: 'outbound', inboundMessage: null, messages: [] })
    expect(deriveConversationPresence(lead)).toBe('NO_MESSAGES')
  })

  it('a verified inbound message row is VERIFIED_THREAD', () => {
    const lead = makeLead({
      direction: 'inbound',
      messages: [makeMessage({ direction: 'inbound', threadStatus: 'VERIFIED' })],
    })
    expect(deriveConversationPresence(lead)).toBe('VERIFIED_THREAD')
  })

  it('an unverified inbound message row is UNVERIFIED_THREAD', () => {
    const lead = makeLead({
      direction: 'inbound',
      messages: [makeMessage({ direction: 'inbound', threadStatus: 'UNVERIFIED' })],
    })
    expect(deriveConversationPresence(lead)).toBe('UNVERIFIED_THREAD')
  })

  it('a dismissed thread is DISMISSED_THREAD', () => {
    const lead = makeLead({
      direction: 'inbound',
      messages: [makeMessage({ direction: 'inbound', threadStatus: 'DISMISSED' })],
    })
    expect(deriveConversationPresence(lead)).toBe('DISMISSED_THREAD')
  })

  it('an outbound-only thread is VERIFIED_THREAD (nothing unverified)', () => {
    const lead = makeLead({ direction: 'outbound', messages: [makeMessage({ direction: 'outbound' })] })
    expect(deriveConversationPresence(lead)).toBe('VERIFIED_THREAD')
  })

  it('a thread flagged for identity review is MISMATCH_REVIEW', () => {
    const lead = makeLead({
      direction: 'inbound',
      inboundMessage: 'Hello',
      messages: [],
    })
    expect(deriveConversationPresence(lead, { mismatch: true })).toBe('MISMATCH_REVIEW')
  })
})

describe('REL-QA-005 — relationship display state', () => {
  const NOW = new Date('2026-09-27T12:00:00Z').getTime()

  it('NEEDS_REPLY: the rep owes a reply, and the label is never "Replied"', () => {
    const lead = makeLead({
      status: 'replied',
      connectionAcceptedAt: '2026-09-26T12:00:00Z',
      messages: [
        makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-26T10:00:00Z' }),
        makeMessage({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-09-26T14:00:00Z' }),
        makeMessage({ type: 'dm', direction: 'inbound', sentText: 'Id be interested...', sentAt: '2026-09-27T08:00:00Z' }),
      ],
    })
    const display = deriveRelationshipDisplayState(lead, NOW)
    expect(display.display).toBe('NEEDS_REPLY')
    expect(display.label).toBe('Needs reply')
    expect(display.label.toLowerCase()).not.toContain('replied')
  })

  it('WAITING_ON_CLIENT: we replied last, so we wait', () => {
    const lead = makeLead({
      status: 'replied',
      connectionAcceptedAt: '2026-09-26T12:00:00Z',
      messages: [
        makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-26T10:00:00Z' }),
        makeMessage({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-09-26T14:00:00Z' }),
        makeMessage({ type: 'dm', direction: 'inbound', sentText: 'Tell me more', sentAt: '2026-09-26T16:00:00Z' }),
        makeMessage({ type: 'reply', sentText: 'Sure! We have...', sentAt: '2026-09-26T17:00:00Z' }),
      ],
    })
    const display = deriveRelationshipDisplayState(lead, NOW)
    expect(display.display).toBe('WAITING_ON_CLIENT')
    expect(display.waitingOn).toBe('client')
  })

  it('FOLLOW_UP_DUE: a quiet lead past the follow-up window', () => {
    const lead = makeLead({
      status: 'contacted',
      connectionAcceptedAt: '2026-09-18T12:00:00Z',
      messages: [
        makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-18T10:00:00Z' }),
        makeMessage({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-09-18T14:00:00Z' }),
      ],
    })
    expect(deriveRelationshipDisplayState(lead, NOW).display).toBe('FOLLOW_UP_DUE')
  })

  it('TO_CONTACT: a new lead with no connection', () => {
    expect(deriveRelationshipDisplayState(makeLead({ status: 'new' }), NOW).display).toBe('TO_CONTACT')
  })

  it('SEND_FIRST_MESSAGE: connection accepted, no DM yet', () => {
    const lead = makeLead({
      status: 'contacted',
      connectionAcceptedAt: '2026-09-26T12:00:00Z',
      messages: [makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-26T10:00:00Z' })],
    })
    expect(deriveRelationshipDisplayState(lead, NOW).display).toBe('SEND_FIRST_MESSAGE')
  })

  it('CONNECTED: a won lead is connected, not merely closed', () => {
    expect(deriveRelationshipDisplayState(makeLead({ status: 'won' }), NOW).display).toBe('CONNECTED')
  })

  it('CLOSED: a lost lead is closed', () => {
    expect(deriveRelationshipDisplayState(makeLead({ status: 'lost' }), NOW).display).toBe('CLOSED')
  })

  it('every display state has a human label and no label is the raw internal phase', () => {
    for (const label of Object.values(RELATIONSHIP_DISPLAY_LABEL)) {
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toBe('replied')
    }
  })
})
