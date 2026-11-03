import { describe, expect, it } from 'vitest'
import {
  buildRepAttentionSignals,
  buildTeamAttention,
  deriveRepStatus,
  severityFromHours,
  type ManagerRepSnapshot,
} from '@/lib/team/attention-policy'
import {
  assembleManagerHomeTeamData,
  assembleManagerRepSnapshots,
  filterTeamLiveToRepIds,
} from '@/lib/team/manager-home-summary'
import type { TeamDaySummary } from '@/lib/rep-day/team'
import type { TeamLivePayload } from '@/lib/admin/team-live'

function snap(partial: Partial<ManagerRepSnapshot> & Pick<ManagerRepSnapshot, 'repId' | 'repName'>): ManagerRepSnapshot {
  return {
    activeProfile: 'LinkedIn',
    completedToday: 5,
    repliesWaiting: 0,
    followUpsOverdue: 0,
    highPriorityUntouched: 0,
    overdueTasks: 0,
    meetings: 0,
    wins: 0,
    targetPct: 80,
    oldestReplyAgeHours: null,
    oldestFollowUpAgeHours: null,
    oldestHighPriorityAgeHours: null,
    oldestOverdueTaskAgeHours: null,
    lastActivityAt: new Date().toISOString(),
    hasProfileAssignment: true,
    requiredRemaining: 0,
    dayState: 'ACTIVE',
    ...partial,
  }
}

describe('MANAGER attention policy', () => {
  it('MANAGER_REPLY_ATTENTION: waiting replies surface attention', () => {
    const signals = buildRepAttentionSignals(
      snap({
        repId: 'r1',
        repName: 'Mehak',
        repliesWaiting: 7,
        oldestReplyAgeHours: 18,
      }),
    )
    const reply = signals.find((s) => s.category === 'REPLIES_WAITING')
    expect(reply).toBeTruthy()
    expect(reply!.severity).toBe('critical')
    expect(reply!.href).toContain('/team/r1')
  })

  it('MANAGER_FOLLOWUP_ATTENTION: overdue follow-ups', () => {
    const signals = buildRepAttentionSignals(
      snap({
        repId: 'r2',
        repName: 'Madiha',
        followUpsOverdue: 3,
        oldestFollowUpAgeHours: 11,
      }),
    )
    expect(signals.some((s) => s.category === 'FOLLOWUPS_OVERDUE')).toBe(true)
  })

  it('MANAGER_HIGH_PRIORITY_UNTOUCHED', () => {
    const signals = buildRepAttentionSignals(
      snap({
        repId: 'r3',
        repName: 'Aneeb',
        highPriorityUntouched: 4,
        oldestHighPriorityAgeHours: 48,
      }),
    )
    expect(signals.some((s) => s.category === 'HIGH_PRIORITY_UNTOUCHED')).toBe(true)
  })

  it('MANAGER_HEALTHY_TEAM: no signals when clean', () => {
    const signals = buildTeamAttention([
      snap({ repId: 'a', repName: 'A', completedToday: 8, lastActivityAt: new Date().toISOString() }),
      snap({ repId: 'b', repName: 'B', completedToday: 6, lastActivityAt: new Date().toISOString() }),
    ])
    expect(signals).toHaveLength(0)
  })

  it('MANAGER_REP_STATUS: critical beats attention', () => {
    const signals = buildRepAttentionSignals(
      snap({
        repId: 'x',
        repName: 'X',
        repliesWaiting: 2,
        oldestReplyAgeHours: 20,
        dayState: 'CRITICAL',
        requiredRemaining: 4,
      }),
    )
    expect(deriveRepStatus(signals)).toBe('Critical')
  })

  it('severity thresholds', () => {
    expect(severityFromHours(3, 4, 12, 1)).toBe('normal')
    expect(severityFromHours(5, 4, 12, 1)).toBe('attention')
    expect(severityFromHours(13, 4, 12, 1)).toBe('critical')
  })
})

describe('MANAGER home assembly', () => {
  const emptyDay: TeamDaySummary = {
    businessDate: '2026-10-31',
    timezone: 'UTC',
    isWorkingDay: true,
    workdayProgress: 0.5,
    minutesRemaining: 240,
    workdayStart: '09:00',
    workdayEnd: '18:00',
    counts: {
      NOT_STARTED: 0,
      ACTIVE: 1,
      AT_RISK: 0,
      CRITICAL: 0,
      READY_TO_CLOSE: 0,
      CLOSED: 0,
      MISSED: 0,
    },
    totals: {
      reps: 2,
      requiredRemaining: 0,
      commitmentProgress: 0.7,
      repliesWaiting: 2,
      actionsToday: 5,
      pipelineCreated: 1,
    },
    reps: [
      {
        repId: 'managed-1',
        repName: 'Mehak',
        repRole: 'rep',
        state: 'ACTIVE',
        checkInAt: null,
        closedAt: null,
        lateStart: false,
        exceptionState: 'NONE',
        commitmentProgress: 0.7,
        requiredRemaining: 2,
        minutesRemaining: 240,
        repliesWaiting: 2,
        actionsToday: 3,
        pipelineCreated: 1,
        lastActivityAt: new Date().toISOString(),
        identities: [{ id: 'i1', name: 'Mehak Seedat', channel: 'linkedin' }],
      },
      {
        repId: 'managed-2',
        repName: 'Aneeb',
        repRole: 'rep',
        state: 'ACTIVE',
        checkInAt: null,
        closedAt: null,
        lateStart: false,
        exceptionState: 'NONE',
        commitmentProgress: 0.5,
        requiredRemaining: 0,
        minutesRemaining: 240,
        repliesWaiting: 0,
        actionsToday: 2,
        pipelineCreated: 0,
        lastActivityAt: new Date().toISOString(),
        identities: [{ id: 'i2', name: 'Aneeb', channel: 'linkedin' }],
      },
    ],
  }

  const live: TeamLivePayload = {
    date: '2026-10-31',
    people: [
      {
        repId: 'managed-1',
        repName: 'Mehak',
        role: 'rep',
        identities: [{ name: 'Mehak Seedat', title: null, channel: 'linkedin' }],
        goals: [],
        openLeads: [
          { id: 'l1', company: 'Acme', contactName: null, status: 'replied', statusLabel: 'Replied', score: 80 },
          { id: 'l2', company: 'Beta', contactName: null, status: 'followed_up', statusLabel: 'Follow-up', score: 40 },
          { id: 'l3', company: 'Gamma', contactName: null, status: 'new', statusLabel: 'New', score: 78 },
        ],
        openLeadCount: 3,
        outreachSent: 2,
        repliesHandled: 1,
        leadsSaved: 1,
        extractionsCount: 0,
        extractionFailures: 0,
        totalTarget: 10,
        totalCompleted: 5,
        totalRemaining: 5,
        lastActivityAt: new Date().toISOString(),
        identityCount: 1,
      },
      {
        repId: 'outsider',
        repName: 'ShouldNotSee',
        role: 'rep',
        identities: [],
        goals: [],
        openLeads: [],
        openLeadCount: 0,
        outreachSent: 0,
        repliesHandled: 0,
        leadsSaved: 0,
        extractionsCount: 0,
        extractionFailures: 0,
        totalTarget: 0,
        totalCompleted: 0,
        totalRemaining: 0,
        lastActivityAt: null,
        identityCount: 0,
      },
    ],
  }

  it('MANAGER_SCOPE_OWN_TEAM_ONLY: outsider filtered from live', () => {
    const allowed = new Set(['managed-1', 'managed-2'])
    const filtered = filterTeamLiveToRepIds(live, allowed)
    expect(filtered.people.map((p) => p.repId)).toEqual(['managed-1'])
  })

  it('MANAGER_HOME_ATTENTION + TEAM_TABLE', () => {
    const allowed = new Set(['managed-1', 'managed-2'])
    const data = assembleManagerHomeTeamData({
      teamName: 'BD Team',
      teamDay: emptyDay,
      teamLive: filterTeamLiveToRepIds(live, allowed),
      allowedRepIds: allowed,
    })
    expect(data.memberCount).toBe(2)
    expect(data.rows.some((r) => r.repId === 'outsider')).toBe(false)
    expect(data.rows.find((r) => r.repId === 'managed-1')?.repliesWaiting).toBe(2)
    expect(data.attention.some((s) => s.repId === 'managed-1')).toBe(true)
    expect(data.scopeNote).toBe('managed_team')
  })

  it('MANAGER_PERSONAL_PROFILE_DOES_NOT_FILTER_TEAM: assembler ignores profile id', () => {
    const allowed = new Set(['managed-1', 'managed-2'])
    const snaps = assembleManagerRepSnapshots({
      teamDay: emptyDay,
      teamLive: filterTeamLiveToRepIds(live, allowed),
      allowedRepIds: allowed,
    })
    // Both managed reps present regardless of any personal workspace cookie.
    expect(snaps.map((s) => s.repId).sort()).toEqual(['managed-1', 'managed-2'])
  })

  it('MANAGER_HOME_EMPTY_STATE: healthy metrics when no pressure', () => {
    const quietDay: TeamDaySummary = {
      ...emptyDay,
      reps: emptyDay.reps.map((r) => ({ ...r, repliesWaiting: 0, requiredRemaining: 0, state: 'ACTIVE' as const })),
      totals: { ...emptyDay.totals, repliesWaiting: 0 },
    }
    const quietLive: TeamLivePayload = {
      date: '2026-10-31',
      people: live.people
        .filter((p) => p.repId !== 'outsider')
        .map((p) => ({ ...p, openLeads: [], openLeadCount: 0, totalRemaining: 0 })),
    }
    const data = assembleManagerHomeTeamData({
      teamName: 'BD',
      teamDay: quietDay,
      teamLive: quietLive,
      allowedRepIds: new Set(['managed-1', 'managed-2']),
    })
    expect(data.attention).toHaveLength(0)
    expect(data.needsAttentionCount).toBe(0)
    expect(data.rows.every((r) => r.status === 'On track')).toBe(true)
  })

  it('MANAGER_HOME_REP_DEEP_LINK: attention hrefs point at rep detail', () => {
    const signals = buildRepAttentionSignals(
      snap({ repId: 'mehak', repName: 'Mehak', repliesWaiting: 3, oldestReplyAgeHours: 5 }),
    )
    expect(signals[0].href).toBe('/team/mehak?focus=replies')
  })
})
