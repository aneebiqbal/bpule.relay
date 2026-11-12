/**
 * §29 — every completion path prevents duplicate credit.
 *
 * The canonical RPC keys exactly-once on `source_event_id`: a retry, a double
 * click or a duplicate callback must never increment the same real action twice.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { closeDbPool, serviceDbClient } from '@/lib/db/client'

const ORG = '11111111-1111-1111-1111-111111111111'
const REP = 'aaaaaaaa-0000-0000-0000-000000000004' // Ahmad
const IDENTITY = 'ab50b6a7-0b85-44c2-b8c9-52816f8adf93' // Zaira · Upwork
const TODAY = new Date().toISOString().slice(0, 10)

afterAll(async () => { await closeDbPool() })

/** The Neon client returns the function row; the Supabase client the scalar. */
function unwrap(data: unknown): Record<string, unknown> {
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    const first = data[0] as Record<string, unknown>
    if ('record_activity_event' in first) return first.record_activity_event as Record<string, unknown>
    return first
  }
  return (data ?? {}) as Record<string, unknown>
}

describe('COMPLETION_IDEMPOTENT', () => {
  it('the same source event credits exactly once', async () => {
    const client = serviceDbClient()
    const sourceEventId = `idempotency-test:${Date.now()}`
    const where = {
      rep_id: REP,
      revenue_identity_id: IDENTITY,
      activity_type: 'application',
      target_date: TODAY,
      organization_id: ORG,
    }

    const { data: beforeRows } = await client.from('daily_accountability').select('id, completed_count').eq('rep_id', REP).eq('revenue_identity_id', IDENTITY).eq('activity_type', 'application').eq('target_date', TODAY).eq('organization_id', ORG).limit(1)
    const before = beforeRows?.[0]?.completed_count as number | undefined

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = unwrap((await client.rpc('record_activity_event', {
        p_rep_id: REP,
        p_identity_id: IDENTITY,
        p_activity_type: 'application',
        p_org_id: ORG,
        p_source_event_id: sourceEventId,
        p_date: TODAY,
      })).data)
      if (attempt === 0) expect(result.recorded).toBe(true)
      else {
        expect(result.recorded).toBe(false)
        expect(result.reason).toBe('already_recorded')
      }
    }

    const { data: afterRows, error } = await client.from('daily_accountability').select('id, completed_count, source_event_ids').eq('rep_id', REP).eq('revenue_identity_id', IDENTITY).eq('activity_type', 'application').eq('target_date', TODAY).eq('organization_id', ORG).limit(1)
    expect(error).toBeNull()
    expect(afterRows?.[0]?.completed_count).toBe((before ?? 0) + 1)

    // Restore the fixture row to its pre-test state.
    const row = afterRows?.[0]
    if (row) {
      const remaining = ((row.source_event_ids as string[]) ?? []).filter((id) => id !== sourceEventId)
      if (remaining.length === 0 && (row.completed_count as number) <= 1) {
        await client.from('daily_accountability').delete().eq('id', row.id)
      } else {
        await client.from('daily_accountability').update({
          completed_count: (row.completed_count as number) - 1,
          source_event_ids: remaining,
        }).eq('id', row.id)
      }
    }
  }, 60_000)
})
