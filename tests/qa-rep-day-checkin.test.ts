/**
 * REP_DAY_CHECKIN
 *
 * "Start my day" is explicit and idempotent. The first check-in is the
 * check-in: a double-click, a retry or a second tab must not move it.
 */
import { describe, expect, it } from 'vitest'
import { checkInRepDay } from '@/lib/rep-day/persist'
import { makeCheckInClient } from './helpers/fake-rep-day-client'

const INPUT = {
  organizationId: 'org-1',
  repId: 'rep-1',
  businessDate: '2026-10-30',
  now: new Date('2026-10-30T04:05:00.000Z'), // 09:05 Asia/Karachi
}

describe('REP_DAY_CHECKIN — first check-in', () => {
  it('stores the check-in instant and opens the day as ACTIVE', async () => {
    const fake = makeCheckInClient(null)
    const result = await checkInRepDay({ ...INPUT, client: fake.client })

    expect(result.ok).toBe(true)
    expect(result.checkInAt).toBe('2026-10-30T04:05:00.000Z')
    expect(fake.inserts).toHaveLength(1)
    expect(fake.inserts[0]).toMatchObject({
      organization_id: 'org-1',
      rep_id: 'rep-1',
      business_date: '2026-10-30',
      state: 'ACTIVE',
      check_in_at: '2026-10-30T04:05:00.000Z',
    })
  })

  it('updates an existing un-started row rather than inserting a second one', async () => {
    const fake = makeCheckInClient({ id: 'rd-1', check_in_at: null })
    const result = await checkInRepDay({ ...INPUT, client: fake.client })

    expect(result.ok).toBe(true)
    expect(fake.inserts).toHaveLength(0)
    expect(fake.row()?.check_in_at).toBe('2026-10-30T04:05:00.000Z')
  })
})

describe('REP_DAY_CHECKIN — idempotency', () => {
  it('keeps the original check-in time on a second call', async () => {
    const fake = makeCheckInClient({
      id: 'rd-1',
      check_in_at: '2026-10-30T04:05:00.000Z',
    })
    const result = await checkInRepDay({
      ...INPUT,
      now: new Date('2026-10-30T05:30:00.000Z'),
      client: fake.client,
    })

    expect(result.ok).toBe(true)
    expect(result.checkInAt).toBe('2026-10-30T04:05:00.000Z')
    expect(fake.inserts).toHaveLength(0)
  })

  it('survives a concurrent insert race and returns the winner', async () => {
    const fake = makeCheckInClient(null, { insertError: { code: '23505' } })
    // The winner's row appears between the failed insert and the re-read.
    const result = await checkInRepDay({ ...INPUT, client: fake.client })

    expect(result.ok).toBe(true)
    expect(result.checkInAt).toBe('2026-10-30T04:05:00.000Z')
  })

  it('reports a missing table instead of pretending the day started', async () => {
    const fake = makeCheckInClient(null, {
      insertError: { code: '42P01', message: 'relation "rep_day" does not exist' },
    })
    const result = await checkInRepDay({ ...INPUT, client: fake.client })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('rep-day table is not present')
  })
})
