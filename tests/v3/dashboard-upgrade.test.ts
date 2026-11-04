/**
 * Dashboard upgrade contract gates.
 *
 * Every number on Rep Home and Admin Command Center must come from the
 * canonical systems (target accountability, executed action events, assigned
 * tasks, pipeline facts). These tests pin the presentation builders that both
 * surfaces share, and prove rep/admin send truth stays in parity.
 */
import { describe, expect, it } from 'vitest'
import {
  buildRepTargetWindows,
  buildRepTodayMetrics,
  buildRepV3Stages,
  REP_TREND_SERIES,
} from '@/lib/rep-home/v3-present'
import {
  ADMIN_TEAM_METRICS,
  buildAdminExecutionByRep,
  buildAdminExecutionRows,
  buildAdminProfileRows,
  buildAdminTeamCompare,
  buildAdminV3Attention,
  buildAdminV3Health,
  buildAdminV3Pipeline,
} from '@/lib/admin/v3-command-present'
import {
  buildActivityTrendPoints,
  canonicalActionFor,
  type DailyActivity,
} from '@/lib/performance/activity-model'
import {
  activityCoverageSql,
  activityDailySql,
  activityDayEventsSql,
} from '@/lib/analytics/aggregates'
import { aggregateMetrics, type PerfEvent } from '@/lib/operations/performance'
import {
  assembleAdminCommandCenter,
  buildPipelineHealth,
  buildStuckOpportunities,
  type AdminCommandCenterData,
  type OpenLeadFact,
} from '@/lib/team/admin-command-summary'
import {
  assembleManagerHomeTeamData,
  type ManagerTeamRow,
} from '@/lib/team/manager-home-summary'
import type { AttentionSignal } from '@/lib/team/attention-policy'
import type { TeamDaySummary } from '@/lib/rep-day/team'
import type { TeamLivePayload } from '@/lib/admin/team-live'

function day(date: string, breakdown: Partial<DailyActivity['breakdown']> = {}): DailyActivity {
  return {
    date,
    totalActions: 0,
    weightedActivity: 0,
    active: false,
    breakdown: {
      leadsAnalyzed: 0,
      leadsSaved: 0,
      connections: 0,
      firstDMs: 0,
      followups: 0,
      replies: 0,
      upworkApplications: 0,
      meetings: 0,
      wins: 0,
      referrals: 0,
      ...breakdown,
    },
    events: [],
  }
}

function lead(status: string, id: string): OpenLeadFact {
  return {
    id,
    company: `Company ${id}`,
    status,
    ownerRepId: 'rep-1',
    ownerName: 'Mehak',
    revenueIdentityId: 'identity-1',
    canonicalScore: 80,
    updatedAt: null,
    lastOutboundAt: null,
  }
}

const baseToday = {
  completedToday: 14,
  targetTotal: 20,
  repliesHandledToday: 8,
  followupsCompletedToday: 3,
  tasksCompletedToday: 5,
  meetingsToday: 1,
  repliesWaiting: 5,
  followUpsDue: 4,
  followUpsOverdue: 1,
  tasksDueToday: 2,
}

describe('REP_DASHBOARD_COMPLETED_TRUTH', () => {
  it('shows target completions with their real context, never an invented percentage', () => {
    const metric = buildRepTodayMetrics(baseToday).find((m) => m.key === 'completed')!
    expect(metric.value).toBe(14)
    expect(metric.hint).toBe('14 of 20 target')
    expect(metric.hint).not.toContain('%')
    expect(metric.tone).toBe('neutral')
  })

  it('marks a met target without changing the count', () => {
    const metric = buildRepTodayMetrics({ ...baseToday, completedToday: 20 }).find((m) => m.key === 'completed')!
    expect(metric.value).toBe(20)
    expect(metric.hint).toBe('20 of 20 target')
    expect(metric.tone).toBe('success')
  })

  it('says when no daily target exists instead of showing 0/0', () => {
    const metric = buildRepTodayMetrics({ ...baseToday, targetTotal: 0 }).find((m) => m.key === 'completed')!
    expect(metric.hint).toBe('No daily target')
  })
})

describe('REP_DASHBOARD_REPLIES_PARITY', () => {
  it('reuses the heatmap activity source for the replies metric', () => {
    const daily = [day('2026-11-04', { replies: 8, followups: 3 })]
    const metric = buildRepTodayMetrics({
      ...baseToday,
      repliesHandledToday: daily[0].breakdown.replies,
      followupsCompletedToday: daily[0].breakdown.followups,
    }).find((m) => m.key === 'replies')!

    const point = buildActivityTrendPoints(daily, null, [{ key: 'replies', label: 'Replies' }])[0]
    expect(metric.value).toBe(8)
    expect(metric.value).toBe(point.replies)
    expect(metric.hint).toBe('5 still waiting')
  })

  it('keeps drafts and failed sends out of the count', () => {
    expect(canonicalActionFor('REPLY_SENT', 'failed')).toBeNull()
    expect(canonicalActionFor('DM_PREPARED', null)).toBeNull()
    expect(canonicalActionFor('CONNECTION_PREPARED', null)).toBeNull()
    expect(canonicalActionFor('REPLY_SENT', null)).toBe('REPLY_SENT')
  })
})

describe('REP_DASHBOARD_TASK_PARITY', () => {
  it('merges assigned-task truth into the trend without touching other series', () => {
    const daily = [day('2026-11-03'), day('2026-11-04')]
    const points = buildActivityTrendPoints(
      daily,
      new Map([['2026-11-04', 5]]),
      [
        { key: 'tasks', label: 'Tasks completed' },
        { key: 'replies', label: 'Replies' },
      ],
    )
    expect(points[0]).toMatchObject({ date: '2026-11-03', tasks: 0, replies: 0 })
    expect(points[1]).toMatchObject({ date: '2026-11-04', tasks: 5, replies: 0 })
  })

  it('zero-fills days with no task completions rather than dropping them', () => {
    const points = buildActivityTrendPoints(
      [day('2026-11-01'), day('2026-11-02'), day('2026-11-03')],
      new Map(),
      [{ key: 'tasks', label: 'Tasks completed' }],
    )
    expect(points).toHaveLength(3)
    expect(points.every((point) => point.tasks === 0)).toBe(true)
  })
})

describe('REP_DASHBOARD_TARGET_PARITY', () => {
  it('keeps the daily goal exact and derives weekly/monthly from working days', () => {
    const rows = buildRepTargetWindows({
      dailyDone: 14,
      dailyTarget: 20,
      weeklyDone: 58,
      weeklyWorkingDays: 5,
      monthlyDone: 231,
      monthlyWorkingDays: 21,
    })
    expect(rows[0]).toMatchObject({ key: 'daily', done: 14, target: 20, derived: false, pct: 70 })
    expect(rows[1]).toMatchObject({ key: 'weekly', done: 58, target: 100, derived: true, pct: 58 })
    expect(rows[2]).toMatchObject({ key: 'monthly', done: 231, target: 420, derived: true, pct: 55 })
  })

  it('leaves an unloaded window unknown instead of inventing zero progress', () => {
    const rows = buildRepTargetWindows({
      dailyDone: 14,
      dailyTarget: 20,
      weeklyDone: null,
      weeklyWorkingDays: 5,
      monthlyDone: null,
      monthlyWorkingDays: 21,
    })
    expect(rows[1].done).toBeNull()
    expect(rows[1].pct).toBeNull()
    expect(rows[2].done).toBeNull()
  })
})

describe('REP_DASHBOARD_HEATMAP', () => {
  it('emits one ascending point per day, including empty days', () => {
    const daily = [
      day('2026-11-01'),
      day('2026-11-02', { replies: 3 }),
      day('2026-11-03', { meetings: 1 }),
    ]
    const points = buildActivityTrendPoints(daily, null, REP_TREND_SERIES)
    expect(points.map((point) => point.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(points[0]).toMatchObject({ replies: 0, meetings: 0, tasks: 0 })
    expect(points[1].replies).toBe(3)
    expect(points[2].meetings).toBe(1)
  })
})

describe('REP_DASHBOARD_PIPELINE', () => {
  it('renders all six canonical stages with real counts', () => {
    const stages = buildRepV3Stages([
      lead('new', 'a'),
      lead('contacted', 'b'),
      lead('followed_up', 'c'),
      lead('meeting', 'd'),
      lead('proposal', 'e'),
      lead('won', 'f'),
    ])
    expect(stages.map((stage) => stage.key)).toEqual([
      'qualified',
      'contacted',
      'conversation',
      'meeting',
      'proposal',
      'won',
    ])
    expect(stages.map((stage) => stage.count)).toEqual([1, 1, 1, 1, 1, 1])
    // Snapshot counts are not transitions, so no conversion percentage.
    expect(stages.every((stage) => stage.conversionPct === null)).toBe(true)
  })

  it('suppresses conversion percentages when the previous stage is empty', () => {
    const stages = buildPipelineHealth([lead('won', 'a')])
    expect(stages.find((stage) => stage.key === 'contacted')?.conversionPct).toBeNull()
  })
})

describe('REP_DASHBOARD_TREND', () => {
  it('uses only canonical activity keys plus the task truth', () => {
    expect(REP_TREND_SERIES.map((series) => series.key)).toEqual(['replies', 'meetings', 'tasks'])
    const breakdownKeys = Object.keys(day('2026-11-04').breakdown)
    for (const series of REP_TREND_SERIES) {
      if (series.key !== 'tasks') expect(breakdownKeys).toContain(series.key)
    }
  })
})

describe('ADMIN_DASHBOARD_ORG_HEALTH', () => {
  const data = {
    health: {
      activeOpportunities: 42,
      repliesWaiting: 19,
      repliesCritical: 4,
      followUpsOverdue: 6,
      overdueTasks: 3,
      meetingsThisWeek: 8,
      wins: 2,
    },
  } as AdminCommandCenterData

  it('renders five drillable metrics with canonical values', () => {
    const metrics = buildAdminV3Health(data)
    expect(metrics).toHaveLength(5)
    expect(metrics.map((metric) => metric.label)).toEqual([
      'Active opportunities',
      'Replies waiting',
      'Overdue tasks',
      'Meetings this week',
      'Wins',
    ])
    expect(metrics[0]).toMatchObject({ value: 42, href: '/leads' })
    expect(metrics[1]).toMatchObject({ value: 19, hint: '4 critical', tone: 'danger' })
    expect(metrics[4]).toMatchObject({ value: 2, tone: 'success' })
  })
})

describe('ADMIN_DASHBOARD_ATTENTION_PARITY', () => {
  it('maps canonical attention signals without inventing severity', () => {
    const signals: AttentionSignal[] = [
      {
        category: 'REPLIES_WAITING',
        repId: 'rep-1',
        repName: 'Mehak Seedat',
        count: 4,
        reason: '4 buyer replies waiting',
        severity: 'critical',
        oldestAgeHours: 12,
        href: '/team/rep-1',
      },
      {
        category: 'TASKS_OVERDUE',
        repId: 'rep-2',
        repName: 'Aneeb',
        count: 2,
        reason: '2 overdue tasks',
        severity: 'attention',
        oldestAgeHours: 5,
        href: '/tasks?assignee=rep-2&view=overdue',
      },
      {
        category: 'NO_ACTIVITY',
        repId: 'rep-3',
        repName: 'Madiha',
        count: 0,
        reason: 'No activity',
        severity: 'normal',
        oldestAgeHours: null,
        href: '/team/rep-3',
      },
    ]
    const rows = buildAdminV3Attention(signals)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      severity: 'critical',
      name: 'Mehak Seedat',
      reason: '4 buyer replies waiting',
      ctaLabel: 'Open replies',
      href: '/team/rep-1',
    })
    expect(rows[2].severity).toBe('normal')
  })

  it('caps the list at six signals', () => {
    const signals = Array.from({ length: 9 }, (_, i) => ({
      category: 'REPLIES_WAITING' as const,
      repId: `rep-${i}`,
      repName: `Rep ${i}`,
      count: 1,
      reason: 'waiting',
      severity: 'attention' as const,
      oldestAgeHours: 5,
      href: `/team/rep-${i}`,
    }))
    expect(buildAdminV3Attention(signals)).toHaveLength(6)
  })
})

describe('ADMIN_DASHBOARD_TEAM_EXECUTION', () => {
  it('labels five execution rows with canonical totals', () => {
    const rows = buildAdminExecutionRows({
      completedToday: 42,
      repliesHandled: 19,
      followupsCompleted: 13,
      tasksCompleted: 10,
      meetings: 4,
    })
    expect(rows.map((row) => row.label)).toEqual([
      'Completed',
      'Replies handled',
      'Follow-ups',
      'Tasks completed',
      'Meetings',
    ])
    expect(rows.map((row) => row.value)).toEqual([42, 19, 13, 10, 4])
    expect(rows.every((row) => typeof row.href === 'string')).toBe(true)
  })

  it('keeps unknown values as null rather than fake zeros', () => {
    const rows = buildAdminExecutionRows({
      completedToday: null,
      repliesHandled: null,
      followupsCompleted: null,
      tasksCompleted: null,
      meetings: null,
    })
    expect(rows.every((row) => row.value === null)).toBe(true)
  })
})

describe('ADMIN_DASHBOARD_TEAM_PERFORMANCE', () => {
  const rows: ManagerTeamRow[] = [
    {
      repId: 'rep-1',
      repName: 'Mehak',
      activeProfile: 'LinkedIn',
      channel: 'linkedin',
      completedToday: 18,
      repliesWaiting: 9,
      followUpsOverdue: 1,
      highPriority: 0,
      overdueTasks: 0,
      meetings: 2,
      wins: 1,
      targetPct: 90,
      status: 'On track',
    },
    {
      repId: 'rep-2',
      repName: 'Aneeb',
      activeProfile: 'Email',
      channel: 'email',
      completedToday: 12,
      repliesWaiting: 2,
      followUpsOverdue: 0,
      highPriority: 0,
      overdueTasks: 0,
      meetings: 1,
      wins: 0,
      targetPct: 60,
      status: 'On track',
    },
  ]

  it('compares canonical counts and ranks by the selected metric', () => {
    const compare = buildAdminTeamCompare(
      rows,
      new Map([
        ['rep-1', { repliesSent: 7, followupsSent: 3 }],
        ['rep-2', { repliesSent: 4, followupsSent: 2 }],
      ]),
      new Map([
        ['rep-1', 5],
        ['rep-2', 2],
      ]),
    )
    expect(compare[0].id).toBe('rep-1')
    expect(compare[0].values).toEqual({ completed: 18, replies: 7, meetings: 2, tasks: 5 })
    // replies handled, not replies waiting
    expect(compare[0].values.replies).not.toBe(rows[0].repliesWaiting)
  })

  it('offers four canonical metrics and no combined score', () => {
    expect(ADMIN_TEAM_METRICS.map((metric) => metric.key)).toEqual(['completed', 'replies', 'meetings', 'tasks'])
    expect(buildAdminTeamCompare(rows, null, null)[0]).not.toHaveProperty('score')
  })
})

describe('ADMIN_DASHBOARD_HEATMAP', () => {
  const scope = {
    orgId: 'org-1',
    start: '2026-08-15T00:00:00.000Z',
    end: '2026-11-04T00:00:00.000Z',
    timezone: 'Asia/Karachi',
  }

  it('omits the actor predicate for organization-wide activity', () => {
    const sql = activityDailySql({ ...scope, repId: null })
    expect(sql.sql).not.toContain('AND actor_id = ?')
    expect(sql.params).toHaveLength(4)
  })

  it('keeps the per-rep predicate for a single rep', () => {
    const sql = activityDailySql({ ...scope, repId: 'rep-1' })
    expect(sql.sql).toContain('AND actor_id = ?')
    expect(sql.params).toHaveLength(5)
    expect(activityCoverageSql({ ...scope, repId: null }).params).toHaveLength(3)
    expect(activityDayEventsSql({ ...scope, repId: null }).params).toHaveLength(3)
    expect(activityDayEventsSql({ ...scope, repId: 'rep-1' }).params).toHaveLength(4)
  })
})

describe('ADMIN_DASHBOARD_PIPELINE', () => {
  it('carries every stage and its real conversion through to the dashboard', () => {
    const stages = buildAdminV3Pipeline(
      buildPipelineHealth([lead('new', 'a'), lead('contacted', 'b'), lead('won', 'c')]),
    )
    expect(stages).toHaveLength(6)
    expect(stages[5]).toMatchObject({ key: 'won', count: 1, href: '/leads?filter=won' })
  })

  it('surfaces stuck opportunities from canonical facts only', () => {
    const stale = lead('replied', 'stale')
    stale.updatedAt = new Date(Date.now() - 13 * 3_600_000).toISOString()
    const stuck = buildStuckOpportunities([stale])
    expect(stuck[0]).toMatchObject({ company: 'Company stale', reason: 'Reply waiting too long', severity: 'critical' })
  })
})

describe('ADMIN_DASHBOARD_PROFILE_PERFORMANCE', () => {
  it('reports profile performance and keeps an unknown reply rate unknown', () => {
    const rows = buildAdminProfileRows([
      {
        identityId: 'identity-1',
        name: 'Mehak LinkedIn',
        channel: 'linkedin',
        assignedLeads: 12,
        messagesSent: 40,
        replies: 8,
        meetings: 2,
        proposals: 1,
        wins: 1,
        replyRate: 20,
      },
      {
        identityId: 'identity-2',
        name: 'Aneeb Email',
        channel: 'email',
        assignedLeads: 0,
        messagesSent: 0,
        replies: 0,
        meetings: 0,
        proposals: 0,
        wins: 0,
        replyRate: null,
      },
    ])
    expect(rows[0]).toMatchObject({ leads: 12, replies: 8, replyRate: 20, meetings: 2, wins: 1 })
    expect(rows[1].replyRate).toBeNull()
  })
})

describe('REP_ADMIN_SEND_TRUTH_PARITY', () => {
  it('counts executed replies identically on both dashboards', () => {
    const events = [
      { actor_id: 'rep-1', action_type: 'REPLY_SENT', execution_status: null, lead_id: 'lead-a' },
      { actor_id: 'rep-1', action_type: 'REPLY_SENT', execution_status: 'failed', lead_id: 'lead-b' },
      { actor_id: 'rep-1', action_type: 'DM_PREPARED', execution_status: null, lead_id: 'lead-c' },
    ] as PerfEvent[]

    const canonical = aggregateMetrics(events)
    expect(canonical.repliesSent).toBe(1)
    expect(canonical.messages).toBe(1)

    const repValue = buildRepTodayMetrics({ ...baseToday, repliesHandledToday: canonical.repliesSent })
      .find((metric) => metric.key === 'replies')!.value
    const adminValue = buildAdminExecutionRows({
      completedToday: null,
      repliesHandled: [...buildAdminExecutionByRep(events).values()].reduce(
        (sum, execution) => sum + execution.repliesSent,
        0,
      ),
      followupsCompleted: null,
      tasksCompleted: null,
      meetings: null,
    }).find((row) => row.key === 'replies')!.value

    expect(repValue).toBe(adminValue)
  })

  it('keeps failed sends and generated drafts out of the per-rep tally', () => {
    const byRep = buildAdminExecutionByRep([
      { action_type: 'REPLY_SENT', actor_id: 'rep-1', execution_status: 'sent' },
      { action_type: 'REPLY_SENT', actor_id: 'rep-1', execution_status: 'failed' },
      { action_type: 'FOLLOWUP_SENT', actor_id: 'rep-1', execution_status: 'sent' },
      { action_type: 'CONNECTION_PREPARED', actor_id: 'rep-1', execution_status: 'generated' },
      { action_type: 'REPLY_SENT', actor_id: null, execution_status: 'sent' },
    ])
    expect(byRep.get('rep-1')).toEqual({ repliesSent: 1, followupsSent: 1 })
  })
})

describe('MANAGER_ADMIN_REP_STATUS_PARITY', () => {
  const teamDay: TeamDaySummary = {
    businessDate: '2026-11-04',
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
      reps: 1,
      requiredRemaining: 2,
      commitmentProgress: 0.5,
      repliesWaiting: 3,
      actionsToday: 4,
      pipelineCreated: 1,
    },
    reps: [
      {
        repId: 'rep-1',
        repName: 'Mehak Seedat',
        repRole: 'rep',
        state: 'ACTIVE',
        checkInAt: null,
        closedAt: null,
        lateStart: false,
        exceptionState: 'NONE',
        commitmentProgress: 0.5,
        requiredRemaining: 2,
        minutesRemaining: 240,
        repliesWaiting: 3,
        actionsToday: 4,
        pipelineCreated: 1,
        lastActivityAt: new Date().toISOString(),
        identities: [{ id: 'identity-1', name: 'Mehak Seedat', channel: 'linkedin' }],
      },
    ],
  }

  const teamLive: TeamLivePayload = {
    date: '2026-11-04',
    people: [
      {
        repId: 'rep-1',
        repName: 'Mehak Seedat',
        role: 'rep',
        identities: [{ name: 'Mehak Seedat', title: null, channel: 'linkedin' }],
        goals: [],
        openLeads: [
          { id: 'l1', company: 'Acme', contactName: null, status: 'replied', statusLabel: 'Replied', score: 80 },
        ],
        openLeadCount: 1,
        outreachSent: 1,
        repliesHandled: 1,
        leadsSaved: 1,
        extractionsCount: 0,
        extractionFailures: 0,
        totalTarget: 10,
        totalCompleted: 4,
        totalRemaining: 6,
        lastActivityAt: new Date().toISOString(),
        identityCount: 1,
      },
    ],
  }

  it('gives Manager Home and Admin Command Center the same rep status', () => {
    const shared = {
      teamName: 'Breakthrough Pulse',
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
      activity: [],
    }
    const manager = assembleManagerHomeTeamData(shared)
    const admin = assembleAdminCommandCenter({
      orgName: 'Breakthrough Pulse',
      isOwner: true,
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
      openLeads: [],
      profiles: [],
      activity: [],
      meetingsThisWeek: 0,
      wins: 0,
    })

    const managerStatus = new Map(manager.rows.map((row) => [row.repId, row.status]))
    expect(admin.rows).toHaveLength(manager.rows.length)
    for (const row of admin.rows) {
      expect(row.status).toBe(managerStatus.get(row.repId))
    }
    expect(admin.attention).toEqual(manager.attention)
  })
})
