/**
 * SCHEDULER_IDEMPOTENCY
 *
 * Planning is deterministic and the outbox is unique on
 * (organization_id, dedupe_key). A duplicate worker invocation — Vercel retry,
 * overlapping cron, two regions — must be a no-op, not a second warning.
 */
import { describe, expect, it } from 'vitest'
import { normalizePolicy, type OperatingPolicy } from '@/lib/org-clock'
import { dedupeKeyFor, dayStage, planOperationalJobs } from '@/lib/scheduler/plan'

const POLICY: OperatingPolicy = normalizePolicy({
  organizationId: 'org-1',
  timezone: 'Asia/Karachi',
  workdayStart: '09:00',
  workdayEnd: '18:00',
  workingDays: [1, 2, 3, 4, 5],
})

const DATE = '2026-10-30'
const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 30, hour - 5, minute))

describe('SCHEDULER_IDEMPOTENCY — deterministic planning', () => {
  it('produces identical keys when planned twice', () => {
    const first = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(15, 0) })
    const second = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(15, 0) })

    expect(second.map((job) => job.dedupeKey)).toEqual(first.map((job) => job.dedupeKey))
  })

  it('keeps a stable key shape: date, kind, bucket', () => {
    expect(dedupeKeyFor('2026-10-30', 'EMIT_WARNING', 'at_risk')).toBe('2026-10-30:EMIT_WARNING:at_risk')
  })

  it('does not create a job twice for the same stage', () => {
    const jobs = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(15, 5) })
    const keys = jobs.map((job) => job.dedupeKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('moves to a new bucket only when the stage changes', () => {
    const early = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(9, 10) })
    const midday = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(12, 0) })

    const earlyWarning = early.find((job) => job.jobKind === 'EMIT_WARNING')
    const middayWarning = midday.find((job) => job.jobKind === 'EMIT_WARNING')
    expect(earlyWarning?.timeBucket).toBe('early')
    expect(middayWarning?.timeBucket).toBe('midday')
    expect(earlyWarning?.dedupeKey).not.toBe(middayWarning?.dedupeKey)
  })

  it('plans nothing on a non-working day', () => {
    expect(planOperationalJobs({ policy: POLICY, businessDate: '2026-10-31', now: at(12, 0) })).toEqual([])
  })
})

describe('SCHEDULER_IDEMPOTENCY — stage boundaries', () => {
  it('classifies the workday into five stages', () => {
    const thresholds = POLICY.warningThresholds
    expect(dayStage(0.1, thresholds)).toBe('early')
    expect(dayStage(0.3, thresholds)).toBe('midday')
    expect(dayStage(0.8, thresholds)).toBe('at_risk')
    expect(dayStage(0.95, thresholds)).toBe('final')
    expect(dayStage(1, thresholds)).toBe('end')
  })

  it('always plans the day open and the rep-day refresh', () => {
    const jobs = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(10, 0) })
    expect(jobs.map((job) => job.jobKind)).toContain('OPEN_DAY')
    expect(jobs.map((job) => job.jobKind)).toContain('EVALUATE_REP_DAY')
  })

  it('plans the missed-day close and carryover only at the end', () => {
    const midday = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(12, 0) })
    const end = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(18, 5) })

    expect(midday.map((job) => job.jobKind)).not.toContain('CLOSE_MISSED_DAY')
    expect(end.map((job) => job.jobKind)).toContain('CLOSE_MISSED_DAY')
    expect(end.map((job) => job.jobKind)).toContain('PREPARE_CARRYOVER')
  })
})

describe('SCHEDULER_IDEMPOTENCY — the outbox unique key', () => {
  it('collapses duplicate keys the way the database does', () => {
    // Mirrors `unique (organization_id, dedupe_key)` with ignoreDuplicates.
    const outbox = new Map<string, number>()
    const plan = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(16, 30) })

    for (let run = 0; run < 3; run += 1) {
      for (const job of plan) {
        const key = `${job.organizationId}:${job.dedupeKey}`
        outbox.set(key, (outbox.get(key) ?? 0) + 1)
      }
    }

    expect(outbox.size).toBe(plan.length)
    expect([...outbox.values()].every((count) => count === 3)).toBe(true)
  })

  it('scopes the key by organization so two orgs never collide', () => {
    const other = normalizePolicy({ organizationId: 'org-2', timezone: 'Asia/Karachi' })
    const a = planOperationalJobs({ policy: POLICY, businessDate: DATE, now: at(15, 0) })
    const b = planOperationalJobs({ policy: other, businessDate: DATE, now: at(15, 0) })

    const keysA = new Set(a.map((job) => `${job.organizationId}:${job.dedupeKey}`))
    const keysB = new Set(b.map((job) => `${job.organizationId}:${job.dedupeKey}`))
    for (const key of keysB) expect(keysA.has(key)).toBe(false)
  })
})
