import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Rep, Organization } from '@/lib/domain/types'

/**
 * Regression coverage for the lead-lifecycle messaging state machine:
 * connection note sent -> wait for acceptance -> DM eligible.
 * connection_accepted_at is set ONLY by explicit rep action
 * (markConnectionAccepted / POST /api/leads/[id]/connection-accepted) —
 * never inferred from a reply, elapsed time, or anything else.
 */

const ORG_ID = 'org-test'
const REP_ID = 'rep-1'
const LEAD_ID = 'lead-1'

function makeRep(): Rep {
  return { id: REP_ID, name: 'Test Rep', role: 'rep', organizationId: ORG_ID, createdAt: '2026-01-01T00:00:00.000Z', timezone: 'UTC' }
}

function makeOrg(): Organization {
  return { id: ORG_ID, name: 'Test Org', plan: 'active', billingCustomerId: null, timezone: 'UTC', workingDays: [1, 2, 3, 4, 5], holidays: [], createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('markConnectionAccepted', () => {
  it('sets connection_accepted_at on a lead the rep owns', async () => {
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', connection_accepted_at: null }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.markConnectionAccepted(LEAD_ID)

    const lead = fake.tables.leads.find((l) => l.id === LEAD_ID)
    expect(lead?.connection_accepted_at).toBeTruthy()
  })

  it('throws for a lead owned by a different rep (never silently succeeds cross-owner)', async () => {
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: 'someone-else', company: 'Acme', status: 'contacted', connection_accepted_at: null }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await expect(store.markConnectionAccepted(LEAD_ID)).rejects.toThrow()
  })

  it('throws for a locked lead (status no/dead)', async () => {
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'dead', connection_accepted_at: null }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await expect(store.markConnectionAccepted(LEAD_ID)).rejects.toThrow()
  })

  it('is idempotent — calling it again just updates the timestamp, does not error', async () => {
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', connection_accepted_at: '2026-01-01T00:00:00.000Z' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await expect(store.markConnectionAccepted(LEAD_ID)).resolves.toBeUndefined()
    const lead = fake.tables.leads.find((l) => l.id === LEAD_ID)
    expect(lead?.connection_accepted_at).not.toBe('2026-01-01T00:00:00.000Z')
  })
})
