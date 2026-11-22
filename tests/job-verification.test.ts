import { describe, expect, it } from 'vitest'
import type { DbClient } from '@/lib/db/types'
import { verifyPendingJobs, isJobSpecificUrl } from '@/lib/job-discovery/verify'

const NOW = new Date('2026-11-20T12:00:00.000Z')

function fakeDb(candidates: Array<{ id: string; apply_url: string; evidence?: unknown }>) {
  const updates: Array<{ id: string; params: unknown[] }> = []
  let call = 0
  const db = {
    raw: async (_sql: string, params: unknown[]) => {
      call += 1
      if (call === 1) return { data: candidates, error: null }
      updates.push({ id: String(params[params.length - 1]), params })
      return { data: [], error: null }
    },
  }
  return { db: db as unknown as DbClient, updates }
}

function fetchReturning(status: number | null): typeof fetch {
  return (async () => {
    if (status === null) throw new Error('network down')
    return new Response('ok', { status })
  }) as typeof fetch
}

function fetchWithUrl(status: number, url: string): typeof fetch {
  return (async () => ({ status, url, body: { cancel: () => Promise.resolve() } })) as unknown as typeof fetch
}

describe('isJobSpecificUrl', () => {
  it('distinguishes a job page from a generic careers index', () => {
    expect(isJobSpecificUrl('https://employer.example.com/jobs/123')).toBe(true)
    expect(isJobSpecificUrl('https://employer.example.com/companies/acme/jobs/backend-engineer')).toBe(true)
    expect(isJobSpecificUrl('https://employer.example.com/careers')).toBe(false)
    expect(isJobSpecificUrl('https://employer.example.com/jobs')).toBe(false)
    expect(isJobSpecificUrl('https://employer.example.com/')).toBe(false)
  })
})

describe('verifyPendingJobs', () => {
  it('promotes a live listing to verified_open and records the final destination', async () => {
    const { db, updates } = fakeDb([{ id: 'j1', apply_url: 'https://employer.example.com/jobs/1' }])
    const result = await verifyPendingJobs(db, { now: NOW, limit: 1, fetchFn: fetchReturning(200) })
    expect(result).toMatchObject({ checked: 1, verified: 1, closed: 0, failed: 0 })
    const params = updates[0].params
    expect(params[0]).toBe('verified_open')
    expect(params[1]).toBeNull()
    const evidence = JSON.parse(String(params[3]))
    expect(evidence.at(-1).type).toBe('verified_open')
    expect(evidence.at(-1).http_status).toBe(200)
  })

  it('closes a listing only on an explicit 404', async () => {
    const { db, updates } = fakeDb([{ id: 'j1', apply_url: 'https://employer.example.com/jobs/1' }])
    const result = await verifyPendingJobs(db, { now: NOW, limit: 1, fetchFn: fetchReturning(404) })
    expect(result.closed).toBe(1)
    expect(updates[0].params[0]).toBe('closed')
    expect(updates[0].params[1]).toBe(NOW.toISOString())
  })

  it('never closes a job on an ambiguous check', async () => {
    for (const status of [500, null]) {
      const { db, updates } = fakeDb([{ id: 'j1', apply_url: 'https://employer.example.com/jobs/1' }])
      const result = await verifyPendingJobs(db, { now: NOW, limit: 1, fetchFn: fetchReturning(status) })
      expect(result.failed).toBe(1)
      expect(result.closed).toBe(0)
      expect(updates[0].params[0]).toBe('recently_seen')
      const evidence = JSON.parse(String(updates[0].params[3]))
      expect(evidence.at(-1).type).toBe('check_failed')
    }
  })

  it('never calls a generic careers page confirmed open', async () => {
    const { db, updates } = fakeDb([{ id: 'j1', apply_url: 'https://employer.example.com/careers' }])
    const result = await verifyPendingJobs(db, { now: NOW, limit: 1, fetchFn: fetchWithUrl(200, 'https://employer.example.com/careers') })
    expect(result.verified).toBe(0)
    expect(updates[0].params[0]).toBe('reachable_unconfirmed')
    const evidence = JSON.parse(String(updates[0].params[3]))
    expect(evidence.at(-1).type).toBe('reachable_unconfirmed')
  })

  it('records bot protection as blocked rather than confirmed or closed', async () => {
    for (const status of [403, 429]) {
      const { db, updates } = fakeDb([{ id: 'j1', apply_url: 'https://employer.example.com/jobs/1' }])
      const result = await verifyPendingJobs(db, { now: NOW, limit: 1, fetchFn: fetchReturning(status) })
      expect(result.failed).toBe(1)
      expect(result.verified).toBe(0)
      expect(result.closed).toBe(0)
      expect(updates[0].params[0]).toBe('verification_blocked')
      const evidence = JSON.parse(String(updates[0].params[3]))
      expect(evidence.at(-1).type).toBe('verification_blocked')
    }
  })
})
