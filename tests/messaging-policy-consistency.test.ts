import { describe, expect, it } from 'vitest'
import {
  deriveMessagingPolicy,
  describeMessagingPolicy,
  type ContactDecision,
} from '@/lib/relay/revenue-strategy'

/**
 * Regression coverage for the cross-surface messaging-policy contradiction
 * found on the Daria Redkina / Solsonic fixture: Lead Intelligence showed
 * "CONNECT OR OBSERVE / Send a short connection note" while Lead Detail
 * showed "No message — Change is not an invitation. Connect or observe; do
 * not force a DM." for the SAME lead.
 *
 * Root cause: both were individually correct — the strategy engine was
 * evaluated for two different channels (connection vs dm) — but the same
 * bare ContactAction ('CONNECT_OR_OBSERVE') was displayed on both surfaces
 * with no indication they answered different questions. deriveMessagingPolicy
 * makes the channel explicit in the returned value itself, so two policies
 * for two different channels on the same lead can never be read as
 * contradictory verdicts about "the" action.
 */
function contact(overrides: Partial<ContactDecision> = {}): ContactDecision {
  return {
    reason: 'RELEVANT_CHANGE',
    action: 'CONNECT_OR_OBSERVE',
    why: 'A relevant change exists, but they have not asked for help.',
    messageRecommended: true,
    noMessageReason: null,
    ...overrides,
  }
}

describe('deriveMessagingPolicy — one canonical policy per channel, never ambiguous', () => {
  it('the Daria Redkina case: RELEVANT_CHANGE resolves to different, individually-correct, self-describing policies for connection vs dm — not a bare shared CONNECT_OR_OBSERVE', () => {
    const connectionContact = contact({ messageRecommended: true, noMessageReason: null })
    const dmContact = contact({
      messageRecommended: false,
      noMessageReason: 'Change is not an invitation. Connect or observe; do not force a DM.',
    })

    const connectionPolicy = deriveMessagingPolicy(connectionContact, 'connection')
    const dmPolicy = deriveMessagingPolicy(dmContact, 'dm')

    expect(connectionPolicy).toBe('CONNECT_WITH_NOTE')
    expect(dmPolicy).toBe('OBSERVE')
    // The two values are self-describing and distinct — no surface reading
    // either one needs to know "which channel was this computed for" from
    // context; it's encoded in the value itself.
    expect(connectionPolicy).not.toBe(dmPolicy)
    expect(describeMessagingPolicy(connectionPolicy)).toMatch(/connection note/i)
    expect(describeMessagingPolicy(dmPolicy)).not.toMatch(/dm|direct message/i)
  })

  it('SKIP and RESEARCH_MORE are channel-independent — same policy regardless of channel', () => {
    const skip = contact({ action: 'SKIP', messageRecommended: false, reason: 'NO_CREDIBLE_REASON' })
    const research = contact({ action: 'RESEARCH_MORE', messageRecommended: false, reason: 'NO_CREDIBLE_REASON' })

    for (const channel of ['connection', 'dm', 'email', 'upwork', 'followup'] as const) {
      expect(deriveMessagingPolicy(skip, channel)).toBe('SKIP')
      expect(deriveMessagingPolicy(research, channel)).toBe('RESEARCH_MORE')
    }
  })

  it('reply channel always resolves to REPLY when not skipped/research', () => {
    const replyContact = contact({ reason: 'RELATIONSHIP_CONTEXT', action: 'CONTACT_NOW', messageRecommended: true })
    expect(deriveMessagingPolicy(replyContact, 'reply')).toBe('REPLY')
  })

  it('email channel maps messageRecommended to EMAIL vs OBSERVE, never a bare "message"/"no message" ambiguity', () => {
    const yes = contact({ messageRecommended: true })
    const no = contact({ messageRecommended: false })
    expect(deriveMessagingPolicy(yes, 'email')).toBe('EMAIL')
    expect(deriveMessagingPolicy(no, 'email')).toBe('OBSERVE')
  })

  it('upwork and followup channels resolve to their own distinct policies, not shared with connection/dm', () => {
    const yes = contact({ messageRecommended: true })
    expect(deriveMessagingPolicy(yes, 'upwork')).toBe('UPWORK_PROPOSAL')
    expect(deriveMessagingPolicy(yes, 'followup')).toBe('FOLLOW_UP')
    expect(deriveMessagingPolicy(yes, 'connection')).toBe('CONNECT_WITH_NOTE')
    expect(deriveMessagingPolicy(yes, 'dm')).toBe('DM')
  })

  it('every MessagingPolicy value has a non-empty, channel-appropriate label (no silent fallthrough)', () => {
    const policies = [
      'CONNECT_WITH_NOTE', 'CONNECT_WITHOUT_NOTE', 'OBSERVE', 'DM', 'EMAIL',
      'UPWORK_PROPOSAL', 'FOLLOW_UP', 'REPLY', 'RESEARCH_MORE', 'SKIP',
    ] as const
    for (const p of policies) {
      const label = describeMessagingPolicy(p)
      expect(label).toBeTruthy()
      expect(label.length).toBeGreaterThan(5)
    }
  })

  it('is a pure function of (contact, channel) — same inputs always produce the same policy', () => {
    const c = contact()
    const run1 = deriveMessagingPolicy(c, 'connection')
    const run2 = deriveMessagingPolicy(c, 'connection')
    expect(run1).toBe(run2)
  })
})
