/**
 * Relay — Sprint A (Safety) regression guards.
 *
 * 1. Terminal conversation authority: opt-out and closure phrases classify as
 *    terminal, and the terminal state blocks outreach everywhere.
 * 2. Sender attribution: every logged message persists the lead's sender.
 * 3. Fabrication blocker: a draft with an unsupported (including lowercase)
 *    claim or a placeholder is blocked, not merely warned.
 */
import { describe, expect, it } from 'vitest'
import { classifyClientMessage, resolveConversationIntent } from '@/lib/conversation/intent'
import {
  isTerminalConversation,
  checkOutreachAllowed,
  isTerminalLeadStatus,
  isTerminalStoredStage,
} from '@/lib/conversation/terminal'
import { classifyInboundReply, storedStageForOutcome } from '@/lib/sales/outcomes'
import { unsupportedClaims, assessMessageQuality } from '@/lib/conversation/composer'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Rep, Organization } from '@/lib/domain/types'

const ORG_ID = 'org-a'
const REP_ID = 'rep-1'
const PROFILE_ID = 'profile-1'

function makeRep(): Rep {
  return { id: REP_ID, name: 'Rep', role: 'rep', organizationId: ORG_ID, createdAt: '2026-01-01T00:00:00.000Z', timezone: 'UTC' }
}
function makeOrg(): Organization {
  return { id: ORG_ID, name: 'Org', plan: 'active', billingCustomerId: null, timezone: 'UTC', workingDays: [1, 2, 3, 4, 5], holidays: [], createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('Sprint A — opt-out phrases classify as terminal', () => {
  const cases = [
    'Please close this opportunity. Do not send any additional sales messages or follow-ups.',
    'Do not send more messages.',
    'No further messages, please.',
    'Stop messaging me.',
    'We handled it internally.',
    'We already selected someone else.',
    'The project is completed.',
    'The position is filled.',
  ]
  for (const text of cases) {
    it(`classifies terminal: ${text.slice(0, 40)}…`, () => {
      expect(classifyClientMessage(text).class).toBe('NEGATIVE')
    })
  }
  it('a deferral is not terminal', () => {
    const m = classifyClientMessage('Not right now, maybe next quarter.')
    expect(m.class).toBe('DEFERRED')
    expect(isTerminalConversation(resolveConversationIntent([m.decidingText ?? 'Not right now, maybe next quarter.']))).toBe(false)
  })
  it('an explicit opt-out makes the conversation terminal', () => {
    const intent = resolveConversationIntent(['Thanks! We handled it internally.'])
    expect(intent.declined).toBe(true)
    expect(isTerminalConversation(intent)).toBe(true)
  })
})

describe('Sprint A — terminal authority', () => {
  it('recognizes terminal lead statuses and stored stages', () => {
    expect(isTerminalLeadStatus('won')).toBe(true)
    expect(isTerminalLeadStatus('dead')).toBe(true)
    expect(isTerminalLeadStatus('contacted')).toBe(false)
    expect(isTerminalStoredStage('do_not_contact')).toBe(true)
    expect(isTerminalStoredStage('replied')).toBe(false)
  })
  it('blocks outreach on a terminal lead but allows the rep to answer', () => {
    expect(checkOutreachAllowed({ leadStatus: 'dead' }).terminal).toBe(true)
    expect(checkOutreachAllowed({ leadStatus: 'dead', allowReply: true }).terminal).toBe(false)
  })
  it('blocks outreach on a terminal stored outcome', () => {
    expect(checkOutreachAllowed({ storedStages: ['do_not_contact'] }).terminal).toBe(true)
    expect(checkOutreachAllowed({ storedStages: ['replied'] }).terminal).toBe(false)
  })
})

describe('Sprint A — inbound reply outcome taxonomy', () => {
  it('an opt-out reply is DO_NOT_CONTACT and stored as do_not_contact', () => {
    expect(classifyInboundReply('Stop messaging me, do not contact me.')).toBe('DO_NOT_CONTACT')
    expect(storedStageForOutcome('DO_NOT_CONTACT')).toBe('do_not_contact')
  })
  it('a refusal is NEGATIVE, not success', () => {
    expect(classifyInboundReply('Not interested, thanks.')).toBe('NEGATIVE')
    expect(classifyInboundReply('Sounds interesting, let\'s jump on a call.')).toBe('POSITIVE_COMMERCIAL_REPLY')
  })
})

describe('Sprint A — markContacted is terminal-safe and attributes the sender', () => {
  it('persists sender_profile_id on the logged message', async () => {
    const LEAD_ID = 'lead-sender'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'new', verdict: 'send', score: 9, sender_profile_id: PROFILE_ID }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.markContacted(LEAD_ID, 'Hi, quick question.', 'dm')
    const msg = fake.tables.messages.find((m) => m.lead_id === LEAD_ID)
    expect(msg?.sender_profile_id).toBe(PROFILE_ID)
  })

  it('refuses a cold DM on a closed lead and sends nothing', async () => {
    const LEAD_ID = 'lead-dead'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'dead', verdict: 'send' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await expect(store.markContacted(LEAD_ID, 'Hello again.', 'dm')).rejects.toThrow(/TERMINAL/i)
    expect(fake.tables.messages.find((m) => m.lead_id === LEAD_ID)).toBeUndefined()
  })

  it('allows the rep to answer a closed lead', async () => {
    const LEAD_ID = 'lead-dead-reply'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'dead', verdict: 'send' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    const res = await store.markContacted(LEAD_ID, 'Happy to help.', 'reply')
    expect(res.allowed).toBe(true)
  })
})

describe('Sprint A — an opt-out reply closes the lead', () => {
  it('records DO_NOT_CONTACT and locks the lead', async () => {
    const LEAD_ID = 'lead-optout'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', verdict: 'send' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.recordProspectReply(LEAD_ID, 'Please do not contact me again, stop messaging me.')
    const lead = fake.tables.leads.find((l) => l.id === LEAD_ID)
    expect(lead?.status).toBe('dead')
    const outcome = fake.tables.outcomes.find((o) => o.lead_id === LEAD_ID)
    expect(outcome?.stage).toBe('do_not_contact')
    const cs = fake.tables.conversation_states.find((c) => c.lead_id === LEAD_ID)
    expect(cs?.stage).toBe('lost')
  })
})

describe('Sprint A — fabrication blocker', () => {
  it('catches a lowercase fabricated employer domain', () => {
    const text = 'At aquasec.com I worked on cloud security data flows.'
    const claims = unsupportedClaims(text, 'Acme\nFenwick Pay')
    expect(claims).toContain('aquasec.com')
  })
  it('accepts a claim that is in the allowed text', () => {
    expect(unsupportedClaims('At Fenwick Pay I worked on payments.', 'Acme\nFenwick Pay')).toEqual([])
  })
  it('blocks a draft with an unsupported claim', () => {
    const q = assessMessageQuality({
      text: 'At deepidv.com I built compliance workflows.',
      issues: [],
      claimable: 'Acme',
    })
    expect(q.blocked).toBe(true)
    expect(q.classification).toBe('UNSUPPORTED')
  })
  it('blocks a draft with a stripped placeholder', () => {
    const q = assessMessageQuality({ text: 'We improved engagement by %.', issues: [], claimable: 'Acme' })
    expect(q.blocked).toBe(true)
    expect(q.classification).toBe('FABRICATED')
  })
  it('passes a grounded, specific message', () => {
    const q = assessMessageQuality({
      text: 'You mentioned a checkout rewrite. We shipped a similar migration for Fenwick Pay; happy to share how we scoped it.',
      issues: [],
      claimable: 'Fenwick Pay\nmigrations',
    })
    expect(q.blocked).toBe(false)
    expect(q.classification).toBe('SALES_READY')
  })
})
