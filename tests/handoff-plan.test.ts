/**
 * Handoff impact preview — the numbers must be complete before execution.
 */
import { describe, expect, it } from 'vitest'
import { assembleHandoffPlan, type HandoffInput } from '@/lib/handoff/service'

const base: HandoffInput = {
  organizationId: 'org-a',
  fromRepId: 'rep-out',
  toRepId: 'rep-in',
  actorRepId: 'admin',
  coverage: [
    { profileId: 'p1', identityId: 'i1', role: 'PRIMARY', priority: 0 },
    { profileId: 'p2', identityId: 'i2', role: 'OPERATOR', priority: 1 },
  ],
  identities: [],
  allocations: [
    { planId: 'plan1', identityId: 'i1', activityType: 'connection_request', targetCount: 30 },
    { planId: 'plan2', identityId: 'i1', activityType: 'dm', targetCount: 10 },
  ],
  leads: [{ id: 'l1', company: 'Acme', contactName: null, status: 'contacted' }],
  tasks: [
    { id: 't1', title: 'Follow up', kind: 'follow_up', status: 'OPEN', dueAt: null },
    { id: 't2', title: 'Review', kind: 'review', status: 'OPEN', dueAt: null },
  ],
  applications: [{ id: 'a1', jobId: 'j1', profileId: 'p1', status: 'prepared' }],
  preparedJobs: [{ id: 'pj1', jobId: 'j1', profileId: 'p1' }],
  pendingAcknowledgements: [{ profileId: 'p1', subject: 'responsibility_transfer' }],
  accessIssues: [{ profileId: 'p2', note: 'no account access' }],
  effortByKey: { connection_request: 1, dm: 2 },
  replacementExistingMinutes: 60,
}

describe('assembleHandoffPlan', () => {
  it('counts every active workstream', () => {
    const plan = assembleHandoffPlan(base)
    expect(plan).toMatchObject({
      accounts: 2,
      responsibilities: 2,
      targetUnits: 40,
      estimatedMinutes: 110, // 30×1 + 10×2 + existing 60
      leads: 1,
      tasks: 2,
      followUps: 1,
      applications: 1,
      preparedFollowAccess: 1,
      acknowledgementsToCreate: 2,
      accessIssues: 1,
    })
  })

  it('surfaces untansferable items instead of hiding them', () => {
    const plan = assembleHandoffPlan(base)
    expect(plan.untransferable.map((row) => row.kind)).toEqual(['prepared_jobs', 'access_issues'])
  })

  it('blocks a self-transfer and an empty replacement', () => {
    expect(assembleHandoffPlan({ ...base, toRepId: base.fromRepId }).ineligibleReasons.length).toBeGreaterThan(0)
    expect(assembleHandoffPlan({ ...base, toRepId: '' }).ineligibleReasons).toContain('Choose a replacement rep.')
  })

  it('warns on overload without blocking or reducing work', () => {
    const plan = assembleHandoffPlan({ ...base, replacementExistingMinutes: 500 })
    expect(plan.capacityWarnings.join(' ')).toContain('review capacity')
    expect(plan.targetUnits).toBe(40)
    expect(plan.ineligibleReasons).toEqual([])
  })

  it('does not invent utilization when there is no availability data', () => {
    const plan = assembleHandoffPlan(base)
    expect(plan.estimatedMinutes).toBe(110)
    expect(Number.isFinite(plan.estimatedMinutes)).toBe(true)
  })
})
