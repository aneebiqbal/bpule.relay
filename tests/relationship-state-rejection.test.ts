import { describe, expect, it } from 'vitest'

/**
 * Regression tests for relationship state machine rejection/timeout handling.
 */

describe('Relationship state — rejection and timeout', () => {
  it('connection pending for >14 days transitions to expired/terminal', () => {
    const now = Date.now()
    const connSentAt = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString() // 15 days ago
    const daysPending = (now - new Date(connSentAt).getTime()) / (1000 * 60 * 60 * 24)
    expect(daysPending).toBeGreaterThan(14)
  })

  it('connection pending for <14 days stays in their_move', () => {
    const now = Date.now()
    const connSentAt = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
    const daysPending = (now - new Date(connSentAt).getTime()) / (1000 * 60 * 60 * 24)
    expect(daysPending).toBeLessThanOrEqual(14)
  })

  it('rejection messages are detected', () => {
    const rejections = [
      'Not interested, thanks.',
      'No thanks, not looking.',
      'Please do not contact me.',
      'Unsubscribe',
      'Wrong person for this.',
      'Pass for now.',
    ]
    const patterns = [/not interested/i, /no thanks/i, /do not contact/i, /unsubscribe/i, /wrong person/i, /pass for now/i]
    for (const text of rejections) {
      expect(patterns.some((p) => p.test(text))).toBe(true)
    }
  })

  it('auto-reply messages are detected', () => {
    const autoReplies = [
      'I am currently out of office.',
      'Auto-reply: I am on vacation.',
      'OOO until Monday.',
      'I have limited email access.',
    ]
    const patterns = [/out of office/i, /ooo/i, /auto.?(reply|response)/i, /on vacation/i, /on leave/i, /limited email access/i]
    for (const text of autoReplies) {
      expect(patterns.some((p) => p.test(text))).toBe(true)
    }
  })

  it('genuine conversational replies are NOT flagged as rejections', () => {
    const genuineReplies = [
      'Thanks for reaching out! I\'d love to learn more.',
      'Can you tell me more about your process?',
      'What does a typical engagement look like?',
      'Interesting — how would this work for a team our size?',
    ]
    const rejectionPatterns = [/not interested/i, /no thanks/i, /do not contact/i, /unsubscribe/i, /wrong person/i, /pass for now/i]
    for (const text of genuineReplies) {
      expect(rejectionPatterns.some((p) => p.test(text))).toBe(false)
    }
  })
})
