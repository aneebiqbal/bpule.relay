/**
 * Transactional and concurrency contracts for Work Setup.
 *
 * The fake's `transaction()` snapshots and restores the whole state, so these
 * tests prove that a failure at ANY dependent step rolls every earlier write
 * back — coverage, eligibility, targets, allocations and audit together.
 */
import { describe, expect, it } from 'vitest'
import type { DbClient } from '@/lib/db/types'
import { saveWorkSetup } from '@/lib/operations/work-setup-write'
import { createFakeSupabase } from './helpers/fake-supabase'

const ORG = '11111111-1111-1111-1111-111111111111'
const IDENTITY = 'id-account'
const PROFILE = 'profile-1'
const PRIMARY = 'rep-primary'
const OPERATOR = 'rep-operator'
const BACKUP = 'rep-backup'

function seed() {
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
      { id: 'pc-1', organization_id: ORG, profile_id: PROFILE, rep_id: PRIMARY, role: 'PRIMARY', priority: 1, active: true, updated_at: '2026-01-01T00:00:00Z' },
    ],
    identity_assignments: [
      { id: 'ia-1', organization_id: ORG, revenue_identity_id: IDENTITY, rep_id: PRIMARY, assigned_by: 'admin', updated_at: '2026-01-01T00:00:00Z' },
    ],
    daily_target_plans: [
      { id: 'plan-1', organization_id: ORG, revenue_identity_id: IDENTITY, activity_type: 'dm', target_count: 10, targetable: true, active: true, updated_at: '2026-01-01T00:00:00Z' },
    ],
    daily_plan_allocations: [],
    accountability_audit_log: [],
    responsibility_acknowledgements: [],
  })
}

function input(expectedRevision?: string) {
  return {
    orgId: ORG,
    identityId: IDENTITY,
    primaryRepId: PRIMARY,
    operators: [{ repId: OPERATOR }],
    backups: [{ repId: BACKUP }],
    actorRepId: PRIMARY,
    targets: [{ activityType: 'dm' as const, targetCount: 20 }],
    allocations: [{ activityType: 'dm' as const, repId: OPERATOR, targetCount: 8 }],
    expectedRevision,
  }
}

function run(fake: ReturnType<typeof seed>, expectedRevision?: string) {
  return saveWorkSetup(fake.client as unknown as DbClient, input(expectedRevision))
}

describe('saveWorkSetup atomicity', () => {
  it('commits coverage, targets, allocations and audit together', async () => {
    const fake = seed()
    const result = await run(fake)
    expect(result.ok).toBe(true)
    const roles = fake.tables.profile_coverage.filter((row) => row.active).map((row) => row.role).sort()
    expect(roles).toEqual(['BACKUP', 'OPERATOR', 'PRIMARY'])
    expect(
      fake.tables.daily_plan_allocations.some((row) => row.active && row.rep_id === OPERATOR && row.target_count === 8),
    ).toBe(true)
    expect(fake.tables.daily_target_plans.find((row) => row.id === 'plan-1')?.target_count).toBe(20)
    expect(fake.tables.accountability_audit_log).toHaveLength(1)
    expect(fake.tables.coverage_events).toHaveLength(1)
  })

  it('rolls everything back when the allocation insert fails', async () => {
    const fake = seed()
    const before = JSON.stringify(fake.tables)
    fake.setFailOn({ table: 'daily_plan_allocations', op: 'insert' })
    const result = await run(fake)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(fake.tables)).toBe(before)
  })

  it('rolls back a committed target upsert when a later allocation fails', async () => {
    const fake = seed()
    const beforePlan = fake.tables.daily_target_plans.find((row) => row.id === 'plan-1')?.target_count
    fake.setFailOn({ table: 'daily_plan_allocations', op: 'insert' })
    const result = await run(fake)
    expect(result.ok).toBe(false)
    expect(fake.tables.daily_target_plans.find((row) => row.id === 'plan-1')?.target_count).toBe(beforePlan)
  })

  it('rolls back coverage and eligibility when the audit insert fails', async () => {
    const fake = seed()
    const before = JSON.stringify(fake.tables)
    fake.setFailOn({ table: 'accountability_audit_log', op: 'insert' })
    const result = await run(fake)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(fake.tables)).toBe(before)
  })

  it('rolls back coverage when eligibility synchronization fails', async () => {
    const fake = seed()
    const before = JSON.stringify(fake.tables)
    fake.setFailOn({ table: 'identity_assignments', op: 'upsert' })
    const result = await run(fake)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(fake.tables)).toBe(before)
  })
})

describe('saveWorkSetup optimistic concurrency', () => {
  it('returns a typed CONFLICT and preserves committed state on a stale revision', async () => {
    const fake = seed()
    const before = JSON.stringify(fake.tables)
    const result = await run(fake, 'stale-revision')
    expect(result.ok).toBe(false)
    expect(result.code).toBe('CONFLICT')
    expect(result.error).toMatch(/changed by someone else/i)
    expect(JSON.stringify(fake.tables)).toBe(before)
  })

  it('accepts a matching revision', async () => {
    const fake = seed()
    const { computeAccountRevision } = await import('@/lib/operations/work-setup-write')
    const revision = await computeAccountRevision(fake.client as unknown as DbClient, ORG, IDENTITY, PROFILE)
    expect(revision).toBeTruthy()
    const result = await run(fake, revision!)
    expect(result.ok).toBe(true)
  })
})
