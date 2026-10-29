/**
 * WARNING_ESCALATION
 *
 * Warnings must fire from the scheduler, not from a page load, and escalation
 * must reach the rep and their admins exactly once — never on every cycle.
 */
import { describe, expect, it } from 'vitest'
import { normalizePolicy, type OperatingPolicy } from '@/lib/org-clock'
import { planOperationalJobs } from '@/lib/scheduler/plan'
import { notifyOnce } from '@/lib/scheduler/run'

const POLICY: OperatingPolicy = normalizePolicy({
  organizationId: 'org-1',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

const DATE = '2026-10-30'
const at = (hour: number) => new Date(Date.UTC(2026, 9, 30, hour - 5, 0))

describe('WARNING_ESCALATION — planning', () => {
  it('plans a warning job at every stage', () => {
    for (const hour of [9, 12, 15, 17, 18]) {
      const jobs = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(hour) })
      expect(jobs.map((job) => job.jobKind)).toContain('EMIT_WARNING')
    }
  })

  it('does not escalate in the early stage', () => {
    const early = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(9) })
    expect(early.map((job) => job.jobKind)).not.toContain('EMIT_ESCALATION')
  })

  it('escalates from midday onward, so an early fall-behind is still caught', () => {
    for (const hour of [12, 15, 17, 18]) {
      const jobs = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(hour) })
      expect(jobs.map((job) => job.jobKind)).toContain('EMIT_ESCALATION')
    }
  })

  it('plans the follow-up sweep once the day is under way', () => {
    const early = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(9) })
    const midday = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(12) })
    expect(early.map((job) => job.jobKind)).not.toContain('EVALUATE_FOLLOWUP')
    expect(midday.map((job) => job.jobKind)).toContain('EVALUATE_FOLLOWUP')
  })
})

/** A notifications table that remembers what it was given. */
function fakeNotifications() {
  const rows: Array<Record<string, unknown>> = []
  const client = {
    from(table: string) {
      if (table !== 'notifications') throw new Error(`unexpected table ${table}`)
      return {
        select() {
          return {
            eq() {
              return {
                eq(_column: string, recipient: string) {
                  return {
                    eq(_c: string, dedupe: string) {
                      return {
                        maybeSingle: async () => ({
                          data:
                            rows.find((row) => row.recipient_id === recipient && row.dedupe_key === dedupe) ?? null,
                          error: null,
                        }),
                      }
                    },
                  }
                },
              }
            },
          }
        },
        insert(payload: Record<string, unknown>) {
          rows.push(payload)
          return { error: null }
        },
      }
    },
  }
  return { client: client as never, rows }
}

describe('WARNING_ESCALATION — exactly once', () => {
  it('sends the first escalation and suppresses the duplicate', async () => {
    const fake = fakeNotifications()
    const payload = {
      organizationId: 'org-1',
      recipientId: 'rep-1',
      type: 'rep_day_critical',
      title: 'Madiha is critical today',
      body: '11 required actions are incomplete.',
      link: '/admin/command-center',
      dedupeKey: 'escalation:2026-10-30:rep-1:admin-1',
    }

    expect(await notifyOnce(fake.client, payload)).toBe(true)
    expect(await notifyOnce(fake.client, payload)).toBe(false)
    expect(fake.rows).toHaveLength(1)
  })

  it('keeps a distinct key per recipient and per day', async () => {
    const fake = fakeNotifications()
    const base = {
      organizationId: 'org-1',
      recipientId: 'rep-1',
      type: 'rep_day_critical',
      title: 'Critical',
      body: 'Work outstanding.',
      link: '/dashboard',
    }

    expect(await notifyOnce(fake.client, { ...base, dedupeKey: 'escalation:2026-10-30:rep-1:admin-1' })).toBe(true)
    expect(await notifyOnce(fake.client, { ...base, dedupeKey: 'escalation:2026-10-30:rep-1:admin-2' })).toBe(true)
    expect(await notifyOnce(fake.client, { ...base, dedupeKey: 'escalation:2026-10-31:rep-1:admin-1' })).toBe(true)
    expect(fake.rows).toHaveLength(3)
  })

  it('keeps a distinct key per warning state', async () => {
    const fake = fakeNotifications()
    const base = {
      organizationId: 'org-1',
      recipientId: 'rep-1',
      type: 'day_at_risk',
      title: 'At risk',
      body: 'Behind target.',
      link: '/dashboard',
    }

    await notifyOnce(fake.client, { ...base, dedupeKey: 'warning:2026-10-30:rep-1:AT_RISK' })
    await notifyOnce(fake.client, { ...base, dedupeKey: 'warning:2026-10-30:rep-1:CRITICAL' })
    expect(fake.rows).toHaveLength(2)
  })
})
