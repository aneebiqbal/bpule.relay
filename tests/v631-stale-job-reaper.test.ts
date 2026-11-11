/**
 * V6.3.1 — §31 generic stale-running-job reaper.
 *
 * A crashed worker must not strand a job (including DISCOVER_PROSPECTS) in
 * RUNNING forever. The reaper is scheduler-level, not enrichment-specific.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { reapStaleRunningJobs } from '@/lib/scheduler/run'
import { closeNeonPool, neonServiceDbClient } from '@/lib/db/neon'

const ORG = '11111111-1111-1111-1111-111111111111'
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

afterAll(async () => {
  await neonServiceDbClient()
    .from('operational_jobs')
    .delete()
    .eq('organization_id', ORG)
    .like('dedupe_key', `stale-reaper:${RUN}%`)
  await closeNeonPool()
})

async function insertRunningJob(attempt: number, lockedAt: Date): Promise<string> {
  const client = neonServiceDbClient()
  const { data: job, error } = await client
    .from('operational_jobs')
    .insert({
      organization_id: ORG,
      business_date: '2026-11-12',
      job_kind: 'DISCOVER_PROSPECTS',
      time_bucket: 'test',
      dedupe_key: `stale-reaper:${RUN}:${lockedAt.getTime()}:${attempt}`,
      state: 'running',
      attempt,
      max_attempts: 5,
      locked_at: lockedAt.toISOString(),
      next_attempt_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw error
  return job!.id
}

async function stateOf(id: string): Promise<string | null> {
  const { data } = await neonServiceDbClient().from('operational_jobs').select('state').eq('id', id).maybeSingle()
  return (data?.state as string | null) ?? null
}

describe('STALE_JOB_REAPER', () => {
  it('resets an orphaned running job to pending for retry', async () => {
    const now = new Date()
    const jobId = await insertRunningJob(1, new Date(now.getTime() - 30 * 60_000))
    const result = await reapStaleRunningJobs(neonServiceDbClient(), now)
    expect(result.reaped).toBe(1)
    expect(result.deadLettered).toBe(0)
    expect(await stateOf(jobId)).toBe('pending')
  }, 60_000)

  it('dead-letters an orphaned running job past max attempts', async () => {
    const now = new Date()
    const jobId = await insertRunningJob(5, new Date(now.getTime() - 30 * 60_000))
    const result = await reapStaleRunningJobs(neonServiceDbClient(), now)
    expect(result.deadLettered).toBe(1)
    expect(result.reaped).toBe(0)
    expect(await stateOf(jobId)).toBe('dead')
  }, 60_000)

  it('leaves a fresh running job alone', async () => {
    const now = new Date()
    const jobId = await insertRunningJob(1, now)
    const result = await reapStaleRunningJobs(neonServiceDbClient(), now)
    expect(result.reaped).toBe(0)
    expect(result.deadLettered).toBe(0)
    expect(await stateOf(jobId)).toBe('running')
  }, 60_000)
})
