import { describe, expect, it } from 'vitest'
import {
  buildCommandTargets,
  buildCommandMatrix,
  buildCommandActions,
  deriveCommandSummary,
} from '@/lib/team/command-center'
import { assembleTeamLive } from '@/lib/admin/team-live'
import { buildTeamProfiles } from '@/lib/team/profiles'
import type { IdentityPlanProgress } from '@/lib/targets/load-plan-progress'
import type { PeopleDirectory } from '@/lib/operations/people'
import type { CanonicalAssignmentSet } from '@/lib/profiles/canonical'
import type { TeamDaySummary } from '@/lib/rep-day/team'
import type { CoveragePlan, CoverageStatus } from '@/lib/coverage/engine'
import type { CommandProfileFact } from '@/lib/team/command-center'

const repNameById = new Map([
  ['r1', 'Ahmad'],
  ['r2', 'Dawood'],
  ['r3', 'Aneeb'],
])

function progressRow(overrides: Partial<IdentityPlanProgress>): IdentityPlanProgress {
  return {
    identityId: 'id-1',
    identityName: 'Aneeb · LinkedIn',
    channel: 'linkedin',
    personId: 'p1',
    personName: 'Aneeb',
    target: 20,
    completed: 8,
    remaining: 12,
    lanes: [
      {
        activityType: 'connection_request',
        label: 'Connections',
        targetCount: 20,
        completedCount: 8,
        remaining: 12,
        targetable: true,
        allocations: [],
      },
    ],
    contributions: [
      { repId: 'r1', completedCount: 5 },
      { repId: 'r2', completedCount: 3 },
    ],
    allocations: [],
    allocated: false,
    hasPlan: true,
    shared: true,
    pace: 'on_track',
    expectedByNow: 10,
    ...overrides,
  }
}

function directory(overrides: Partial<PeopleDirectory>): PeopleDirectory {
  return {
    rows: [],
    teams: [],
    attention: [],
    businessDate: '2026-11-16',
    ...overrides,
  }
}

function canonical(overrides: Partial<CanonicalAssignmentSet>): CanonicalAssignmentSet {
  return {
    businessDate: '2026-11-16',
    ambiguous: [],
    unassigned: [],
    profiles: [],
    ...overrides,
  }
}

function plan(overrides: Partial<CoveragePlan>): CoveragePlan {
  const counts: Record<CoverageStatus, number> = { COVERED: 0, BACKUP_ACTIVE: 0, AT_RISK: 0, UNCOVERED: 0 }
  return {
    businessDate: '2026-11-16',
    isWorkingDay: true,
    coveragePolicy: 'APPROVAL_REQUIRED',
    totalProfiles: 0,
    counts,
    profiles: [],
    requiresApproval: [],
    unchanged: 0,
    ...overrides,
  }
}

function teamDay(): TeamDaySummary {
  return {
    businessDate: '2026-11-16',
    timezone: 'Asia/Karachi',
    isWorkingDay: true,
    workdayProgress: 0.5,
    minutesRemaining: 240,
    workdayStart: '09:00',
    workdayEnd: '18:00',
    counts: { NOT_STARTED: 0, ACTIVE: 2, AT_RISK: 0, CRITICAL: 0, READY_TO_CLOSE: 0, CLOSED: 0, MISSED: 0 },
    totals: { reps: 2, requiredRemaining: 12, commitmentProgress: 0, repliesWaiting: 3, actionsToday: 8, pipelineCreated: 0 },
    reps: [],
  }
}

describe('buildCommandTargets', () => {
  it('counts one shared lane once and names every contributor', () => {
    const rows = buildCommandTargets([progressRow({})], repNameById)
    expect(rows).toHaveLength(1)
    expect(rows[0].target).toBe(20)
    expect(rows[0].completed).toBe(8)
    expect(rows[0].shared).toBe(true)
    expect(rows[0].contributors.map((row) => row.repName)).toEqual(['Ahmad', 'Dawood'])
  })

  it('marks an allocated lane and keeps per-operator shares', () => {
    const row = progressRow({
      allocated: true,
      lanes: [
        {
          activityType: 'connection_request',
          label: 'Connections',
          targetCount: 20,
          completedCount: 8,
          remaining: 12,
          targetable: true,
          allocations: [
            { repId: 'r1', targetCount: 12 },
            { repId: 'r2', targetCount: 8 },
          ],
        },
      ],
      allocations: [
        { repId: 'r1', targetCount: 12 },
        { repId: 'r2', targetCount: 8 },
      ],
    })
    const [target] = buildCommandTargets([row], repNameById)
    expect(target.allocated).toBe(true)
    expect(target.shared).toBe(false)
    expect(target.contributors.find((entry) => entry.repId === 'r1')?.allocation).toBe(12)
  })
})

describe('buildCommandMatrix', () => {
  it('shows every operator on a shared profile and counts the lane target once', () => {
    const set = canonical({
      profiles: [
        {
          profileId: 'p1',
          profileName: 'Aneeb',
          channels: ['linkedin'],
          identityIds: ['id-1'],
          assignedReps: [],
          primaryRepId: 'r3',
          primaryRepName: 'Aneeb',
          primarySource: 'coverage',
          primaryReason: 'Explicit primary coverage',
          backups: [{ repId: 'r2', repName: 'Dawood', priority: 2, source: 'coverage' }],
          operators: [{ repId: 'r1', repName: 'Ahmad', priority: 1, source: 'coverage' }],
          coverageState: 'EXPLICIT',
          needsReview: false,
          reviewReasons: [],
        },
      ],
    })
    const rows = buildCommandMatrix({
      directory: directory({
        rows: [
          { repId: 'r1', repName: 'Ahmad', roleLabel: 'Rep', availability: 'WORKING' },
          { repId: 'r3', repName: 'Aneeb', roleLabel: 'Rep', availability: 'WORKING' },
        ] as PeopleDirectory['rows'],
      }),
      canonical: set,
      progress: [progressRow({})],
    })
    const ahmad = rows.find((row) => row.repId === 'r1')
    const aneeb = rows.find((row) => row.repId === 'r3')
    expect(ahmad?.assignments[0]).toMatchObject({ role: 'OPERATOR', target: 20, contribution: 5, shared: true })
    expect(aneeb?.assignments[0]).toMatchObject({ role: 'PRIMARY', target: 20, contribution: 0 })
  })
})

describe('buildCommandActions', () => {
  it('ranks coverage before assignments and tasks', () => {
    const actions = buildCommandActions({
      plan: plan({
        profiles: [
          { profileId: 'p1', name: 'Aneeb', status: 'UNCOVERED' },
        ] as CoveragePlan['profiles'],
      }),
      canonical: canonical({
        unassigned: [
          { profileId: 'p2', profileName: 'Orphan', channels: ['upwork'] },
        ] as CanonicalAssignmentSet['unassigned'],
      }),
      directory: directory({
        rows: [
          { repId: 'r1', repName: 'Ahmad', overdueTasks: 2, status: 'Critical' },
        ] as PeopleDirectory['rows'],
      }),
      targets: [],
      profiles: [],
    })
    expect(actions[0].category).toBe('coverage')
    expect(actions[0].severity).toBe('critical')
    expect(actions.map((action) => action.category)).toEqual(['coverage', 'assignment', 'task'])
  })
})

describe('deriveCommandSummary', () => {
  it('sums target lanes once and counts unassigned profiles', () => {
    const summary = deriveCommandSummary({
      team: teamDay(),
      plan: plan({ profiles: [{ profileId: 'p1', status: 'UNCOVERED' }] as CoveragePlan['profiles'] }),
      canonical: canonical({
        unassigned: [{ profileId: 'p2', profileName: 'Orphan' }] as CanonicalAssignmentSet['unassigned'],
      }),
      targets: buildCommandTargets([progressRow({})], repNameById),
      profiles: [
        { profileId: 'p1', pendingAcknowledgementRepIds: ['r1'] },
      ] as CommandProfileFact[],    })
    expect(summary.target).toBe(20)
    expect(summary.completed).toBe(8)
    expect(summary.unassignedProfiles).toBe(1)
    expect(summary.unacknowledged).toBe(1)
    expect(summary.coverage.UNCOVERED).toBe(1)
  })
})

describe('shared plan projection', () => {
  it('gives every operator the lane but never double-counts it at profile level', () => {
    const payload = assembleTeamLive({
      now: new Date('2026-11-16T10:00:00.000Z'),
      businessDate: '2026-11-16',
      timezone: 'Asia/Karachi',
      reps: [
        { id: 'r1', name: 'Ahmad', role: 'rep' },
        { id: 'r2', name: 'Dawood', role: 'rep' },
      ],
      identities: [{ id: 'id-1', identity_name: 'Aneeb', channel: 'linkedin', title: null, profile_id: 'p1' }],
      assignments: [
        { revenue_identity_id: 'id-1', rep_id: 'r1' },
        { revenue_identity_id: 'id-1', rep_id: 'r2' },
      ],
      targets: [
        { rep_id: 'r1', revenue_identity_id: 'id-1', activity_type: 'connection_request', target_count: 20, shared: true, allocation: null },
        { rep_id: 'r2', revenue_identity_id: 'id-1', activity_type: 'connection_request', target_count: 20, shared: true, allocation: null },
      ],
      accountability: [
        { rep_id: 'r1', revenue_identity_id: 'id-1', activity_type: 'connection_request', completed_count: 5 },
        { rep_id: 'r2', revenue_identity_id: 'id-1', activity_type: 'connection_request', completed_count: 3 },
      ],
      messages: [],
      leadsToday: [],
      extractions: [],
      openLeads: [],
      profiles: [{ id: 'p1', display_name: 'Aneeb', person_id: null }],
    })

    const ahmad = payload.people.find((person) => person.repId === 'r1')
    const dawood = payload.people.find((person) => person.repId === 'r2')
    expect(ahmad?.goals[0]).toMatchObject({ target: 20, shared: true, personal: 0 })
    expect(ahmad?.sharedTarget).toBe(20)
    expect(ahmad?.totalTarget).toBe(0)
    expect(dawood?.totalCompleted).toBe(3)

    const profiles = buildTeamProfiles(payload)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].targetCount).toBe(20)
  })

  it('uses an allocated share as the personal target', () => {
    const payload = assembleTeamLive({
      now: new Date('2026-11-16T10:00:00.000Z'),
      businessDate: '2026-11-16',
      timezone: 'Asia/Karachi',
      reps: [
        { id: 'r1', name: 'Ahmad', role: 'rep' },
        { id: 'r2', name: 'Dawood', role: 'rep' },
      ],
      identities: [{ id: 'id-1', identity_name: 'Aneeb', channel: 'linkedin', title: null, profile_id: 'p1' }],
      assignments: [
        { revenue_identity_id: 'id-1', rep_id: 'r1' },
        { revenue_identity_id: 'id-1', rep_id: 'r2' },
      ],
      targets: [
        { rep_id: 'r1', revenue_identity_id: 'id-1', activity_type: 'connection_request', target_count: 20, shared: false, allocation: 12 },
        { rep_id: 'r2', revenue_identity_id: 'id-1', activity_type: 'connection_request', target_count: 20, shared: false, allocation: 8 },
      ],
      accountability: [],
      messages: [],
      leadsToday: [],
      extractions: [],
      openLeads: [],
      profiles: [{ id: 'p1', display_name: 'Aneeb', person_id: null }],
    })
    const ahmad = payload.people.find((person) => person.repId === 'r1')
    const dawood = payload.people.find((person) => person.repId === 'r2')
    expect(ahmad?.totalTarget).toBe(12)
    expect(dawood?.totalTarget).toBe(8)
  })
})
