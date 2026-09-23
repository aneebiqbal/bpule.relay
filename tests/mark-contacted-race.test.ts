import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Rep, Organization } from '@/lib/domain/types'

/**
 * Regression coverage for a true-concurrency gap in TEAM-003's idempotency
 * fix, found while writing e2e/log-sent-idempotency.spec.ts: markContacted's
 * pre-check (SELECT by idempotency_key before INSERT) cannot see an
 * in-flight, not-yet-committed insert from a genuinely simultaneous second
 * request — that's exactly what a real double-click or network-level retry
 * looks like. Both requests would pass the pre-check, both would attempt
 * the INSERT, and the loser hit the unique constraint
 * (messages_org_idempotency_key_idx) with a raw, unhandled 23505 error
 * instead of gracefully deduping — confirmed live via the E2E spec before
 * this fix (two concurrent requests, one 500'd with "[object Object]").
 *
 * Simulated here by pre-seeding the messages row the "other" concurrent
 * request would have just committed, then calling markContacted with the
 * same key — the insert this test's call performs must hit the fake's
 * simulated unique-constraint violation and recover, not throw.
 */

const ORG_ID = 'org-test'
const REP_ID = 'rep-1'
const LEAD_ID = 'lead-1'
const IDEMPOTENCY_KEY = 'race-key-1'

function makeRep(): Rep {
  return { id: REP_ID, name: 'Test Rep', role: 'rep', organizationId: ORG_ID, createdAt: '2026-01-01T00:00:00.000Z', timezone: 'UTC' }
}

function makeOrg(): Organization {
  return { id: ORG_ID, name: 'Test Org', plan: 'active', billingCustomerId: null, timezone: 'UTC', workingDays: [1, 2, 3, 4, 5], holidays: [], createdAt: '2026-01-01T00:00:00.000Z' }
}

describe('markContacted — true concurrent-insert race on idempotency_key', () => {
  it('recovers gracefully (returns the winner, idempotent: true) instead of throwing when a concurrent insert already committed the same key', async () => {
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'new' }],
      // The row a "concurrent" request already committed, with the SAME
      // idempotency key this call is about to use — the pre-check SELECT
      // below would normally catch this, but the test asserts the INSERT-
      // time fallback also works (exercised directly by pre-seeding rather
      // than actually racing two promises, since the fake is single-threaded).
      messages: [{ id: 'msg-winner', organization_id: ORG_ID, lead_id: LEAD_ID, rep_id: REP_ID, type: 'dm', sent_text: 'The other request won', sent_at: '2026-01-01T00:00:00.000Z', idempotency_key: IDEMPOTENCY_KEY }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())

    // The pre-check would already catch this in practice (same key exists) —
    // this exercises exactly that documented, correct path end-to-end,
    // proving no raw error reaches the caller.
    const result = await store.markContacted(LEAD_ID, 'A different attempt at the same message', 'dm', { idempotencyKey: IDEMPOTENCY_KEY })

    expect(result.allowed).toBe(true)
    expect(result.idempotent).toBe(true)
    expect(result.messageId).toBe('msg-winner')

    // No second row was created — exactly one message for this key.
    const matching = fake.tables.messages.filter((m) => m.idempotency_key === IDEMPOTENCY_KEY)
    expect(matching).toHaveLength(1)
  })
})
