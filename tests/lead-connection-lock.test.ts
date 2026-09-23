import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Rep, Organization } from '@/lib/domain/types'

const ORG_ID = 'org-test'
const REP_ID = 'rep-1'

function makeRep(): Rep {
  return { id: REP_ID, name: 'Test Rep', role: 'rep', organization_id: ORG_ID, createdAt: '2026-01-01T00:00:00.000Z', timezone: 'UTC' } as Rep
}

function makeOrg(): Organization {
  return { id: ORG_ID, name: 'Test Org', plan: 'active', billingCustomerId: null, timezone: 'UTC', workingDays: [1, 2, 3, 4, 5], holidays: [], createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('connection-pacing lock', () => {
  it('locks a good-profile lead for 6h when a connection note is sent', async () => {
    const LEAD_ID = 'lead-good'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'new', verdict: 'send', score: 8 }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.markContacted(LEAD_ID, 'Hi there, I loved your post about X.', 'connection')

    const lead = fake.tables.leads.find((l) => l.id === LEAD_ID)
    expect(lead?.status).toBe('contacted')
    expect(lead?.locked_until).toBeTruthy()
    expect(lead?.locked_reason).toBe('connection_note_sent')
    const lockedUntil = new Date(lead?.locked_until as string).getTime()
    const expected = Date.now() + 6 * 60 * 60 * 1000
    expect(Math.abs(lockedUntil - expected)).toBeLessThan(5000)
  })

  it('does NOT lock a lead whose verdict is not send (skip / research_more)', async () => {
    const LEAD_ID = 'lead-skip'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'new', verdict: 'skip', score: 2, locked_until: null }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.markContacted(LEAD_ID, 'Hello', 'connection')

    const lead = fake.tables.leads.find((l) => l.id === LEAD_ID)
    expect(lead?.locked_until).toBeNull()
  })

  it('does NOT lock when a DM is sent (only connection notes trigger the lock)', async () => {
    const LEAD_ID = 'lead-dm'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'new', verdict: 'send', score: 9, locked_until: null }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.markContacted(LEAD_ID, 'Hi, quick question.', 'dm')

    const lead = fake.tables.leads.find((l) => l.id === LEAD_ID)
    expect(lead?.locked_until).toBeNull()
  })

  it('blocks a second outreach send while the lead is locked', async () => {
    const LEAD_ID = 'lead-blocked'
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1h in future
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', verdict: 'send', locked_until: lockedUntil, locked_reason: 'connection_note_sent' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await expect(store.markContacted(LEAD_ID, 'Another message', 'dm')).rejects.toThrow(/connection-locked/i)
  })

  it('allows outreach once the lock has expired', async () => {
    const LEAD_ID = 'lead-expired'
    const lockedUntil = new Date(Date.now() - 60 * 1000).toISOString() // 1 min ago = expired
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', verdict: 'send', locked_until: lockedUntil, locked_reason: 'connection_note_sent' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await expect(store.markContacted(LEAD_ID, 'Now the DM is fine.', 'dm')).resolves.toBeDefined()
  })

  it('idempotent re-send of the same connection does not double-lock (still 6h window)', async () => {
    const LEAD_ID = 'lead-idem'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'new', verdict: 'send', score: 8 }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    const key = 'idem-key-1'
    await store.markContacted(LEAD_ID, 'Hi!', 'connection', { idempotencyKey: key })
    const first = fake.tables.leads.find((l) => l.id === LEAD_ID)
    const firstLock = first?.locked_until

    // Retry the same logical send — should be idempotent (no new lock write needed, same result)
    const res = await store.markContacted(LEAD_ID, 'Hi!', 'connection', { idempotencyKey: key })
    expect(res.idempotent).toBe(true)
    expect(first?.locked_until).toBe(firstLock)
  })
})

describe('recordProspectReply', () => {
  it('persists the prospect inbound text, flips status to replied, records outcome + conversation state', async () => {
    const LEAD_ID = 'lead-reply'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', verdict: 'send' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())

    const msg = await store.recordProspectReply(LEAD_ID, 'Sounds interesting, let\'s jump on a call.')

    expect(msg.type).toBe('reply')
    expect(msg.direction).toBe('inbound')
    expect(msg.sentText).toBe('Sounds interesting, let\'s jump on a call.')

    const lead = fake.tables.leads.find((l) => l.id === LEAD_ID)
    expect(lead?.status).toBe('replied')

    const outcome = fake.tables.outcomes.find((o) => o.lead_id === LEAD_ID)
    expect(outcome?.stage).toBe('replied')

    const cs = fake.tables.conversation_states.find((c) => c.lead_id === LEAD_ID)
    expect(cs?.stage).toBe('replied')
    expect(cs?.last_reply_at).toBeTruthy()
  })

  it('throws for a locked (no/dead) lead', async () => {
    const LEAD_ID = 'lead-dead'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'dead' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await expect(store.recordProspectReply(LEAD_ID, 'hello')).rejects.toThrow(/locked/i)
  })
})

describe('unlockLead', () => {
  it('clears an active lock (admin override)', async () => {
    const LEAD_ID = 'lead-unlock'
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const fake = createFakeSupabase({
      leads: [{ id: ORG_ID === ORG_ID ? LEAD_ID : '', organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', verdict: 'send', locked_until: lockedUntil, locked_reason: 'connection_note_sent' }].filter((l) => l.id),
    })
    const store = new SupabaseStore({ ...makeRep(), role: 'admin' }, fake.client as never, makeOrg())
    await store.unlockLead(LEAD_ID)

    const lead = fake.tables.leads.find((l) => l.id === LEAD_ID)
    expect(lead?.locked_until).toBeNull()
    expect(lead?.locked_reason).toBeNull()
  })
})
