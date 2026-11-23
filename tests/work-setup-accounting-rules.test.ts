/**
 * Allocation rule regressions:
 *   R-09 — a solo-seat lane carrying an explicit allocation must not count the
 *          full lane target as `assigned`;
 *   R-10 — omitted / empty / supplied allocation lists have distinct meaning;
 *   R-11 — an allocation may only name a rep holding an executable seat.
 */
import { describe, expect, it } from 'vitest'
import type { DbClient } from '@/lib/db/types'
import { getOrganizationDailySummary } from '@/lib/execution/accountability'
import { saveWorkSetup } from '@/lib/operations/work-setup-write'
import { createFakeSupabase } from './helpers/fake-supabase'

const ORG = '11111111-1111-1111-1111-111111111111'
const IDENTITY = 'id-account'
const PROFILE = 'profile-1'
const PLAN = 'plan-dm'
const PRIMARY = 'rep-primary'
const OPERATOR = 'rep-operator'
const BACKUP = 'rep-backup'
const TODAY = '2026-11-23'

function dbSeed() {
  return createFakeSupabase({
    revenue_identities: [
      { id: IDENTITY, organization_id: ORG, profile_id: PROFILE, identity_name: 'Acct', channel: 'linkedin', status: 'active' },
    ],
    reps: [
      { id: PRIMARY, organization_id: ORG },
      { id: OPERATOR, organization_id: ORG },
      { id: BACKUP, organization_id: ORG },
    ],
    profile_coverage: [
      { id: 'pc-1', organization_id: ORG, profile_id: PROFILE, rep_id: PRIMARY, role: 'PRIMARY', priority: 1, active: true },
      { id: 'pc-2', organization_id: ORG, profile_id: PROFILE, rep_id: OPERATOR, role: 'OPERATOR', priority: 1, active: true },
    ],
    daily_target_plans: [
      { id: PLAN, organization_id: ORG, revenue_identity_id: IDENTITY, activity_type: 'dm', target_count: 30, targetable: true, active: true, effective_from: '2026-01-01', effective_until: null },
    ],
    daily_plan_allocations: [],
  })
}

describe('R-09 solo-seat lane with an explicit allocation', () => {
  it('counts the allocation as assigned, not the full lane target', async () => {
    const fake = createFakeSupabase({
      revenue_identities: [{ id: IDENTITY, organization_id: ORG, profile_id: PROFILE, identity_name: 'Acct', channel: 'linkedin', status: 'active' }],
      reps: [{ id: PRIMARY, organization_id: ORG, name: 'Primary' }],
      profile_coverage: [{ id: 'pc-1', organization_id: ORG, profile_id: PROFILE, rep_id: PRIMARY, role: 'PRIMARY', priority: 1, active: true }],
      daily_target_plans: [
        { id: PLAN, organization_id: ORG, revenue_identity_id: IDENTITY, activity_type: 'dm', target_count: 30, targetable: true, active: true, effective_from: '2026-01-01', effective_until: null },
      ],
      daily_plan_allocations: [{ id: 'a1', organization_id: ORG, plan_id: PLAN, rep_id: PRIMARY, target_count: 10, active: true }],
    })
    const summary = await getOrganizationDailySummary(fake.client as unknown as DbClient, { orgId: ORG, businessDate: TODAY })
    expect(summary.requirement).toBe(30)
    expect(summary.tracked).toBe(30)
    // The personal expectation is the explicit allocation, not the lane target.
    expect(summary.reps.find((rep) => rep.repId === PRIMARY)?.assigned).toBe(10)
    expect(summary.assigned).toBe(10)
    expect(summary.unseatedAllocationUnits).toBe(0)
    // Invariant: personal = assigned - unseated.
    const personal = summary.reps.reduce((sum, rep) => sum + rep.assigned, 0)
    expect(personal).toBe(summary.assigned - summary.unseatedAllocationUnits)
  })
})

describe('R-10 allocation list semantics', () => {
  function seedWithAllocation() {
    return createFakeSupabase({
      revenue_identities: [{ id: IDENTITY, organization_id: ORG, profile_id: PROFILE, identity_name: 'Acct', channel: 'linkedin', status: 'active' }],
      reps: [
        { id: PRIMARY, organization_id: ORG },
        { id: OPERATOR, organization_id: ORG },
        { id: BACKUP, organization_id: ORG },
      ],
      profile_coverage: [
        { id: 'pc-1', organization_id: ORG, profile_id: PROFILE, rep_id: PRIMARY, role: 'PRIMARY', priority: 1, active: true },
        { id: 'pc-2', organization_id: ORG, profile_id: PROFILE, rep_id: OPERATOR, role: 'OPERATOR', priority: 1, active: true },
      ],
      daily_target_plans: [
        { id: PLAN, organization_id: ORG, revenue_identity_id: IDENTITY, activity_type: 'dm', target_count: 30, targetable: true, active: true },
      ],
      daily_plan_allocations: [
        { id: 'a1', organization_id: ORG, plan_id: PLAN, rep_id: OPERATOR, target_count: 8, active: true, created_by: PRIMARY },
      ],
      responsibility_acknowledgements: [],
    })
  }

  const base = {
    orgId: ORG,
    identityId: IDENTITY,
    primaryRepId: PRIMARY,
    operators: [{ repId: OPERATOR }],
    backups: [{ repId: BACKUP }],
    actorRepId: PRIMARY,
  }

  it('omitted allocations leave the existing shares untouched', async () => {
    const fake = seedWithAllocation()
    const result = await saveWorkSetup(fake.client as unknown as DbClient, {
      ...base,
      targets: [{ activityType: 'dm', targetCount: 30 }],
    })
    expect(result.ok).toBe(true)
    expect(fake.tables.daily_plan_allocations.filter((row) => row.active)).toHaveLength(1)
    expect(fake.tables.daily_plan_allocations.find((row) => row.active)?.target_count).toBe(8)
  })

  it('an empty list clears the affected lane', async () => {
    const fake = seedWithAllocation()
    const result = await saveWorkSetup(fake.client as unknown as DbClient, {
      ...base,
      targets: [{ activityType: 'dm', targetCount: 30 }],
      allocations: [],
    })
    expect(result.ok).toBe(true)
    expect(fake.tables.daily_plan_allocations.filter((row) => row.active)).toHaveLength(0)
  })

  it('supplied allocations replace the existing shares', async () => {
    const fake = seedWithAllocation()
    const result = await saveWorkSetup(fake.client as unknown as DbClient, {
      ...base,
      targets: [{ activityType: 'dm', targetCount: 30 }],
      allocations: [{ activityType: 'dm', repId: OPERATOR, targetCount: 12 }],
    })
    expect(result.ok).toBe(true)
    const active = fake.tables.daily_plan_allocations.filter((row) => row.active)
    expect(active).toHaveLength(1)
    expect(active[0].target_count).toBe(12)
  })
})

describe('R-11 unseated allocations', () => {
  it('rejects an allocation naming a backup-only rep', async () => {
    const fake = dbSeed()
    const result = await saveWorkSetup(fake.client as unknown as DbClient, {
      orgId: ORG,
      identityId: IDENTITY,
      primaryRepId: PRIMARY,
      operators: [{ repId: OPERATOR }],
      backups: [{ repId: BACKUP }],
      actorRepId: PRIMARY,
      targets: [{ activityType: 'dm', targetCount: 30 }],
      allocations: [{ activityType: 'dm', repId: BACKUP, targetCount: 5 }],
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/executable seat/i)
    expect(fake.tables.daily_plan_allocations.filter((row) => row.active)).toHaveLength(0)
  })
})
