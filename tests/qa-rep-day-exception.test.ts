/**
 * REP_DAY_EXCEPTION
 *
 * An exception is a request and a review, both auditable. It is the only way
 * to close a day with work outstanding without recording it as a shortfall.
 */
import { describe, expect, it } from 'vitest'
import { requestRepDayException, reviewRepDayException } from '@/lib/rep-day/persist'
import { makeUpdateClient } from './helpers/fake-rep-day-client'

const BASE = {
  organizationId: 'org-1',
  repId: 'rep-1',
  businessDate: '2026-10-30',
}

describe('REP_DAY_EXCEPTION — request', () => {
  it('records the reason and note and moves the state to REQUESTED', async () => {
    const fake = makeUpdateClient()
    const result = await requestRepDayException({
      ...BASE,
      reason: 'meeting_heavy_day',
      note: 'Two client calls ran long.',
      client: fake.client,
    })

    expect(result.ok).toBe(true)
    expect(fake.written()).toMatchObject({
      exception_state: 'REQUESTED',
      exception_reason: 'meeting_heavy_day',
      exception_note: 'Two client calls ran long.',
    })
  })

  it('never writes an exception without a reason', async () => {
    const fake = makeUpdateClient()
    await requestRepDayException({ ...BASE, reason: '', note: null, client: fake.client })
    expect(fake.written()?.exception_reason).toBe('')
  })
})

describe('REP_DAY_EXCEPTION — review', () => {
  it('approves with the reviewer and timestamp', async () => {
    const fake = makeUpdateClient()
    const result = await reviewRepDayException({
      ...BASE,
      approved: true,
      reviewerId: 'admin-1',
      reason: 'approved_leave',
      client: fake.client,
    })

    expect(result.ok).toBe(true)
    const written = fake.written()!
    expect(written.exception_state).toBe('APPROVED')
    expect(written.reviewed_by).toBe('admin-1')
    expect(typeof written.reviewed_at).toBe('string')
  })

  it('rejects without erasing the original request', async () => {
    const fake = makeUpdateClient()
    const result = await reviewRepDayException({
      ...BASE,
      approved: false,
      reviewerId: 'admin-1',
      client: fake.client,
    })

    expect(result.ok).toBe(true)
    expect(fake.written()?.exception_state).toBe('REJECTED')
    expect(fake.written()?.reviewed_by).toBe('admin-1')
  })

  it('surfaces a missing table rather than reporting success', async () => {
    const fake = makeUpdateClient()
    fake.failWith({ code: '42P01', message: 'relation "rep_day" does not exist' })
    const result = await reviewRepDayException({
      ...BASE,
      approved: true,
      reviewerId: 'admin-1',
      client: fake.client,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('rep-day table is not present')
  })
})
