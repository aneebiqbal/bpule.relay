import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as applyRoute } from '@/app/api/upwork/jobs/[id]/apply/route'

/**
 * Upwork application hard gate at score >= 6 (approved product design).
 *
 * Rubric thresholds (src/lib/score/upwork-rubric.ts verdictFor): 6-10 apply,
 * 3-5 apply_if_connects, 0-2 skip. This route is the real enforcement point:
 * it must independently look up the job's STORED score (never recompute) and
 * reject with a 4xx, without ever submitting an application, when score < 6.
 */

const { createScoutStoreMock, listAssignedProfilesMock } = vi.hoisted(() => ({
  createScoutStoreMock: vi.fn(),
  listAssignedProfilesMock: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  createScoutStore: createScoutStoreMock,
}))

vi.mock('@/lib/auth/organization', () => ({
  getAuthContext: vi.fn().mockResolvedValue({
    repId: 'rep-1',
    orgId: 'org-1',
    isAdmin: false,
    isOwner: false,
    isManager: false,
  }),
}))

// The apply route reauthorizes the sender profile against the acting rep's
// eligible Upwork profiles before persisting it.
vi.mock('@/lib/profiles/assigned-profiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/profiles/assigned-profiles')>()
  return {
    ...actual,
    listAssignedProfiles: listAssignedProfilesMock,
    listAssignedProfilesForRep: vi.fn().mockResolvedValue([]),
  }
})

function makeRequest(jobId: string, body: Record<string, unknown> = {}) {
  return new Request(`http://localhost/api/upwork/jobs/${jobId}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposalText: 'A tailored cover letter.', ...body }),
  })
}

function callRoute(jobId: string, body: Record<string, unknown> = {}) {
  return applyRoute(makeRequest(jobId, body), { params: Promise.resolve({ id: jobId }) })
}

beforeEach(() => {
  createScoutStoreMock.mockReset()
  listAssignedProfilesMock.mockResolvedValue([
    {
      profile: { id: 'p-up' },
      channels: ['upwork'],
      assignedIdentityIds: ['ri-up'],
      assignmentIds: ['a-up'],
    },
  ])
})

describe('POST /api/upwork/jobs/[id]/apply — score >= 6 hard gate', () => {
  it('allows the apply to succeed when the stored score is exactly 6 (the apply threshold)', async () => {
    const submitUpworkApplication = vi.fn().mockResolvedValue({ id: 'app-1', status: 'submitted' })
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 6, verdict: 'apply', organizationId: 'org-1', ownerRepId: 'rep-1', title: 'Job' }),
      getSupabaseClient: vi.fn().mockReturnValue({}),
      submitUpworkApplication,
    })

    const res = await callRoute('job-1')
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(submitUpworkApplication).toHaveBeenCalledTimes(1)
    expect(submitUpworkApplication).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      repId: 'rep-1',
      proposalText: 'A tailored cover letter.',
      profileId: 'p-up',
      revenueIdentityId: 'ri-up',
    }))
  })

  it('allows the apply to succeed for a high score', async () => {
    const submitUpworkApplication = vi.fn().mockResolvedValue({ id: 'app-1', status: 'submitted' })
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 9, verdict: 'apply', organizationId: 'org-1', ownerRepId: 'rep-1', title: 'Job' }),
      getSupabaseClient: vi.fn().mockReturnValue({}),
      submitUpworkApplication,
    })

    const res = await callRoute('job-1')
    expect(res.status).toBe(200)
    expect(submitUpworkApplication).toHaveBeenCalledTimes(1)
  })

  it('rejects with a 4xx and does NOT submit when the stored score is below 6', async () => {
    const submitUpworkApplication = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 5, verdict: 'apply_if_connects', organizationId: 'org-1', ownerRepId: 'rep-1', title: 'Job' }),
      submitUpworkApplication,
    })

    const res = await callRoute('job-1')
    const data = await res.json()

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(data.error).toMatch(/score below 6/i)
    expect(submitUpworkApplication).not.toHaveBeenCalled()
  })

  it('rejects a score of 0 (skip verdict) the same way', async () => {
    const submitUpworkApplication = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 0, verdict: 'skip', organizationId: 'org-1', ownerRepId: 'rep-1', title: 'Job' }),
      submitUpworkApplication,
    })

    const res = await callRoute('job-1')
    expect(res.status).toBe(400)
    expect(submitUpworkApplication).not.toHaveBeenCalled()
  })

  it('rejects a job with no score yet (null) rather than treating it as passing', async () => {
    const submitUpworkApplication = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: null, verdict: null, organizationId: 'org-1', ownerRepId: 'rep-1', title: 'Job' }),
      submitUpworkApplication,
    })

    const res = await callRoute('job-1')
    expect(res.status).toBe(400)
    expect(submitUpworkApplication).not.toHaveBeenCalled()
  })

  it('returns 404 and never submits when the job does not exist', async () => {
    const submitUpworkApplication = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue(null),
      submitUpworkApplication,
    })

    const res = await callRoute('job-missing')
    expect(res.status).toBe(404)
    expect(submitUpworkApplication).not.toHaveBeenCalled()
  })

  it('rejects a request with no proposal text before ever touching the store', async () => {
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn(),
      submitUpworkApplication: vi.fn(),
    })

    const res = await callRoute('job-1', { proposalText: '' })
    expect(res.status).toBe(400)
  })

  it('rejects a job owned by another rep', async () => {
    const submitUpworkApplication = vi.fn().mockResolvedValue(undefined)
    createScoutStoreMock.mockResolvedValue({
      getUpworkJob: vi.fn().mockResolvedValue({ id: 'job-1', score: 9, organizationId: 'org-1', ownerRepId: 'rep-2', title: 'Job' }),
      submitUpworkApplication,
    })

    const res = await callRoute('job-1')
    expect(res.status).toBe(403)
    expect(submitUpworkApplication).not.toHaveBeenCalled()
  })
})
