/**
 * Upwork lifecycle sweep: one notification per step, idempotent across runs.
 * Uses the fake DB — no real scheduler, no second reminder engine.
 */
import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { emitUpworkLifecycleNotifications } from '@/lib/upwork/sweep'

const ORG = '11111111-1111-1111-1111-111111111111'
const REP = 'rep-1'
const JOB = 'job-1'

function seed(followUps: Array<{ job_id: string; sent_at: string | null }> = []) {
  return createFakeSupabase({
    upwork_jobs: [{ id: JOB, organization_id: ORG, owner_rep_id: REP, title: 'Senior Rails Engineer', status: 'APPLIED' }],
    upwork_applications: [{
      id: 'app-1', organization_id: ORG, job_id: JOB, rep_id: REP, owner_rep_id: REP,
      submitted_at: '2026-11-01T09:00:00.000Z', first_reply_at: null, status: 'submitted',
    }],
    upwork_messages: followUps.map((row, index) => ({
      id: `fu-${index}`, organization_id: ORG, job_id: row.job_id, rep_id: REP, type: 'followup',
      direction: 'outbound', sent_at: row.sent_at, created_at: row.sent_at ?? '2026-11-05T09:00:00.000Z',
    })),
  })
}

function notifications(fake: ReturnType<typeof createFakeSupabase>) {
  return (fake.tables.notifications ?? []) as Array<{ notification_type: string; dedupe_key: string }>
}

describe('emitUpworkLifecycleNotifications', () => {
  it('notifies follow-up 1 once, then is idempotent across sweeps', async () => {
    const fake = seed()
    const now = new Date('2026-11-10T09:00:00.000Z')

    const first = await emitUpworkLifecycleNotifications(fake.client as never, ORG, now)
    expect(first.followUp1).toBe(1)
    expect(first.followUp2).toBe(0)
    expect(notifications(fake)).toHaveLength(1)
    expect(notifications(fake)[0].dedupe_key).toBe(`upwork_followup_due:${JOB}:1`)

    const second = await emitUpworkLifecycleNotifications(fake.client as never, ORG, now)
    expect(second.followUp1).toBe(0)
    expect(notifications(fake)).toHaveLength(1)
  })

  it('notifies the second follow-up once, never both steps', async () => {
    const fake = seed([{ job_id: JOB, sent_at: '2026-11-05T09:00:00.000Z' }])
    const now = new Date('2026-11-10T09:00:00.000Z')

    const result = await emitUpworkLifecycleNotifications(fake.client as never, ORG, now)
    expect(result.followUp2).toBe(1)
    expect(result.followUp1).toBe(0)
    const rows = notifications(fake)
    expect(rows).toHaveLength(1)
    expect(rows[0].dedupe_key).toBe(`upwork_followup_due:${JOB}:2`)
  })

  it('notifies an archive candidate and does not auto-archive', async () => {
    const fake = seed([
      { job_id: JOB, sent_at: '2026-11-05T09:00:00.000Z' },
      { job_id: JOB, sent_at: '2026-11-09T09:00:00.000Z' },
    ])
    const now = new Date('2026-11-17T09:00:00.000Z')

    const result = await emitUpworkLifecycleNotifications(fake.client as never, ORG, now)
    expect(result.archiveCandidate).toBe(1)
    const rows = notifications(fake)
    expect(rows).toHaveLength(1)
    expect(rows[0].notification_type).toBe('upwork_archive_candidate')

    const job = (fake.tables.upwork_jobs as Array<{ status: string }>).find((row) => row.id === JOB)
    expect(job?.status).toBe('APPLIED')
  })

  it('stays silent once the client replied', async () => {
    const fake = seed()
    ;(fake.tables.upwork_applications as Array<{ first_reply_at: string | null }>)[0].first_reply_at = '2026-11-03T09:00:00.000Z'
    const result = await emitUpworkLifecycleNotifications(fake.client as never, ORG, new Date('2026-11-10T09:00:00.000Z'))
    expect(result).toEqual({ followUp1: 0, followUp2: 0, archiveCandidate: 0 })
    expect(notifications(fake)).toHaveLength(0)
  })
})
