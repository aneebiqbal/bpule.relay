import { describe, expect, it } from 'vitest'
import {
  PROFILE_STATUS_LABEL,
  PROFILE_STATUS_TONE,
  REP_STATE_LABEL,
  REP_STATE_TONE,
  buildAdminMovementRows,
  buildAdminProfileExecutionRows,
  buildAdminTeamOperationRows,
} from '@/lib/admin/v3-command-present'
import { buildProfileAttentionSignals, type AdminProfileExecutionRow } from '@/lib/team/admin-command-summary'
import type { ManagerTeamRow } from '@/lib/team/manager-home-summary'
import type { TeamDaySummary } from '@/lib/rep-day/team'

function profile(overrides: Partial<AdminProfileExecutionRow> = {}): AdminProfileExecutionRow {
  return {
    profileId: 'p1',
    name: 'Hassan',
    channels: ['linkedin'],
    assignedReps: ['Dawood'],
    targetCount: 18,
    completedCount: 12,
    remaining: 6,
    status: 'ON_TRACK',
    followUps: 0,
    proposals: 0,
    ...overrides,
  }
}

function teamRow(overrides: Partial<ManagerTeamRow> = {}): ManagerTeamRow {
  return {
    repId: 'r1',
    repName: 'Dawood',
    activeProfile: 'Hassan',
    channel: 'linkedin',
    completedToday: 14,
    repliesWaiting: 20,
    followUpsOverdue: 4,
    highPriority: 1,
    overdueTasks: 2,
    meetings: 0,
    wins: 0,
    targetPct: 52,
    totalTarget: 27,
    status: 'Attention',
    ...overrides,
  }
}

const teamDay: TeamDaySummary = {
  businessDate: '2026-11-06',
  timezone: 'Asia/Karachi',
  isWorkingDay: true,
  workdayProgress: 0.4,
  minutesRemaining: 420,
  workdayStart: '12:00',
  workdayEnd: '23:59',
  counts: { NOT_STARTED: 0, ACTIVE: 1, AT_RISK: 0, CRITICAL: 0, READY_TO_CLOSE: 0, CLOSED: 0, MISSED: 0 },
  totals: { reps: 1, requiredRemaining: 13, commitmentProgress: 0.52, repliesWaiting: 20, actionsToday: 14, pipelineCreated: 0 },
  reps: [
    {
      repId: 'r1',
      repName: 'Dawood',
      repRole: 'rep',
      state: 'AT_RISK',
      checkInAt: null,
      closedAt: null,
      lateStart: false,
      exceptionState: 'NONE',
      commitmentProgress: 0.52,
      requiredRemaining: 13,
      minutesRemaining: 420,
      repliesWaiting: 20,
      actionsToday: 14,
      pipelineCreated: 0,
      lastActivityAt: null,
      identities: [
        { id: 'i1', name: 'Hassan', channel: 'linkedin' },
        { id: 'i2', name: 'Aneeb', channel: 'upwork' },
      ],
    },
  ],
}

describe('ADMIN V4 command present', () => {
  it('PROFILE_ATTENTION signals only real exceptions', () => {
    const signals = buildProfileAttentionSignals([
      profile({ profileId: 'a', name: 'Aneeb', targetCount: 8, completedCount: 0, status: 'NOT_STARTED' }),
      profile({ profileId: 'b', name: 'Hassan', targetCount: 18, completedCount: 12, remaining: 6, status: 'AT_RISK' }),
      profile({ profileId: 'c', name: 'Done', targetCount: 10, completedCount: 10, remaining: 0, status: 'COMPLETE' }),
      profile({ profileId: 'd', name: 'No target', targetCount: 0, completedCount: 0, status: null }),
    ])
    expect(signals).toHaveLength(2)
    expect(signals[0].category).toBe('PROFILE_NOT_STARTED')
    expect(signals[0].reason).toContain('0 / 8')
    expect(signals[0].repName).toBe('Aneeb')
    expect(signals[0].subject).toBe('Dawood')
    expect(signals[1].category).toBe('PROFILE_BEHIND')
    expect(signals[1].severity).toBe('critical')
    expect(signals[1].repName).toBe('Hassan')
    expect(signals[1].subject).toBe('Dawood')
  })

  it('PROFILE_EXECUTION rows sort most urgent first', () => {
    const rows = buildAdminProfileExecutionRows([
      profile({ profileId: 'c', name: 'Complete', status: 'COMPLETE', completedCount: 10, targetCount: 10, remaining: 0 }),
      profile({ profileId: 'a', name: 'Not started', status: 'NOT_STARTED', completedCount: 0, remaining: 8 }),
      profile({ profileId: 'b', name: 'At risk', status: 'AT_RISK', completedCount: 4, remaining: 14 }),
    ])
    expect(rows.map((row) => row.profileId)).toEqual(['a', 'b', 'c'])
    expect(PROFILE_STATUS_LABEL[rows[0].status!]).toBe('Not started')
    expect(PROFILE_STATUS_TONE.AT_RISK).toBe('danger')
  })

  it('TEAM_OPERATION rows join rep-day state, profiles and remaining work', () => {
    const rows = buildAdminTeamOperationRows([teamRow()], teamDay)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.assignedProfiles).toEqual(['Aneeb', 'Hassan'])
    expect(row.requiredRemaining).toBe(13)
    expect(row.overdue).toBe(6)
    expect(row.targetCount).toBe(27)
    expect(row.state).toBe('AT_RISK')
    expect(row.stateLabel).toBe(REP_STATE_LABEL.AT_RISK)
    expect(REP_STATE_TONE.AT_RISK).toBe('warning')
  })

  it('TEAM_OPERATION rows sort critical before active', () => {
    const rows = buildAdminTeamOperationRows(
      [teamRow({ repId: 'r2', repName: 'Aneeb' }), teamRow({ repId: 'r1', repName: 'Dawood' })],
      {
        ...teamDay,
        reps: [
          { ...teamDay.reps[0], repId: 'r2', state: 'ACTIVE' },
          { ...teamDay.reps[0], repId: 'r1', state: 'CRITICAL', requiredRemaining: 20 },
        ],
      },
    )
    expect(rows.map((row) => row.id)).toEqual(['r1', 'r2'])
  })

  it('MOVEMENT rows compute today-vs-yesterday deltas', () => {
    const rows = buildAdminMovementRows(
      {
        newLeadsToday: 11,
        qualifiedToday: 2,
        repliesHandledToday: 0,
        followupsToday: 0,
        meetingsToday: 0,
        winsToday: 0,
        draftsGeneratedToday: 0,
        applicationsToday: 0,
      },
      { completed: 179, replies: 3, followups: 18, meetings: 0, wins: 0, proposals: 1, newLeads: 82 },
      22,
    )
    expect(rows).toHaveLength(9)
    const completed = rows.find((row) => row.key === 'completed')!
    expect(completed.today).toBe(22)
    expect(completed.yesterday).toBe(179)
    expect(completed.delta).toBe(-157)
    const leads = rows.find((row) => row.key === 'newLeads')!
    expect(leads.delta).toBe(-71)
    const drafts = rows.find((row) => row.key === 'proposals')!
    expect(drafts.today).toBe(0)
    expect(drafts.yesterday).toBe(1)
    expect(drafts.delta).toBe(-1)
    const applications = rows.find((row) => row.key === 'applications')!
    expect(applications.today).toBe(0)
  })
})
