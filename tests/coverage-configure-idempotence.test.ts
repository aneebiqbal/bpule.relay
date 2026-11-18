import { describe, expect, it } from 'vitest'
import { sameSeatSet, uniqueSeats, type Seat } from '@/lib/coverage/configure'

/**
 * BUG-42 — re-saving an unchanged chain must not reset acknowledgements.
 *
 * The reconcile used to insert a fresh set of `profile_coverage` rows on every
 * call and re-arm any acknowledgement whose `source_row_id` changed, so an
 * acknowledged assignment was handed back to the operator again and again.
 * The guard compares the SEATS, never the row ids.
 */
const BASE: Seat[] = [
  { repId: 'rep-primary', role: 'PRIMARY', priority: 1 },
  { repId: 'rep-operator', role: 'OPERATOR', priority: 1 },
]

describe('coverage reconcile idempotence (BUG-42)', () => {
  it('treats an unchanged chain as unchanged, regardless of row ids', () => {
    const current = [
      { rep_id: 'rep-primary', role: 'PRIMARY', priority: 1 },
      { rep_id: 'rep-operator', role: 'OPERATOR', priority: 1 },
    ]
    expect(sameSeatSet(current, BASE)).toBe(true)
  })

  it('detects a new operator', () => {
    const current = [
      { rep_id: 'rep-primary', role: 'PRIMARY', priority: 1 },
      { rep_id: 'rep-operator', role: 'OPERATOR', priority: 1 },
      { rep_id: 'rep-new', role: 'OPERATOR', priority: 2 },
    ]
    expect(sameSeatSet(current, BASE)).toBe(false)
  })

  it('detects a removed operator', () => {
    const current = [{ rep_id: 'rep-primary', role: 'PRIMARY', priority: 1 }]
    expect(sameSeatSet(current, BASE)).toBe(false)
  })

  it('detects a primary change', () => {
    const current = [
      { rep_id: 'rep-other', role: 'PRIMARY', priority: 1 },
      { rep_id: 'rep-operator', role: 'OPERATOR', priority: 1 },
    ]
    expect(sameSeatSet(current, BASE)).toBe(false)
  })

  it('detects a priority change', () => {
    const current = [
      { rep_id: 'rep-primary', role: 'PRIMARY', priority: 1 },
      { rep_id: 'rep-operator', role: 'OPERATOR', priority: 5 },
    ]
    expect(sameSeatSet(current, BASE)).toBe(false)
  })

  it('collapses one rep to a single seat, PRIMARY winning', () => {
    const seats = uniqueSeats([
      { repId: 'rep-a', role: 'OPERATOR', priority: 1 },
      { repId: 'rep-a', role: 'PRIMARY', priority: 1 },
      { repId: 'rep-a', role: 'BACKUP', priority: 0 },
    ])
    expect(seats).toEqual([{ repId: 'rep-a', role: 'PRIMARY', priority: 1 }])
  })

  it('keeps the lowest priority when the role ties', () => {
    const seats = uniqueSeats([
      { repId: 'rep-a', role: 'OPERATOR', priority: 3 },
      { repId: 'rep-a', role: 'OPERATOR', priority: 1 },
    ])
    expect(seats).toEqual([{ repId: 'rep-a', role: 'OPERATOR', priority: 1 }])
  })
})
