import { describe, expect, it } from 'vitest'
import { evaluateDmGate, evaluateFollowupGate, formatCooldownRemaining, FOLLOWUP_COOLDOWN_MS } from '@/lib/relay/message-eligibility'
import type { Message } from '@/lib/domain/types'

function msg(overrides: Partial<Message> & Pick<Message, 'type'>): Pick<Message, 'type' | 'sentText' | 'sentAt'> {
  return { sentText: 'hi', sentAt: '2026-01-01T00:00:00.000Z', ...overrides }
}

describe('evaluateDmGate', () => {
  it('does not block DM when no connection note was ever sent (Upwork/email/DM-first leads)', () => {
    const result = evaluateDmGate({ messages: [], connectionAcceptedAt: null })
    expect(result.connectionNoteSent).toBe(false)
    expect(result.blocked).toBe(false)
  })

  it('blocks DM when a connection note was sent but not yet accepted', () => {
    const result = evaluateDmGate({
      messages: [msg({ type: 'connection' })],
      connectionAcceptedAt: null,
    })
    expect(result.connectionNoteSent).toBe(true)
    expect(result.connectionAccepted).toBe(false)
    expect(result.blocked).toBe(true)
  })

  it('does not block DM once connectionAcceptedAt is set', () => {
    const result = evaluateDmGate({
      messages: [msg({ type: 'connection' })],
      connectionAcceptedAt: '2026-01-01T01:00:00.000Z',
    })
    expect(result.blocked).toBe(false)
  })

  it('ignores an un-sent (draft-only) connection message — sentText/sentAt must both be present', () => {
    const result = evaluateDmGate({
      messages: [{ type: 'connection', sentText: null, sentAt: null }],
      connectionAcceptedAt: null,
    })
    expect(result.connectionNoteSent).toBe(false)
    expect(result.blocked).toBe(false)
  })
})

describe('evaluateFollowupGate', () => {
  const T0 = new Date('2026-01-01T00:00:00.000Z').getTime()

  it('is not eligible before any message has been sent', () => {
    const result = evaluateFollowupGate({ status: 'new', messages: [], now: T0 })
    expect(result.hasPriorSend).toBe(false)
    expect(result.eligible).toBe(false)
  })

  it('is not eligible immediately after a DM (inside the 6h cooldown)', () => {
    const result = evaluateFollowupGate({
      status: 'contacted',
      messages: [msg({ type: 'dm', sentAt: new Date(T0 - 60_000).toISOString() })], // 1 minute ago
      now: T0,
    })
    expect(result.inCooldown).toBe(true)
    expect(result.eligible).toBe(false)
    expect(result.cooldownRemainingMs).toBeGreaterThan(0)
    expect(result.cooldownRemainingMs).toBeLessThanOrEqual(FOLLOWUP_COOLDOWN_MS)
  })

  it('is eligible exactly once 6 hours have passed since the last DM', () => {
    const result = evaluateFollowupGate({
      status: 'contacted',
      messages: [msg({ type: 'dm', sentAt: new Date(T0 - FOLLOWUP_COOLDOWN_MS - 1000).toISOString() })],
      now: T0,
    })
    expect(result.inCooldown).toBe(false)
    expect(result.eligible).toBe(true)
  })

  it('uses the MOST RECENT dm when several exist, not the first', () => {
    const result = evaluateFollowupGate({
      status: 'contacted',
      messages: [
        msg({ type: 'dm', sentAt: new Date(T0 - FOLLOWUP_COOLDOWN_MS - 1000).toISOString() }), // old enough
        msg({ type: 'dm', sentAt: new Date(T0 - 60_000).toISOString() }), // 1 minute ago — this one governs
      ],
      now: T0,
    })
    expect(result.inCooldown).toBe(true)
    expect(result.eligible).toBe(false)
  })

  it('is never eligible once already used (one follow-up, ever) even outside cooldown', () => {
    const result = evaluateFollowupGate({
      status: 'followed_up',
      messages: [
        msg({ type: 'dm', sentAt: new Date(T0 - FOLLOWUP_COOLDOWN_MS - 1000).toISOString() }),
        msg({ type: 'followup', sentAt: new Date(T0 - 1000).toISOString() }),
      ],
      now: T0,
    })
    expect(result.alreadyUsed).toBe(true)
    expect(result.eligible).toBe(false)
  })

  it('a connection-only send (no dm yet) has no cooldown to wait out', () => {
    const result = evaluateFollowupGate({
      status: 'contacted',
      messages: [msg({ type: 'connection', sentAt: new Date(T0 - 1000).toISOString() })],
      now: T0,
    })
    expect(result.inCooldown).toBe(false)
    expect(result.hasPriorSend).toBe(true)
    expect(result.eligible).toBe(true)
  })
})

describe('formatCooldownRemaining', () => {
  it.each([
    [0, '0m'],
    [59_000, '1m'],
    [60_000, '1m'],
    [3_600_000, '1h'],
    [3_660_000, '1h 1m'],
    [21_600_000, '6h'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatCooldownRemaining(ms)).toBe(expected)
  })
})
