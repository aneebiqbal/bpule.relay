/**
 * THE lead operating-state authority.
 *
 * Three questions, three answers, one function. These contracts pin the
 * separation the UI depends on: a lead can be "Contacted" (sales stage) while
 * "Waiting on client" (conversation) and "Needs profile" (execution).
 */
import { describe, expect, it } from 'vitest'
import { deriveLeadOperatingState, type DeriveLeadOperatingStateInput } from '@/lib/leads/lead-operating-state'

const BASE = {
  status: 'contacted' as const,
  archived: false,
  direction: 'outbound' as const,
  verdict: 'send' as const,
  connectionAcceptedAt: null,
  senderProfileId: 'profile-1',
  revenueIdentityId: 'identity-1',
  source: 'linkedin' as const,
  lastOutboundAt: '2026-01-01T00:00:00.000Z',
  lastInboundAt: null,
  followupCount: 0,
}

function derive(overrides: Partial<DeriveLeadOperatingStateInput> = {}) {
  const { lead, ...rest } = overrides
  return deriveLeadOperatingState({ lead: { ...BASE, ...lead }, ...rest })
}

describe('SALES_STAGE_IS_EXPLICIT_EVIDENCE_ONLY', () => {
  it('won does not depend on conversation state', () => {
    expect(derive({ lead: { status: 'won' } }).salesStage).toBe('won')
  })

  it('a score or elapsed time never implies a later stage', () => {
    // §16: no Proposal/Meeting/Won from score or time.
    const old = derive({ lead: { lastOutboundAt: '2025-01-01T00:00:00.000Z' } })
    expect(old.salesStage).toBe('contacted')
  })

  it('meeting and proposal come only from the conversation stage', () => {
    expect(derive({ conversationStage: 'meeting' }).salesStage).toBe('meeting')
    expect(derive({ conversationStage: 'proposal' }).salesStage).toBe('proposal')
    expect(derive({ conversationStage: 'negotiation' }).salesStage).toBe('proposal')
  })

  it('a plain replied status is the replied stage', () => {
    expect(derive({ lead: { status: 'replied' } }).salesStage).toBe('replied')
  })

  it('lost and the legacy junk statuses are the lost stage', () => {
    expect(derive({ lead: { status: 'lost' } }).salesStage).toBe('lost')
    expect(derive({ lead: { status: 'no' } }).salesStage).toBe('lost')
    expect(derive({ lead: { status: 'dead' } }).salesStage).toBe('lost')
  })
})

describe('CONVERSATION_STATE_IS_SEPARATE_FROM_STAGE', () => {
  it('a contacted lead with no reply is waiting on the client', () => {
    const s = derive()
    expect(s.salesStage).toBe('contacted')
    expect(s.conversationState).toBe('waiting_on_client')
  })

  it('an inbound message after our outbound needs a reply', () => {
    const s = derive({
      lead: { lastOutboundAt: '2026-01-01T00:00:00.000Z', lastInboundAt: '2026-01-02T00:00:00.000Z' },
    })
    expect(s.conversationState).toBe('needs_reply')
    expect(s.nextAction).toBe('reply')
  })

  it('the canonical queue state wins when supplied', () => {
    expect(derive({ queueState: 'waiting_on_rep' }).conversationState).toBe('needs_reply')
    expect(derive({ queueState: 'follow_up_due' }).conversationState).toBe('follow_up_due')
  })

  it('a closed deal has no active conversation', () => {
    expect(derive({ lead: { status: 'won' } }).conversationState).toBe('no_active_conversation')
  })
})

describe('EXECUTION_STATE_FOLLOWS_ATTRIBUTION', () => {
  it('no channel identity means needs profile, not active', () => {
    const s = derive({ lead: { revenueIdentityId: null } })
    expect(s.executionState).toBe('needs_profile')
    expect(s.needsProfile).toBe(true)
    expect(s.nextAction).toBe('assign_profile')
  })

  it('an archived lead is archived regardless of identity', () => {
    const s = derive({ lead: { archived: true } })
    expect(s.executionState).toBe('archived')
    expect(s.nextAction).toBe('none')
  })

  it('a lead with an identity is active', () => {
    expect(derive().executionState).toBe('active')
  })
})

describe('ATTRIBUTION_AND_RESPONSIBILITY', () => {
  it('the identity and the profile are reported separately', () => {
    const s = derive({
      attribution: {
        profileId: 'p1', profileName: 'Fizza', profileChannel: 'linkedin',
        identityId: 'i1', identityName: 'Fizza · LinkedIn', identityChannel: 'linkedin',
      },
    })
    expect(s.attribution.profileId).toBe('p1')
    expect(s.attribution.identityId).toBe('i1')
    expect(s.attribution.identityName).toBe('Fizza · LinkedIn')
  })

  it('the current operator is derived, never stored on the lead', () => {
    const s = derive({
      responsibility: {
        primaryRepId: 'r1', primaryName: 'Hassan',
        operatorRepIds: ['r1', 'r2'], operatorNames: ['Hassan', 'Ahmad'],
      },
    })
    expect(s.responsibility.operatorNames).toEqual(['Hassan', 'Ahmad'])
    expect(s.workingNow).toBe('Hassan · Ahmad')
  })

  it('the header summary carries all three states', () => {
    const s = derive()
    expect(s.summary).toBe('Stage: Contacted · Waiting on client · Active')
  })
})
