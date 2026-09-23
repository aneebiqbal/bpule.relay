import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as applyRoute } from '@/app/api/upwork/jobs/[id]/apply/route'

/**
 * Upwork proposal hard gate at score >= 6 (approved product design).
 *
 * Rubric thresholds (src/lib/score/upwork-rubric.ts verdictFor): 6-10 apply,
 * 3-5 apply_if_connects, 0-2 skip. "Mark as applied" is disabled client-side
 * below score 6 (see upwork-job-actions.tsx), but that is a UI convenience
 * only — a disabled button is not a security/business-logic boundary. This
 * route (/api/upwork/jobs/[id]/apply) is the real enforcement point: it must
 * independently look up the job's STORED score (never recompute) and reject
 * with a 4xx, without ever calling markUpworkApplied, when score < 6.
 */

const { createScoutStoreMock } = vi.hoisted(() => ({
  createScoutStoreMock: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  createScoutStore: createScoutStoreMock,
}))

function makeRequest(jobId: string, body: Record<string, unknown> = {}) {
  return new Request(`http://localhost/api/upwork/jobs/${jobId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentText: 'A tailored cover letter.', ...body }),
  })
}

function callRoute(jobId: string, body: Record<string, unknown> = {}) {
  return applyRoute(makeRequest(jobId, body), { params: Promise.resolve({ id: jobId }) })
}

beforeEach(() => {
  createScoutStoreMock.mockReset()
})

describe('POST /api/upwork/jobs/[id]/apply — score >= 6 hard gate', () => {
  it('allows the apply to succeed when the stored score is exactly 6 (the apply threshold)', async () => {
    const markUpworkApplied = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 6, verdict: 'apply' }),
      markUpworkApplied,
    })

    const res = await callRoute('job-1')
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(markUpworkApplied).toHaveBeenCalledTimes(1)
    expect(markUpworkApplied).toHaveBeenCalledWith('job-1', 'A tailored cover letter.', 'cover')
  })

  it('allows the apply to succeed for a high score', async () => {
    const markUpworkApplied = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 9, verdict: 'apply' }),
      markUpworkApplied,
    })

    const res = await callRoute('job-1')
    expect(res.status).toBe(200)
    expect(markUpworkApplied).toHaveBeenCalledTimes(1)
  })

  it('rejects with a 4xx and does NOT call markUpworkApplied when the stored score is below 6', async () => {
    const markUpworkApplied = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 5, verdict: 'apply_if_connects' }),
      markUpworkApplied,
    })

    const res = await callRoute('job-1')
    const data = await res.json()

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(data.error).toMatch(/score below 6/i)
    expect(markUpworkApplied).not.toHaveBeenCalled()
  })

  it('rejects a score of 0 (skip verdict) the same way', async () => {
    const markUpworkApplied = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 0, verdict: 'skip' }),
      markUpworkApplied,
    })

    const res = await callRoute('job-1')
    expect(res.status).toBe(400)
    expect(markUpworkApplied).not.toHaveBeenCalled()
  })

  it('rejects a job with no score yet (null) rather than treating it as passing', async () => {
    const markUpworkApplied = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: null, verdict: null }),
      markUpworkApplied,
    })

    const res = await callRoute('job-1')
    expect(res.status).toBe(400)
    expect(markUpworkApplied).not.toHaveBeenCalled()
  })

  it('returns 404 and never calls markUpworkApplied when the job does not exist', async () => {
    const markUpworkApplied = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue(null),
      markUpworkApplied,
    })

    const res = await callRoute('job-missing')
    expect(res.status).toBe(404)
    expect(markUpworkApplied).not.toHaveBeenCalled()
  })

  it('rejects a request with no sentText before ever touching the store', async () => {
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn(),
      markUpworkApplied: vi.fn(),
    })

    const res = await callRoute('job-1', { sentText: '' })
    expect(res.status).toBe(400)
  })
})
