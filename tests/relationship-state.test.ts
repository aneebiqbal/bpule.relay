import { describe, expect, it } from 'vitest'
import { computeRelationshipState } from '@/lib/relay/relationship-state'
import type { LeadDetail } from '@/lib/store/types'
import type { Message, Outcome } from '@/lib/domain/types'

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

function makeOutcome(overrides: Partial<Outcome>): Outcome {
  return {
    id: crypto.randomUUID(),
    organizationId: 'org-1',
    leadId: 'lead-1',
    stage: 'replied',
    occurredAt: '2026-09-26T10:00:00Z',
    ...overrides,
  }
}

describe('computeRelationshipState', () => {
  const NOW = new Date('2026-09-27T12:00:00Z').getTime()

  it('shows connection_due when lead is new with no messages', () => {
    const lead = makeLead({ status: 'new' })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('your_move')
    expect(state.phase).toBe('connection_due')
    expect(state.primaryCta).toBe('Prepare Connection')
  })

  it('shows connection_sent when connection note sent but not accepted', () => {
    const lead = makeLead({
      status: 'contacted',
      messages: [makeMessage({ type: 'connection', sentText: 'Hi Sarah!', sentAt: '2026-09-26T10:00:00Z' })],
      lockedUntil: '2026-09-26T16:00:00Z',
      lockedReason: 'connection_note_sent',
    })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('their_move')
    expect(state.phase).toBe('connection_sent')
    expect(state.waitingOn).toBe('connection')
    expect(state.primaryCta).toBe('Mark Accepted')
  })

  it('shows connection_accepted when accepted but no DM sent', () => {
    const lead = makeLead({
      status: 'contacted',
      connectionAcceptedAt: '2026-09-26T12:00:00Z',
      messages: [makeMessage({ type: 'connection', sentText: 'Hi Sarah!', sentAt: '2026-09-26T10:00:00Z' })],
    })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('your_move')
    expect(state.phase).toBe('connection_accepted')
    expect(state.primaryCta).toBe('Prepare DM')
  })

  it('shows dm_sent when DM sent recently but no reply (follow-up not yet due)', () => {
    const lead = makeLead({
      status: 'contacted',
      connectionAcceptedAt: '2026-09-26T12:00:00Z',
      messages: [
        makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-26T10:00:00Z' }),
        makeMessage({ type: 'dm', sentText: 'Hey Sarah, noticed...', sentAt: '2026-09-26T14:00:00Z' }),
      ],
    })
    // NOW is Sep 27, DM was sent Sep 26 — only 1 business day ago, follow-up not due
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('their_move')
    expect(state.phase).toBe('dm_sent')
    expect(state.waitingOn).toBe('client')
    expect(state.primaryCta).toBe('Paste Client Reply')
  })

  it('shows replied when client replied and no reply sent', () => {
    const lead = makeLead({
      status: 'contacted',
      connectionAcceptedAt: '2026-09-26T12:00:00Z',
      messages: [
        makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-26T10:00:00Z' }),
        makeMessage({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-09-26T14:00:00Z' }),
        makeMessage({ type: 'dm', direction: 'inbound', sentText: 'Id be interested...', sentAt: '2026-09-27T08:00:00Z' }),
      ],
    })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('your_move')
    expect(state.phase).toBe('replied')
    expect(state.primaryCta).toBe('Prepare Reply')
    expect(state.lastClientMessage?.sentText).toBe('Id be interested...')
  })

  it('shows conversation when we replied and waiting', () => {
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
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('their_move')
    expect(state.phase).toBe('conversation')
    expect(state.waitingOn).toBe('client')
  })

  it('shows won when lead status is won', () => {
    const lead = makeLead({ status: 'won' })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('won')
    expect(state.phase).toBe('won')
    expect(state.primaryCta).toBe('')
  })

  it('shows lost when lead status is lost', () => {
    const lead = makeLead({ status: 'lost' })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('lost')
    expect(state.phase).toBe('lost')
    expect(state.primaryCta).toBe('')
  })

  it('shows follow_up_due when 5 business days passed and no follow-up sent', () => {
    // DM sent Sep 18 (Thu), NOW is Sep 27 (Sun)
    // Business days: Fri 19, Mon 22, Tue 23, Wed 24, Thu 25 = 5 business days
    const lead = makeLead({
      status: 'contacted',
      connectionAcceptedAt: '2026-09-18T12:00:00Z',
      messages: [
        makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-18T10:00:00Z' }),
        makeMessage({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-09-18T14:00:00Z' }),
      ],
      followupCount: 0,
    })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('your_move')
    expect(state.phase).toBe('follow_up_due')
    expect(state.primaryCta).toBe('Prepare Follow-Up')
  })

  it('never recommends DM before connection acceptance', () => {
    const lead = makeLead({
      status: 'contacted',
      messages: [makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-26T10:00:00Z' })],
    })
    const state = computeRelationshipState(lead, NOW)
    expect(state.phase).not.toBe('dm_due')
    expect(state.primaryCta).not.toBe('Prepare DM')
  })

  it('inbound reply does not count as outbound reply sent', () => {
    // recordProspectReply creates a message with type=reply, direction=inbound
    // This should NOT count as "reply sent" — the rep still needs to reply
    const lead = makeLead({
      status: 'replied',
      messages: [
        makeMessage({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-09-24T14:00:00Z' }),
        makeMessage({ type: 'reply', direction: 'inbound', sentText: 'Tell me more', sentAt: '2026-09-25T08:00:00Z' }),
      ],
    })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('your_move')
    expect(state.phase).toBe('replied')
  })

  it('outbound reply counts as reply sent', () => {
    const lead = makeLead({
      status: 'replied',
      messages: [
        makeMessage({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-09-24T14:00:00Z' }),
        makeMessage({ type: 'reply', direction: 'inbound', sentText: 'Tell me more', sentAt: '2026-09-25T08:00:00Z' }),
        makeMessage({ type: 'reply', direction: 'outbound', sentText: 'Sure! Here is...', sentAt: '2026-09-25T09:00:00Z' }),
      ],
    })
    const state = computeRelationshipState(lead, NOW)
    expect(state.kind).toBe('their_move')
    expect(state.phase).toBe('conversation')
  })

  it('reply overrides follow-up (reply wins)', () => {
    const lead = makeLead({
      status: 'contacted',
      connectionAcceptedAt: '2026-09-24T12:00:00Z',
      messages: [
        makeMessage({ type: 'connection', sentText: 'Hi!', sentAt: '2026-09-24T10:00:00Z' }),
        makeMessage({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-09-24T14:00:00Z' }),
        makeMessage({ type: 'dm', direction: 'inbound', sentText: 'Interested!', sentAt: '2026-09-25T08:00:00Z' }),
      ],
      followupCount: 0,
    })
    const state = computeRelationshipState(lead, NOW)
    // Reply takes priority over follow-up
    expect(state.phase).toBe('replied')
    expect(state.primaryCta).toBe('Prepare Reply')
  })
})
