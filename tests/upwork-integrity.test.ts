/**
 * Upwork data-integrity audit: every check must be explainable and the clean
 * case must report zero violations.
 */
import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { auditUpworkIntegrity } from '@/lib/upwork/integrity'

const ORG = '11111111-1111-1111-1111-111111111111'
const REP = 'rep-1'
const IDENTITY = 'ri-upwork-1'

function cleanSeed() {
  return {
    upwork_jobs: [{ id: 'job-1', organization_id: ORG, owner_rep_id: REP, status: 'APPLIED' }],
    upwork_applications: [{
      id: 'app-1', organization_id: ORG, job_id: 'job-1', rep_id: REP, revenue_identity_id: IDENTITY,
      submitted_at: '2026-11-01T09:00:00.000Z', connects_spent: 12, status: 'submitted',
    }],
    revenue_identities: [{ id: IDENTITY, organization_id: ORG, status: 'active', channel: 'upwork' }],
    assigned_tasks: [],
  }
}

describe('auditUpworkIntegrity', () => {
  it('reports zero violations for consistent data', async () => {
    const fake = createFakeSupabase(cleanSeed())
    const report = await auditUpworkIntegrity(fake.client as never, ORG)
    expect(report.violations).toEqual([])
  })

  it('flags an applied job with no application', async () => {
    const seed = cleanSeed()
    seed.upwork_applications = []
    const fake = createFakeSupabase(seed)
    const report = await auditUpworkIntegrity(fake.client as never, ORG)
    expect(report.violations.map((v) => v.code)).toContain('APPLIED_WITHOUT_APPLICATION')
  })

  it('flags a duplicate application for one job', async () => {
    const seed = cleanSeed()
    seed.upwork_applications.push({ ...seed.upwork_applications[0], id: 'app-2' })
    const fake = createFakeSupabase(seed)
    const report = await auditUpworkIntegrity(fake.client as never, ORG)
    expect(report.violations.map((v) => v.code)).toContain('DUPLICATE_APPLICATION')
  })

  it('flags negative connects and a missing submission time', async () => {
    const seed = cleanSeed()
    seed.upwork_applications[0].connects_spent = -3
    seed.upwork_applications[0].submitted_at = null
    const fake = createFakeSupabase(seed)
    const report = await auditUpworkIntegrity(fake.client as never, ORG)
    const codes = report.violations.map((v) => v.code)
    expect(codes).toContain('NEGATIVE_CONNECTS')
    expect(codes).toContain('MISSING_SUBMITTED_AT')
  })

  it('flags an archived identity on an application', async () => {
    const seed = cleanSeed()
    seed.revenue_identities[0].status = 'archived'
    const fake = createFakeSupabase(seed)
    const report = await auditUpworkIntegrity(fake.client as never, ORG)
    expect(report.violations.map((v) => v.code)).toContain('ARCHIVED_IDENTITY')
  })

  it('flags a pending follow-up after the client replied', async () => {
    const seed = cleanSeed()
    seed.upwork_jobs[0].status = 'CLIENT_REPLIED'
    seed.assigned_tasks = [{ id: 'task-1', organization_id: ORG, job_id: 'job-1', kind: 'FOLLOW_UP', status: 'OPEN', assignee_rep_id: REP }]
    const fake = createFakeSupabase(seed)
    const report = await auditUpworkIntegrity(fake.client as never, ORG)
    expect(report.violations.map((v) => v.code)).toContain('PENDING_FOLLOWUP_AFTER_CLOSE')
  })
})
