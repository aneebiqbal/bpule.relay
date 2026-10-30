/**
 * Reply-to-lead matching.
 *
 * A reply is matched by the strongest identity available, never by name or
 * subject. Two leads matching at the same strength is a mismatch, not a coin
 * flip — picking one would attach a buyer's reply to the wrong opportunity.
 */
import { describe, expect, it } from 'vitest'
import { decideReplyMatch, normalizeReplyAddress, type LeadMatch } from '@/lib/email/reply-match'

function candidate(overrides: Partial<LeadMatch> = {}): LeadMatch {
  return {
    leadId: 'lead-1',
    contactPointId: 'cp-1',
    confidence: 'ADDRESS_MATCH',
    basis: 'contact_address',
    ...overrides,
  }
}

describe('decideReplyMatch', () => {
  it('matches a single candidate', () => {
    const result = decideReplyMatch([candidate({ leadId: 'lead-1', confidence: 'THREAD', basis: 'provider_thread' })])
    expect(result).toMatchObject({ status: 'MATCHED', leadId: 'lead-1', confidence: 'THREAD' })
  })

  it('returns NO_MATCH when there is no candidate', () => {
    expect(decideReplyMatch([])).toEqual({ status: 'NO_MATCH' })
  })

  it('prefers a stronger identity over a weaker one', () => {
    const result = decideReplyMatch([
      candidate({ leadId: 'weak-lead', confidence: 'ADDRESS_MATCH', basis: 'contact_address' }),
      candidate({ leadId: 'thread-lead', confidence: 'THREAD', basis: 'provider_thread' }),
    ])
    expect(result).toMatchObject({ status: 'MATCHED', leadId: 'thread-lead', confidence: 'THREAD' })
  })

  it('ranks the identity strength in order', () => {
    const ordered: Array<[LeadMatch['confidence'], LeadMatch['confidence']]> = [
      ['THREAD', 'REPLY_REFERENCE'],
      ['REPLY_REFERENCE', 'MAILBOX_RECIPIENT'],
      ['MAILBOX_RECIPIENT', 'ADDRESS_MATCH'],
    ]
    for (const [strong, weak] of ordered) {
      const result = decideReplyMatch([
        candidate({ leadId: 'weak', confidence: weak, basis: 'contact_address' }),
        candidate({ leadId: 'strong', confidence: strong, basis: 'provider_thread' }),
      ])
      expect(result).toMatchObject({ status: 'MATCHED', leadId: 'strong' })
    }
  })

  it('refuses to choose when two different leads match at the same strength', () => {
    const result = decideReplyMatch([
      candidate({ leadId: 'lead-a', confidence: 'THREAD', basis: 'provider_thread' }),
      candidate({ leadId: 'lead-b', confidence: 'THREAD', basis: 'provider_thread' }),
    ])

    expect(result.status).toBe('REVIEW_REQUIRED')
    if (result.status === 'REVIEW_REQUIRED') {
      expect(result.code).toBe('THREAD_MISMATCH_REVIEW_REQUIRED')
      expect(result.candidates).toHaveLength(2)
    }
  })

  it('is not a mismatch when the same lead matches through two routes', () => {
    const result = decideReplyMatch([
      candidate({ leadId: 'lead-1', confidence: 'THREAD', basis: 'provider_thread' }),
      candidate({ leadId: 'lead-1', confidence: 'THREAD', basis: 'provider_thread', contactPointId: 'cp-2' }),
    ])
    expect(result).toMatchObject({ status: 'MATCHED', leadId: 'lead-1' })
  })

  it('does not fall back to a weaker match when the strongest is ambiguous', () => {
    // Two leads at THREAD strength must not be "resolved" by picking a third
    // lead that matched only by address.
    const result = decideReplyMatch([
      candidate({ leadId: 'lead-a', confidence: 'THREAD', basis: 'provider_thread' }),
      candidate({ leadId: 'lead-b', confidence: 'THREAD', basis: 'provider_thread' }),
      candidate({ leadId: 'lead-c', confidence: 'ADDRESS_MATCH', basis: 'contact_address' }),
    ])
    expect(result.status).toBe('REVIEW_REQUIRED')
  })
})

describe('normalizeReplyAddress', () => {
  it('extracts the address from a display-name form', () => {
    expect(normalizeReplyAddress('Sara Ahmed <sara@acme.com>')).toBe('sara@acme.com')
  })

  it('lowercases and trims a bare address', () => {
    expect(normalizeReplyAddress('  Sara@ACME.com ')).toBe('sara@acme.com')
  })

  it('returns null for a value with no address', () => {
    expect(normalizeReplyAddress('Sara Ahmed')).toBeNull()
    expect(normalizeReplyAddress('not-an-email')).toBeNull()
    expect(normalizeReplyAddress(null)).toBeNull()
    expect(normalizeReplyAddress('')).toBeNull()
  })
})
