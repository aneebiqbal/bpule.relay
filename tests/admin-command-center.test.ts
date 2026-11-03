import { describe, expect, it } from 'vitest'
import {
  assembleAdminCommandCenter,
  buildOrgAttentionExtras,
  buildPipelineHealth,
  buildStuckOpportunities,
  type OpenLeadFact,
} from '@/lib/team/admin-command-summary'
import {
  assembleManagerHomeTeamData,
  filterTeamLiveToRepIds,
} from '@/lib/team/manager-home-summary'
import { deriveRepStatus, buildRepAttentionSignals, type ManagerRepSnapshot } from '@/lib/team/attention-policy'
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

const teamDay: TeamDaySummary = {
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
      repName: 'Mehak',
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
      identities: [{ id: 'id-1', name: 'Mehak Seedat', channel: 'linkedin' }],
    },
  ],
}

const teamLive: TeamLivePayload = {
  date: '2026-10-31',
  people: [
    {
      repId: 'rep-1',
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

const openLeads: OpenLeadFact[] = [
  {
    id: 'l1',
    company: 'Acme',
    status: 'replied',
    ownerRepId: 'rep-1',
    ownerName: 'Mehak',
    revenueIdentityId: 'id-1',
    canonicalScore: 80,
    updatedAt: new Date(Date.now() - 18 * 3_600_000).toISOString(),
    lastOutboundAt: null,
  },
  {
    id: 'l-missing',
    company: 'No Profile Co',
    status: 'new',
    ownerRepId: 'rep-1',
    ownerName: 'Mehak',
    revenueIdentityId: null,
    canonicalScore: 70,
    updatedAt: new Date().toISOString(),
    lastOutboundAt: null,
  },
  {
    id: 'l-high',
    company: 'High Intent',
    status: 'new',
    ownerRepId: 'rep-1',
    ownerName: 'Mehak',
    revenueIdentityId: 'id-1',
    canonicalScore: 82,
    updatedAt: new Date().toISOString(),
    lastOutboundAt: null,
  },
]

describe('ADMIN command center', () => {
  it('ADMIN_HOME_ORG_HEALTH + ATTENTION assemble org payload', () => {
    const data = assembleAdminCommandCenter({
      orgName: 'Breakthrough Pulse',
      isOwner: true,
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
      openLeads,
      profiles: [],
      activity: [],
      meetingsThisWeek: 2,
      wins: 1,
    })
    expect(data.scopeNote).toBe('organization')
    expect(data.health.activeOpportunities).toBeGreaterThan(0)
    expect(data.health.repliesWaiting).toBe(3)
    expect(data.health.meetingsThisWeek).toBe(2)
    expect(data.health.wins).toBe(1)
    expect(data.isOwner).toBe(true)
    expect(data.attention.length).toBeGreaterThan(0)
  })

  it('ADMIN_HOME_PIPELINE', () => {
    const pipeline = buildPipelineHealth(openLeads)
    expect(pipeline.find((s) => s.key === 'qualified')?.count).toBe(2)
    expect(pipeline.find((s) => s.key === 'conversation')?.count).toBe(1)
  })

  it('ADMIN_HOME_PROFILE_PERFORMANCE passthrough', () => {
    const data = assembleAdminCommandCenter({
      orgName: 'Org',
      isOwner: false,
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
      openLeads,
      profiles: [
        {
          identityId: 'id-1',
          name: 'Mehak Seedat',
          channel: 'linkedin',
          assignedLeads: 3,
          messagesSent: 10,
          replies: 2,
          meetings: 0,
          proposals: 1,
          wins: 0,
          replyRate: 20,
        },
      ],
      activity: [{ id: 'a1', label: 'Won', detail: 'Mehak', occurredAt: new Date().toISOString(), href: null }],
      meetingsThisWeek: 0,
      wins: 0,
    })
    expect(data.profiles).toHaveLength(1)
    expect(data.activity[0].label).toBe('Won')
  })

  it('ADMIN_HOME_ACTIVITY stuck opportunities', () => {
    const stuck = buildStuckOpportunities(openLeads)
    expect(stuck.some((s) => s.reason.includes('no profile'))).toBe(true)
    expect(stuck.some((s) => s.reason.toLowerCase().includes('reply'))).toBe(true)
    expect(stuck.some((s) => s.reason.toLowerCase().includes('high buyer'))).toBe(true)
  })

  it('ADMIN_ORG_SCOPE extras for missing profiles', () => {
    const extras = buildOrgAttentionExtras({ missingProfileCount: 7, stuckCritical: 2 })
    expect(extras[0].category).toBe('NO_PROFILE_ASSIGNMENT')
    expect(extras[0].severity).toBe('critical')
  })

  it('ADMIN_MANAGER_SCOPE_DIFFERENCE: manager filter excludes outsiders', () => {
    const liveWithOutsider: TeamLivePayload = {
      ...teamLive,
      people: [
        ...teamLive.people,
        {
          ...teamLive.people[0],
          repId: 'outsider',
          repName: 'Outsider',
        },
      ],
    }
    const filtered = filterTeamLiveToRepIds(liveWithOutsider, new Set(['rep-1']))
    expect(filtered.people.map((p) => p.repId)).toEqual(['rep-1'])
  })

  it('OWNER_ADMIN_PARITY: owner flag only adds controls, same ops data shape', () => {
    const admin = assembleAdminCommandCenter({
      orgName: 'Org',
      isOwner: false,
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
      openLeads,
      profiles: [],
      activity: [],
      meetingsThisWeek: 1,
      wins: 0,
    })
    const owner = assembleAdminCommandCenter({
      orgName: 'Org',
      isOwner: true,
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
      openLeads,
      profiles: [],
      activity: [],
      meetingsThisWeek: 1,
      wins: 0,
    })
    expect(admin.health).toEqual(owner.health)
    expect(admin.rows).toEqual(owner.rows)
    expect(owner.isOwner).toBe(true)
    expect(admin.isOwner).toBe(false)
  })

  it('MANAGER_ADMIN_REP_STATUS_PARITY', () => {
    const managerTeam = assembleManagerHomeTeamData({
      teamName: 'Team',
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
    })
    const admin = assembleAdminCommandCenter({
      orgName: 'Org',
      isOwner: false,
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
      openLeads,
      profiles: [],
      activity: [],
      meetingsThisWeek: 0,
      wins: 0,
    })
    const mRow = managerTeam.rows.find((r) => r.repId === 'rep-1')!
    const aRow = admin.rows.find((r) => r.repId === 'rep-1')!
    expect(aRow.repliesWaiting).toBe(mRow.repliesWaiting)
    expect(aRow.followUpsOverdue).toBe(mRow.followUpsOverdue)
    expect(aRow.status).toBe(mRow.status)
    expect(aRow.status).not.toBe('On track')

    // Identical snapshots → identical status from the shared policy.
    const s = snap({
      repId: 'parity',
      repName: 'Parity',
      repliesWaiting: 3,
      oldestReplyAgeHours: 18,
      followUpsOverdue: 1,
      oldestFollowUpAgeHours: 11,
    })
    const statusA = deriveRepStatus(buildRepAttentionSignals(s))
    const statusB = deriveRepStatus(buildRepAttentionSignals({ ...s }))
    expect(statusA).toBe(statusB)
    expect(statusA).toBe('Critical')
  })

  it('ADMIN_HOME_TEAM_TABLE rows present', () => {
    const data = assembleAdminCommandCenter({
      orgName: 'Org',
      isOwner: false,
      teamDay,
      teamLive,
      allowedRepIds: new Set(['rep-1']),
      openLeads,
      profiles: [],
      activity: [],
      meetingsThisWeek: 0,
      wins: 0,
    })
    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].repName).toBe('Mehak')
  })
})
