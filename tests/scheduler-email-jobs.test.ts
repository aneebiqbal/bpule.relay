/**
 * The email job kinds the scheduler drains.
 *
 * §30 requires the existing outbox, not a second scheduler. These pin that the
 * email jobs are planned by the same planner and keyed so a duplicate worker is
 * a no-op.
 */
import { describe, expect, it } from 'vitest'
import { normalizePolicy, type OperatingPolicy } from '@/lib/org-clock'
import { dedupeKeyFor, planOperationalJobs } from '@/lib/scheduler/plan'

const POLICY: OperatingPolicy = normalizePolicy({
  organizationId: 'org-1',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

const DATE = '2026-10-30'
/** A Karachi wall-clock instant (UTC+5). */
const karachiAt = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 30, hour - 5, minute))

describe('email jobs in the operational planner', () => {
  it('plans mailbox sync and retry on every cycle, not only at day end', () => {
    const early = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: karachiAt(10) })
    const kinds = early.map((j) => j.jobKind)

    expect(kinds).toContain('SYNC_MAILBOX')
    expect(kinds).toContain('RETRY_EMAIL')
  })

  it('does not plan the end-of-day jobs at the start of the day', () => {
    const early = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: karachiAt(10) })
    const kinds = early.map((j) => j.jobKind)

    expect(kinds).not.toContain('CLOSE_MISSED_DAY')
    expect(kinds).not.toContain('PREPARE_CARRYOVER')
  })

  it('gives every planned job a unique deterministic key', () => {
    const jobs = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: karachiAt(14) })
    const keys = jobs.map((j) => j.dedupeKey)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keys a send job by the draft, so two drafts are two jobs', () => {
    const first = dedupeKeyFor(DATE, 'SEND_EMAIL', 'draft-a')
    const second = dedupeKeyFor(DATE, 'SEND_EMAIL', 'draft-b')

    expect(first).not.toBe(second)
    expect(first).toContain('draft-a')
  })

  it('is idempotent: planning the same instant twice yields the same keys', () => {
    const now = karachiAt(14)
    const first = planOperationalJobs({ policy: POLICY, businessDate: DATE, now })
    const second = planOperationalJobs({ policy: POLICY, businessDate: DATE, now })

    expect(first.map((j) => j.dedupeKey)).toEqual(second.map((j) => j.dedupeKey))
  })

  it('plans nothing on a non-working day', () => {
    const sunday = planOperationalJobs({ policy: POLICY, businessDate: '2026-11-01', now: karachiAt(14) })
    expect(sunday).toEqual([])
  })
})
