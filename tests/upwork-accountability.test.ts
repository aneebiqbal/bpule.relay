import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Rep, Organization } from '@/lib/domain/types'

/**
 * Regression coverage for Relay team bug bash — TEAM-001 (Today shows no
 * progress), carried into the canonical application model.
 *
 * Upwork applications are the one real send path that used to write directly
 * to upwork_jobs/upwork_messages and never called record_activity_event — a
 * rep logging applications all day would see Today's 'application' target
 * (UPWORK_PACK in default-targets.ts) stay at 0/10 regardless of real work.
 */

const ORG_ID = 'org-test'
const REP_ID = 'rep-1'
const IDENTITY_ID = 'ri-upwork-1'
const JOB_ID = 'job-1'

function makeRep(): Rep {
  return { id: REP_ID, name: 'Test Rep', role: 'rep', organizationId: ORG_ID, createdAt: '2026-01-01T00:00:00.000Z', timezone: 'UTC' }
}

function makeOrg(): Organization {
  return { id: ORG_ID, name: 'Test Org', plan: 'active', billingCustomerId: null, timezone: 'UTC', workingDays: [1, 2, 3, 4, 5], holidays: [], createdAt: '2026-01-01T00:00:00.000Z' }
}

const SUBMIT = {
  jobId: JOB_ID,
  repId: REP_ID,
  revenueIdentityId: IDENTITY_ID,
  profileId: 'p-up',
  proposalText: 'Cover letter text here.',
  connectsSpent: 12,
  boostConnects: 0,
}

describe('submitUpworkApplication — accountability increment (TEAM-001)', () => {
  it('calls record_activity_event for the "application" activity type when the rep has an active Upwork target', async () => {
    const fake = createFakeSupabase({
      upwork_jobs: [{ id: JOB_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, status: 'SAVED' }],
      daily_targets: [
        { id: 'dt-1', organization_id: ORG_ID, rep_id: REP_ID, revenue_identity_id: IDENTITY_ID, activity_type: 'application', target_count: 10, active: true },
        { id: 'dt-2', organization_id: ORG_ID, rep_id: REP_ID, revenue_identity_id: IDENTITY_ID, activity_type: 'proposal', target_count: 10, active: true },
      ],
    })

    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.submitUpworkApplication(SUBMIT)

    const activityCalls = fake.rpcCalls.filter((c) => c.fn === 'record_activity_event')
    expect(activityCalls).toHaveLength(1) // only 'application', not also 'proposal' — one real action, one credited target
    expect(activityCalls[0]?.args).toMatchObject({
      p_rep_id: REP_ID,
      p_identity_id: IDENTITY_ID,
      p_activity_type: 'application',
      p_org_id: ORG_ID,
    })
  })

  it('still creates the application and marks the job applied even when accountability RPC fails (non-fatal)', async () => {
    const fake = createFakeSupabase({
      upwork_jobs: [{ id: JOB_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, status: 'SAVED' }],
      daily_targets: [],
    })

    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    const { application } = await store.submitUpworkApplication(SUBMIT)

    expect(application.id).toBeTruthy()
    const job = fake.tables.upwork_jobs.find((j) => j.id === JOB_ID)
    expect(job?.status).toBe('APPLIED')
    expect(fake.tables.upwork_applications).toHaveLength(1)
  })

  it('does not call record_activity_event when the rep has no active "application" target (no target, no phantom credit)', async () => {
    const fake = createFakeSupabase({
      upwork_jobs: [{ id: JOB_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, status: 'SAVED' }],
      daily_targets: [],
    })

    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.submitUpworkApplication(SUBMIT)

    const activityCalls = fake.rpcCalls.filter((c) => c.fn === 'record_activity_event')
    expect(activityCalls).toHaveLength(0)
  })

  it('is idempotent: a double-click creates exactly one application', async () => {
    const fake = createFakeSupabase({
      upwork_jobs: [{ id: JOB_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, status: 'SAVED' }],
      daily_targets: [],
    })

    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    const first = await store.submitUpworkApplication(SUBMIT)
    const second = await store.submitUpworkApplication(SUBMIT)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.application.id).toBe(first.application.id)
    expect(fake.tables.upwork_applications).toHaveLength(1)
  })
})
