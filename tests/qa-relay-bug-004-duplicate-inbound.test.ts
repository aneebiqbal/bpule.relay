/**
 * BUG-004 — duplicate conversation message (INITIAL_INBOUND_ALREADY_CANONICAL).
 *
 * Canonical message rows own the timeline. The lead-level opening message is a
 * fallback, rendered only when no canonical row represents it. A repeated
 * message with the same text is still two messages — the identity is
 * structural, never textual.
 */

import { describe, expect, it } from 'vitest'
import { buildThread } from '@/lib/conversation/thread'
import {
  hasCanonicalOpeningMessage,
  inboundFirstMessageKey,
  isInboundFirstMessage,
} from '@/lib/conversation/canonical-message'
import type { LeadDetail } from '@/lib/store/types'

const OPENING = 'We need an external team to rebuild our booking platform. Budget approved: $45,000.'

function lead(overrides: Partial<LeadDetail> = {}): LeadDetail {
  return {
    id: 'lead_1',
    direction: 'inbound',
    inboundMessage: OPENING,
    createdAt: '2026-10-01T09:00:00.000Z',
    messages: [],
    ...overrides,
  } as LeadDetail
}

describe('BUG-004 INITIAL_INBOUND_ALREADY_CANONICAL', () => {
  it('renders the opening once when a canonical row already represents it', () => {
    const thread = buildThread(lead({
      messages: [
        {
          id: 'msg_opening',
          organizationId: 'org_1',
          leadId: 'lead_1',
          repId: 'rep_1',
          type: 'reply',
          draftText: null,
          sentText: OPENING,
          sentAt: '2026-10-01T09:00:00.000Z',
          modelUsed: 'inbound_lead',
          idempotencyKey: inboundFirstMessageKey('lead_1'),
          direction: 'inbound',
          createdAt: '2026-10-01T09:00:00.000Z',
        },
      ],
    }))

    const openingTurns = thread.filter((t) => t.text === OPENING)
    expect(openingTurns).toHaveLength(1)
    expect(thread).toHaveLength(1)
  })

  it('renders the fallback when no canonical row exists (legacy leads)', () => {
    const thread = buildThread(lead())
    expect(thread).toHaveLength(1)
    expect(thread[0].kind).toBe('inbound_first')
    expect(thread[0].text).toBe(OPENING)
  })

  it('keeps two messages when the human genuinely sends the same text twice', () => {
    const thread = buildThread(lead({
      inboundMessage: null,
      messages: [
        {
          id: 'msg_a',
          organizationId: 'org_1',
          leadId: 'lead_1',
          repId: null,
          type: 'reply',
          draftText: null,
          sentText: 'Can you share a similar case study?',
          sentAt: '2026-10-02T09:00:00.000Z',
          modelUsed: null,
          direction: 'inbound',
          createdAt: '2026-10-02T09:00:00.000Z',
        },
        {
          id: 'msg_b',
          organizationId: 'org_1',
          leadId: 'lead_1',
          repId: null,
          type: 'reply',
          draftText: null,
          sentText: 'Can you share a similar case study?',
          sentAt: '2026-10-03T09:00:00.000Z',
          modelUsed: null,
          direction: 'inbound',
          createdAt: '2026-10-03T09:00:00.000Z',
        },
      ],
    }))

    // Same text, two distinct sends: both remain. No text-only dedupe.
    expect(thread).toHaveLength(2)
  })

  it('does not treat an unrelated inbound reply as the opening', () => {
    const thread = buildThread(lead({
      messages: [
        {
          id: 'msg_reply',
          organizationId: 'org_1',
          leadId: 'lead_1',
          repId: null,
          type: 'reply',
          draftText: null,
          sentText: 'Thanks — sending over the brief now.',
          sentAt: '2026-10-02T09:00:00.000Z',
          modelUsed: null,
          direction: 'inbound',
          createdAt: '2026-10-02T09:00:00.000Z',
        },
      ],
    }))

    // The reply is not the opening, so the fallback still renders it.
    expect(thread).toHaveLength(2)
    expect(thread[0].text).toBe(OPENING)
  })
})

describe('canonical message identity', () => {
  it('derives a deterministic key from the lead', () => {
    expect(inboundFirstMessageKey('lead_1')).toBe('inbound_first:lead_1')
    expect(inboundFirstMessageKey('lead_1')).toBe(inboundFirstMessageKey('lead_1'))
  })

  it('recognises the opening row by its key, not its text', () => {
    expect(isInboundFirstMessage({ idempotencyKey: inboundFirstMessageKey('lead_1') })).toBe(true)
    expect(isInboundFirstMessage({ idempotencyKey: 'lead_1:reply:1:2:0' })).toBe(false)
    expect(isInboundFirstMessage({ idempotencyKey: null })).toBe(false)
  })

  it('detects whether a canonical opening row exists', () => {
    expect(hasCanonicalOpeningMessage([], 'lead_1')).toBe(false)
    expect(hasCanonicalOpeningMessage([{ idempotencyKey: inboundFirstMessageKey('lead_1') }], 'lead_1')).toBe(true)
    expect(hasCanonicalOpeningMessage([{ idempotencyKey: inboundFirstMessageKey('lead_2') }], 'lead_1')).toBe(false)
  })
})
