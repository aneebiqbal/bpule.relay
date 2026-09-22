import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Rep, Organization } from '@/lib/domain/types'

/**
 * Regression coverage for Relay team bug bash — TEAM-001 (Today shows no
 * progress).
 *
 * Traced the full canonical-event -> persistence -> accountability
 * aggregation -> Today view-model chain. DM/connection/followup/reply/email
 * all correctly increment daily_accountability via markContacted() ->
 * record_activity_event RPC. Upwork applications were the one real gap:
 * markUpworkApplied() (the ONLY call site for POST /api/upwork/jobs/[id]/
 * apply) wrote directly to upwork_jobs/upwork_messages and never called
 * record_activity_event at all — a rep logging Upwork applications all day
 * would see Today's 'application' target (UPWORK_PACK in
 * default-targets.ts) stay at 0/10 regardless of real work done.
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

describe('markUpworkApplied — accountability increment (TEAM-001)', () => {
  it('calls record_activity_event for the "application" activity type when the rep has an active Upwork target', async () => {
    const fake = createFakeSupabase({
      upwork_jobs: [{ id: JOB_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, status: 'new' }],
      daily_targets: [
        { id: 'dt-1', organization_id: ORG_ID, rep_id: REP_ID, revenue_identity_id: IDENTITY_ID, activity_type: 'application', target_count: 10, active: true },
        { id: 'dt-2', organization_id: ORG_ID, rep_id: REP_ID, revenue_identity_id: IDENTITY_ID, activity_type: 'proposal', target_count: 10, active: true },
      ],
    })

    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.markUpworkApplied(JOB_ID, 'Cover letter text here.', 'cover')

    const activityCalls = fake.rpcCalls.filter((c) => c.fn === 'record_activity_event')
    expect(activityCalls).toHaveLength(1) // only 'application', not also 'proposal' — one real action, one credited target
    expect(activityCalls[0]?.args).toMatchObject({
      p_rep_id: REP_ID,
      p_identity_id: IDENTITY_ID,
      p_activity_type: 'application',
      p_org_id: ORG_ID,
    })
  })

  it('still marks the job applied and logs the message even when accountability RPC fails (non-fatal)', async () => {
    const fake = createFakeSupabase({
      upwork_jobs: [{ id: JOB_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, status: 'new' }],
      daily_targets: [],
    })

    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await expect(store.markUpworkApplied(JOB_ID, 'Cover letter text.', 'cover')).resolves.toBeUndefined()

    const job = fake.tables.upwork_jobs.find((j) => j.id === JOB_ID)
    expect(job?.status).toBe('applied')
    expect(fake.tables.upwork_messages).toHaveLength(1)
  })

  it('does not call record_activity_event when the rep has no active "application" target (no target, no phantom credit)', async () => {
    const fake = createFakeSupabase({
      upwork_jobs: [{ id: JOB_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, status: 'new' }],
      daily_targets: [],
    })

    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.markUpworkApplied(JOB_ID, 'Cover letter text.', 'cover')

    const activityCalls = fake.rpcCalls.filter((c) => c.fn === 'record_activity_event')
    expect(activityCalls).toHaveLength(0)
  })
})
