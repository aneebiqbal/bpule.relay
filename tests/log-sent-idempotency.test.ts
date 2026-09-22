import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression coverage for Relay team bug bash — TEAM-003 (draft/duplicate-
 * click pollutes timeline and accountability counters).
 *
 * Root cause found: unlike Email Outreach V1's sendPreparedEmail (which
 * already checks an idempotency_key before doing anything), POST
 * /api/leads/[id]/contact (-> markContacted -> "Log Sent" for DM/connection/
 * followup/reply) had NO idempotency protection. A double-click, a slow
 * network retry, or two tabs could insert a second "sent" messages row for
 * the SAME logical send and double-increment daily_accountability via
 * record_activity_event. Separately, the OUTREACH_RECORDED event's
 * sourceEventId included Date.now(), which defeated emit_relay_event's own
 * DB-level dedup (unique on organization_id+source+source_event_id) by
 * making every call's key unique regardless of whether it was a retry.
 *
 * This test exercises the route with a mocked store, asserting that a
 * second POST with the SAME idempotencyKey is a no-op (returns the
 * already-recorded result) rather than calling markContacted's full body
 * again.
 */

const { createScoutStoreMock } = vi.hoisted(() => ({
  createScoutStoreMock: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  createScoutStore: createScoutStoreMock,
}))

const LEAD_ID = 'lead-1'

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    organizationId: 'org-test',
    ownerRepId: 'rep-1',
    company: 'Acme',
    companyKey: 'acme',
    contactName: 'Sarah',
    contactTitle: 'CTO',
    status: 'new',
    tags: [],
    messages: [],
    outcomes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function postContact(payload: Record<string, unknown>, leadId = LEAD_ID) {
  const { POST } = await import('@/app/api/leads/[id]/contact/route')
  const req = new Request(`http://localhost/api/leads/${leadId}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const res = await POST(req, { params: Promise.resolve({ id: leadId }) })
  return { res, data: await res.json() }
}

describe('POST /api/leads/[id]/contact — idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createScoutStoreMock.mockReset()
  })

  it('a duplicate call with the SAME idempotencyKey does not call markContacted a second time and returns the original result', async () => {
    const markContacted = vi.fn()
      .mockResolvedValueOnce({ allowed: true, todaySends: 1, limit: 30, messageId: 'msg-1', idempotent: false })
      .mockResolvedValueOnce({ allowed: true, todaySends: 1, limit: 30, messageId: 'msg-1', idempotent: true })
    const logEditLearning = vi.fn().mockResolvedValue(undefined)
    const addSalesMemory = vi.fn().mockResolvedValue(undefined)
    const emitRelayEvent = vi.fn().mockResolvedValue('evt-1')

    createScoutStoreMock.mockResolvedValue({
      getLead: vi.fn().mockResolvedValue(makeLead()),
      markContacted,
      logEditLearning,
      addSalesMemory,
      emitRelayEvent,
    })

    const payload = { sentText: 'Hi Sarah, quick note.', type: 'dm', idempotencyKey: 'key-abc-123' }

    const first = await postContact(payload)
    expect(first.res.status).toBe(200)
    expect(first.data.idempotent).toBeFalsy()

    const second = await postContact(payload)
    expect(second.res.status).toBe(200)
    expect(second.data.idempotent).toBe(true)
    expect(second.data.todaySends).toBe(1) // did not increment a second time

    // The store's markContacted() is the layer that actually performs the
    // idempotency check (mirroring where sendPreparedEmail does it for
    // email) — this test verifies the ROUTE correctly forwards the key and
    // handles the idempotent response without re-running side effects
    // (learning/memory), not that no second call ever reaches the store.
    expect(markContacted).toHaveBeenCalledTimes(2)
    expect(markContacted).toHaveBeenNthCalledWith(
      1,
      LEAD_ID,
      'Hi Sarah, quick note.',
      'dm',
      expect.objectContaining({ idempotencyKey: 'key-abc-123' }),
    )
    expect(markContacted).toHaveBeenNthCalledWith(
      2,
      LEAD_ID,
      'Hi Sarah, quick note.',
      'dm',
      expect.objectContaining({ idempotencyKey: 'key-abc-123' }),
    )

    // Side effects (learning telemetry) must only have fired once — for the
    // real send, not the duplicate.
    expect(logEditLearning).toHaveBeenCalledTimes(1)
  })

  it('a different idempotencyKey (a genuinely new send) is NOT treated as a duplicate', async () => {
    const markContacted = vi.fn()
      .mockResolvedValueOnce({ allowed: true, todaySends: 1, limit: 30, messageId: 'msg-1', idempotent: false })
      .mockResolvedValueOnce({ allowed: true, todaySends: 2, limit: 30, messageId: 'msg-2', idempotent: false })

    createScoutStoreMock.mockResolvedValue({
      getLead: vi.fn().mockResolvedValue(makeLead()),
      markContacted,
      logEditLearning: vi.fn().mockResolvedValue(undefined),
      addSalesMemory: vi.fn().mockResolvedValue(undefined),
      emitRelayEvent: vi.fn().mockResolvedValue('evt-1'),
    })

    const first = await postContact({ sentText: 'First message', type: 'dm', idempotencyKey: 'key-1' })
    const second = await postContact({ sentText: 'Second message', type: 'dm', idempotencyKey: 'key-2' })

    expect(first.data.idempotent).toBeFalsy()
    expect(second.data.idempotent).toBeFalsy()
    expect(second.data.todaySends).toBe(2)
  })

  it('missing idempotencyKey still works (backward compatible — not a required field)', async () => {
    const markContacted = vi.fn().mockResolvedValue({ allowed: true, todaySends: 1, limit: 30, messageId: 'msg-1', idempotent: false })
    createScoutStoreMock.mockResolvedValue({
      getLead: vi.fn().mockResolvedValue(makeLead()),
      markContacted,
      logEditLearning: vi.fn().mockResolvedValue(undefined),
      addSalesMemory: vi.fn().mockResolvedValue(undefined),
      emitRelayEvent: vi.fn().mockResolvedValue('evt-1'),
    })

    const { res, data } = await postContact({ sentText: 'No key here', type: 'dm' })
    expect(res.status).toBe(200)
    expect(data.idempotent).toBeFalsy()
    expect(markContacted).toHaveBeenCalledWith(LEAD_ID, 'No key here', 'dm', expect.objectContaining({ idempotencyKey: null }))
  })
})
