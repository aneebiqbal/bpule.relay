/**
 * REP_DAY_CLOSE
 *
 * Closing is explicit. Closing complete requires no outstanding work; closing
 * incomplete is allowed but records the shortfall, and the shortfall is never
 * erased. Closing twice returns the first close.
 */
import { describe, expect, it } from 'vitest'
import { buildCarryover, buildShortfall, closeRepDay } from '@/lib/rep-day/persist'
import { makeRepDayView, makeUpdateClient } from './helpers/fake-rep-day-client'

const NOW = new Date('2026-10-30T12:45:00.000Z') // 17:45 Asia/Karachi

describe('REP_DAY_CLOSE — complete', () => {
  it('closes when nothing is required', async () => {
    const fake = makeUpdateClient()
    const view = makeRepDayView({ requiredRemaining: 0, commitments: [] })
    const result = await closeRepDay({ view, mode: 'complete', now: NOW, client: fake.client })

    expect(result.ok).toBe(true)
    expect(fake.written()).toMatchObject({ state: 'CLOSED', closed_at: NOW.toISOString() })
    expect((fake.written()?.shortfall as Record<string, unknown>).closedIncomplete).toBe(false)
  })

  it('refuses to close complete while work remains, and names the shortfall', async () => {
    const fake = makeUpdateClient()
    const view = makeRepDayView({ requiredRemaining: 12 })
    const result = await closeRepDay({ view, mode: 'complete', now: NOW, client: fake.client })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('12 required actions are still incomplete')
    expect(fake.written()).toBeNull()
  })

  it('allows a complete close when an exception is approved', async () => {
    const fake = makeUpdateClient()
    const view = makeRepDayView({
      requiredRemaining: 12,
      exception: { state: 'APPROVED', reason: 'meeting_heavy_day', note: null, reviewedBy: 'admin-1', reviewedAt: NOW.toISOString() },
    })
    const result = await closeRepDay({ view, mode: 'complete', now: NOW, client: fake.client })

    expect(result.ok).toBe(true)
  })
})

describe('REP_DAY_CLOSE — incomplete', () => {
  it('closes and records every outstanding commitment', async () => {
    const fake = makeUpdateClient()
    const view = makeRepDayView({ requiredRemaining: 12, mandatoryRemaining: 2 })
    const result = await closeRepDay({ view, mode: 'incomplete', now: NOW, client: fake.client })

    expect(result.ok).toBe(true)
    const shortfall = fake.written()?.shortfall as {
      closedIncomplete: boolean
      requiredRemaining: number
      commitments: Array<{ key: string; remaining: number }>
    }
    expect(shortfall.closedIncomplete).toBe(true)
    expect(shortfall.requiredRemaining).toBe(12)
    expect(shortfall.commitments).toEqual([
      { key: 'profiles_supplied', label: 'Profiles', remaining: 7 },
      { key: 'followups_completed', label: 'Follow-ups', remaining: 5 },
    ])
  })

  it('never erases a previously recorded shortfall', () => {
    const view = makeRepDayView({
      shortfall: { requiredRemaining: 9, closedIncomplete: true },
      requiredRemaining: 12,
    })
    const next = buildShortfall(view, 'incomplete')
    // The new snapshot is at least as complete as the old one: nothing is zeroed.
    expect((next.commitments as unknown[]).length).toBe(2)
    expect(next.requiredRemaining).toBe(12)
  })
})

describe('REP_DAY_CLOSE — idempotency and carryover', () => {
  it('returns the existing close instead of writing again', async () => {
    const fake = makeUpdateClient()
    const view = makeRepDayView({ closedAt: '2026-10-30T12:40:00.000Z' })
    const result = await closeRepDay({ view, mode: 'complete', now: NOW, client: fake.client })

    expect(result.ok).toBe(true)
    expect(result.closedAt).toBe('2026-10-30T12:40:00.000Z')
    expect(fake.written()).toBeNull()
  })

  it('writes what tomorrow inherits', () => {
    const view = makeRepDayView({ requiredRemaining: 12, mandatoryRemaining: 2 })
    const carryover = buildCarryover(view)
    expect(carryover).toMatchObject({
      from: '2026-10-30',
      requiredRemaining: 12,
      repliesWaiting: 2,
    })
    expect(carryover.commitments).toEqual([
      { key: 'profiles_supplied', label: 'Profiles', remaining: 7 },
      { key: 'followups_completed', label: 'Follow-ups', remaining: 5 },
    ])
  })

  it('reports a missing table instead of silently losing the close', async () => {
    const fake = makeUpdateClient()
    fake.failWith({ code: '42P01', message: 'relation "rep_day" does not exist' })
    const result = await closeRepDay({
      view: makeRepDayView({ requiredRemaining: 0 }),
      mode: 'complete',
      now: NOW,
      client: fake.client,
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('rep-day table is not present')
  })
})
