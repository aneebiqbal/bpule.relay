/**
 * Phase 8 — operations workspace contracts. Synthetic fixtures only (no
 * production rows, no PII).
 */
import { describe, expect, it } from 'vitest'
import type { TeamDayRow, TeamDaySummary } from '@/lib/rep-day/team'
import type { TeamLivePayload, TeamLivePerson } from '@/lib/admin/team-live'
import { assemblePeopleDirectory, roleLabelFor, type MembershipRow } from '@/lib/operations/people'
import { buildRepAttention } from '@/lib/operations/rep-360'
import {
  canInterveneOnRep,
  canOpenTeamWorkspace,
  effectiveRepIds,
  filterRepIdsToScope,
  repInScope,
  type OperationalScope,
} from '@/lib/operations/scope'
import { opsHref, parseOpsFilters, rangeWindow, sourceBucket } from '@/lib/operations/filters'
import {
  ACTION_EVENT_META,
  mapActionEvent,
  mapNote,
  mapTaskEvent,
  mergeTimeline,
  type TimelineLookups,
} from '@/lib/operations/activity'
import {
  aggregateMetrics,
  buildFunnel,
  furthestStage,
  groupMetrics,
  replyRate,
  type PerfEvent,
} from '@/lib/operations/performance'
import {
  countConversationViews,
  deriveConversationRow,
  filterConversationRows,
  sortConversationRows,
} from '@/lib/operations/conversations'
import { accountNextAction, buildAccountOverview, groupAccounts, type AccountLead } from '@/lib/operations/accounts'
import { buildSearchGroups, sanitizeSearchTerm } from '@/lib/operations/global-search'
import {
  isSavedViewSurface,
  normalizeViewName,
  sanitizeViewQuery,
  savedViewHref,
  SavedViewError,
} from '@/lib/operations/saved-views'
import { NoteError, assertNoteSubjectAccess, normalizeNoteBody, notePermissions } from '@/lib/operations/notes'
import { taskViewMatches } from '@/lib/operations/task-views'
import { domainForPathname, secondaryItems, visibleDomains } from '@/lib/navigation/relay-shell-nav'
import type { UnifiedTask } from '@/lib/tasks/types'
import type { AuthContext } from '@/lib/auth/organization'

const NOW = Date.parse('2026-11-01T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()

// ─── fixtures ────────────────────────────────────────────────────────────────

function dayRow(repId: string, repName: string, over: Partial<TeamDayRow> = {}): TeamDayRow {
  return {
    repId,
    repName,
    repRole: 'rep',
    state: 'ACTIVE',
    checkInAt: hoursAgo(3),
    closedAt: null,
    lateStart: false,
    exceptionState: 'NONE',
    commitmentProgress: 0.5,
    requiredRemaining: 0,
    minutesRemaining: 200,
    repliesWaiting: 0,
    actionsToday: 4,
    pipelineCreated: 0,
    lastActivityAt: hoursAgo(1),
    identities: [{ id: `id-${repId}`, name: `${repName} LinkedIn`, channel: 'linkedin' }],
    ...over,
  }
}

function teamDay(rows: TeamDayRow[]): TeamDaySummary {
  return {
    businessDate: '2026-11-01',
    timezone: 'UTC',
    isWorkingDay: true,
    workdayProgress: 0.5,
    minutesRemaining: 240,
    workdayStart: '09:00',
    workdayEnd: '18:00',
    counts: { NOT_STARTED: 0, ACTIVE: rows.length, AT_RISK: 0, CRITICAL: 0, READY_TO_CLOSE: 0, CLOSED: 0, MISSED: 0 },
    totals: { reps: rows.length, requiredRemaining: 0, commitmentProgress: 0.5, repliesWaiting: 0, actionsToday: 0, pipelineCreated: 0 },
    reps: rows,
  }
}

function livePerson(repId: string, repName: string, over: Partial<TeamLivePerson> = {}): TeamLivePerson {
  return {
    repId,
    repName,
    role: 'rep',
    identities: [{ name: `${repName} LinkedIn`, title: 'Engineer', channel: 'linkedin' }],
    goals: [],
    openLeads: [],
    openLeadCount: 0,
    outreachSent: 0,
    repliesHandled: 0,
    leadsSaved: 0,
    extractionsCount: 0,
    extractionFailures: 0,
    totalTarget: 10,
    totalCompleted: 5,
    totalRemaining: 5,
    lastActivityAt: hoursAgo(1),
    identityCount: 1,
    ...over,
  }
}

const orgScope: OperationalScope = { mode: 'org', orgId: 'org', actorRepId: 'admin', repIds: null }
const teamScope: OperationalScope = { mode: 'team', orgId: 'org', actorRepId: 'mgr', repIds: ['mgr', 'r1', 'r2'] }
const ownScope: OperationalScope = { mode: 'own', orgId: 'org', actorRepId: 'r1', repIds: ['r1'] }

function task(over: Partial<UnifiedTask>): UnifiedTask {
  return {
    id: 'assigned:t1',
    source: 'ASSIGNED',
    kind: 'REVIEW',
    title: 'Review proposal',
    reason: 'Assigned by Hassan',
    organizationId: 'org',
    assigneeRepId: 'r1',
    priority: 'NORMAL',
    status: 'OPEN',
    createdAt: hoursAgo(48),
    action: { label: 'View task', href: '/tasks' },
    ...over,
  }
}

function accountLead(over: Partial<AccountLead>): AccountLead {
  return {
    id: 'l1',
    company: 'Acme',
    companyKey: 'acme',
    contactName: 'Sarah Chen',
    contactTitle: 'VP Engineering',
    ownerRepId: 'r1',
    ownerName: 'Mehak',
    profileId: 'p1',
    profileName: 'Mehak LinkedIn',
    status: 'contacted',
    source: 'linkedin',
    region: 'United States',
    score: 70,
    createdAt: hoursAgo(100),
    stage: null,
    lastSentAt: hoursAgo(50),
    lastReplyAt: null,
    nextFollowupAt: null,
    wonAt: null,
    ...over,
  }
}

// ─── TEAM_DIRECTORY ──────────────────────────────────────────────────────────

describe('TEAM_DIRECTORY', () => {
  const memberships: MembershipRow[] = [
    { team_id: 'bd', person_id: 'mgr', membership_role: 'MANAGER' },
    { team_id: 'bd', person_id: 'r1', membership_role: 'MEMBER' },
    { team_id: 'bd', person_id: 'r2', membership_role: 'MEMBER' },
  ]
  const directory = assemblePeopleDirectory({
    teamDay: teamDay([dayRow('mgr', 'Hassan'), dayRow('r1', 'Mehak', { repliesWaiting: 7 }), dayRow('r2', 'Madiha'), dayRow('out', 'Outsider')]),
    teamLive: {
      date: '2026-11-01',
      people: [livePerson('r1', 'Mehak', { openLeadCount: 12 }), livePerson('r2', 'Madiha', { openLeadCount: 3 })],
    } satisfies TeamLivePayload,
    allowedRepIds: new Set(['mgr', 'r1', 'r2']),
    overdueTasksByRep: new Map([['r2', 2]]),
    teams: [{ id: 'bd', name: 'BD Team', description: null }],
    memberships,
    orgRoles: new Map([['mgr', 'MEMBER']]),
  })

  it('TEAM_DIRECTORY_SCOPE: rows never include reps outside the allowed set', () => {
    expect(directory.rows.map((r) => r.repId).sort()).toEqual(['mgr', 'r1', 'r2'])
  })

  it('TEAM_DIRECTORY_COLUMNS: role, team, open leads and overdue tasks come through', () => {
    const mehak = directory.rows.find((r) => r.repId === 'r1')!
    expect(mehak.teams).toEqual([{ id: 'bd', name: 'BD Team' }])
    expect(mehak.openLeads).toBe(12)
    expect(mehak.repliesWaiting).toBe(7)
    expect(directory.rows.find((r) => r.repId === 'r2')!.overdueTasks).toBe(2)
    expect(directory.rows.find((r) => r.repId === 'mgr')!.roleLabel).toBe('Manager')
  })

  it('TEAM_DIRECTORY_ROLE_LABEL: org role wins, team manager upgrades member', () => {
    expect(roleLabelFor({ orgRole: 'OWNER', repRole: 'rep', managesATeam: false })).toBe('Owner')
    expect(roleLabelFor({ orgRole: 'MEMBER', repRole: 'admin', managesATeam: false })).toBe('Rep')
    expect(roleLabelFor({ orgRole: 'MEMBER', repRole: 'rep', managesATeam: true })).toBe('Manager')
    expect(roleLabelFor({ orgRole: null, repRole: 'sourcer', managesATeam: false })).toBe('Sourcer')
  })

  // TEAM_DETAIL roll-ups are part of the same assembly.
  it('TEAM_DETAIL_ROLLUP: team totals sum visible members only', () => {
    const bd = directory.teams[0]
    expect(bd.managers).toEqual([{ repId: 'mgr', name: 'Hassan' }])
    expect(bd.memberCount).toBe(3)
    expect(bd.activeLeads).toBe(15)
    expect(bd.repliesWaiting).toBe(7)
    expect(bd.overdueTasks).toBe(2)
  })
})

// ─── MANAGER_SCOPE / ADMIN_SCOPE ─────────────────────────────────────────────

describe('MANAGER_SCOPE', () => {
  it('MANAGER_SCOPE_REP_URL: a rep id outside the team is out of scope', () => {
    expect(repInScope(teamScope, 'r1')).toBe(true)
    expect(repInScope(teamScope, 'outsider')).toBe(false)
    expect(repInScope(teamScope, '')).toBe(false)
  })

  it('MANAGER_SCOPE_NEVER_WIDENS: requested filters only narrow', () => {
    expect(effectiveRepIds(teamScope, {})).toEqual(['mgr', 'r1', 'r2'])
    expect(effectiveRepIds(teamScope, { repId: 'r1' })).toEqual(['r1'])
    expect(effectiveRepIds(teamScope, { repId: 'outsider' })).toEqual([])
    expect(effectiveRepIds(teamScope, { teamMemberIds: ['r2', 'outsider'] })).toEqual(['r2'])
    expect(effectiveRepIds(teamScope, { teamMemberIds: ['r2'], repId: 'r1' })).toEqual([])
    expect(filterRepIdsToScope(teamScope, ['r1', 'x'])).toEqual(['r1'])
  })

  it('MANAGER_SCOPE_INTERVENTION: managers act on their team, reps on no one', () => {
    expect(canInterveneOnRep(teamScope, 'r2')).toBe(true)
    expect(canInterveneOnRep(teamScope, 'outsider')).toBe(false)
    expect(canInterveneOnRep(ownScope, 'r1')).toBe(false)
  })
})

describe('ADMIN_SCOPE', () => {
  it('ADMIN_SCOPE_ORG: admins see the whole org (null = unconstrained)', () => {
    expect(repInScope(orgScope, 'anyone')).toBe(true)
    expect(effectiveRepIds(orgScope, {})).toBeNull()
    expect(effectiveRepIds(orgScope, { repId: 'r9' })).toEqual(['r9'])
    expect(effectiveRepIds(orgScope, { teamMemberIds: ['a', 'b'] })).toEqual(['a', 'b'])
  })
})

// ─── ROLE_VISIBILITY ─────────────────────────────────────────────────────────

describe('ROLE_VISIBILITY', () => {
  const rep = { isOwner: false, isAdmin: false, isManager: false }
  const manager = { isOwner: false, isAdmin: false, isManager: true }
  const admin = { isOwner: false, isAdmin: true, isManager: true }

  it('ROLE_TEAM_WORKSPACE: managers and admins open Team; reps do not', () => {
    expect(canOpenTeamWorkspace(rep)).toBe(false)
    expect(canOpenTeamWorkspace(manager)).toBe(true)
    expect(canOpenTeamWorkspace(admin)).toBe(true)
    expect(visibleDomains(rep).some((i) => i.id === 'team')).toBe(false)
    expect(secondaryItems('team', rep)).toEqual([])
  })

  it('ROLE_TEAM_RAIL: Team is four operating surfaces plus Structure', () => {
    const hrefs = secondaryItems('team', manager).map((i) => i.href)
    expect(hrefs).toEqual(['/team', '/team/people', '/team/profiles', '/team/performance', '/team/groups'])
    expect(hrefs).not.toContain('/admin/command')
    expect(secondaryItems('team', admin).map((i) => i.href)).toEqual(hrefs)
    expect(secondaryItems('admin', admin).map((i) => i.href)).toContain('/admin/people')
  })

  it('ROLE_ACCOUNTS: Companies is admin-only and points at /accounts', () => {
    expect(visibleDomains(manager).some((i) => i.id === 'admin')).toBe(false)
    expect(secondaryItems('sales', admin).map((i) => i.href)).toContain('/accounts')
    expect(secondaryItems('sales', manager).map((i) => i.href)).not.toContain('/accounts')
  })

  it('ROLE_SECTION_DETECTION: new routes land in the right section', () => {
    expect(domainForPathname('/team/groups/abc')).toBe('team')
    expect(domainForPathname('/team/activity')).toBe('team')
    expect(domainForPathname('/admin/command')).toBe('team')
    expect(domainForPathname('/accounts/acme')).toBe('sales')
  })
})

// ─── REP_360 ─────────────────────────────────────────────────────────────────

describe('REP_360', () => {
  it('REP_360_ATTENTION: oldest reply, oldest overdue task, untouched, target risk', () => {
    const conv = deriveConversationRow(
      { id: 'l1', contactName: 'Sarah Chen', company: 'Acme', companyKey: 'acme', ownerRepId: 'r1', profileName: null, status: 'replied' },
      { stage: 'replied', lastSentAt: hoursAgo(30), lastReplyAt: hoursAgo(14), nextFollowupAt: null, wonAt: null, lostAt: null },
      'Mehak',
      NOW,
    )!
    const items = buildRepAttention({
      repId: 'r1',
      row: {
        repId: 'r1', repName: 'Mehak', activeProfile: null, channel: null, completedToday: 2, repliesWaiting: 1,
        followUpsOverdue: 0, highPriority: 4, overdueTasks: 1, meetings: 0, wins: 0, targetPct: 20, status: 'Critical',
        roleLabel: 'Rep', teams: [], openLeads: 5, lastActivityAt: null, dayState: 'AT_RISK',
      },
      conversations: [conv],
      tasks: [task({ dueAt: hoursAgo(6) })],
      now: NOW,
    })
    expect(items.map((i) => i.label)).toEqual(['Oldest reply waiting', 'Oldest overdue task', 'Untouched opportunities', 'Target risk'])
    expect(items[0].tone).toBe('critical')
    expect(items[0].href).toBe('/chats?lead=l1')
    expect(items[1].href).toContain('/team/r1?tab=work&view=overdue')
    expect(items[2].tone).toBe('attention')
    expect(items[3].tone).toBe('attention')
  })

  it('REP_360_NO_INVENTED_AGES: nothing waiting reads as nothing waiting', () => {
    const items = buildRepAttention({ repId: 'r1', row: null, conversations: [], tasks: [], now: NOW })
    expect(items[0]).toMatchObject({ detail: 'No replies waiting', href: null })
    expect(items[1]).toMatchObject({ detail: 'Nothing overdue', href: null })
    expect(items[3].detail).toBe('No target data')
  })
})

// ─── TASK_BOARD ──────────────────────────────────────────────────────────────

describe('TASK_BOARD', () => {
  it('TASK_BOARD_VIEWS: overdue / completed / all follow the canonical classifier', () => {
    const overdue = task({ dueAt: hoursAgo(2) })
    const done = task({ id: 'assigned:t2', status: 'DONE' })
    const later = task({ id: 'assigned:t3', dueAt: new Date(NOW + 5 * 86_400_000).toISOString() })
    expect(taskViewMatches(overdue, 'overdue', NOW)).toBe(true)
    expect(taskViewMatches(overdue, 'all', NOW)).toBe(true)
    expect(taskViewMatches(done, 'all', NOW)).toBe(false)
    expect(taskViewMatches(done, 'completed', NOW)).toBe(true)
    expect(taskViewMatches(later, 'upcoming', NOW)).toBe(true)
    expect(taskViewMatches(later, 'overdue', NOW)).toBe(false)
  })
})

// ─── CONVERSATION_OVERSIGHT ──────────────────────────────────────────────────

describe('CONVERSATION_OVERSIGHT', () => {
  const lead = (id: string, status = 'contacted') => ({
    id, contactName: `Person ${id}`, company: 'Acme', companyKey: 'acme', ownerRepId: 'r1', profileName: 'P', status,
  })
  const rows = [
    deriveConversationRow(lead('a'), { stage: 'replied', lastSentAt: hoursAgo(20), lastReplyAt: hoursAgo(13), nextFollowupAt: null, wonAt: null, lostAt: null }, null, NOW)!,
    deriveConversationRow(lead('b'), { stage: 'replied', lastSentAt: hoursAgo(20), lastReplyAt: hoursAgo(5), nextFollowupAt: null, wonAt: null, lostAt: null }, null, NOW)!,
    deriveConversationRow(lead('c'), { stage: 'contacted', lastSentAt: hoursAgo(80), lastReplyAt: null, nextFollowupAt: hoursAgo(1), wonAt: null, lostAt: null }, null, NOW)!,
    deriveConversationRow(lead('d'), { stage: 'meeting', lastSentAt: hoursAgo(2), lastReplyAt: hoursAgo(3), nextFollowupAt: null, wonAt: null, lostAt: null }, null, NOW)!,
    deriveConversationRow(lead('e', 'won'), { stage: 'won', lastSentAt: hoursAgo(2), lastReplyAt: hoursAgo(1), nextFollowupAt: null, wonAt: hoursAgo(1), lostAt: null }, null, NOW)!,
  ]

  it('CONVERSATION_STATE: who the thread is waiting on, from timestamps only', () => {
    expect(rows.map((r) => r.state)).toEqual(['waiting_on_rep', 'waiting_on_rep', 'follow_up_due', 'meeting', 'closed'])
    expect(rows[0]).toMatchObject({ waitingOn: 'Rep', ageHours: 13, nextAction: 'Reply' })
    expect(rows[2]).toMatchObject({ waitingOn: 'Prospect', nextAction: 'Send follow-up' })
    expect(rows[4]).toMatchObject({ waitingOn: null, ageHours: null })
  })

  it('CONVERSATION_NO_THREAD: nothing sent or received is not a conversation', () => {
    expect(deriveConversationRow(lead('z'), null, null, NOW)).toBeNull()
  })

  it('CONVERSATION_OVERSIGHT_FILTERS: >4h and >12h only count replies waiting on the rep', () => {
    expect(filterConversationRows(rows, 'over4h').map((r) => r.leadId)).toEqual(['a', 'b'])
    expect(filterConversationRows(rows, 'over12h').map((r) => r.leadId)).toEqual(['a'])
    const counts = countConversationViews(rows)
    expect(counts.all).toBe(5)
    expect(counts.waiting_me).toBe(2)
    expect(counts.closed).toBe(1)
  })

  it('CONVERSATION_ORDER: waiting on rep first, oldest wait first', () => {
    const sorted = sortConversationRows([...rows].reverse())
    expect(sorted.map((r) => r.leadId)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

// ─── ACTIVITY_CENTER ─────────────────────────────────────────────────────────

describe('ACTIVITY_CENTER', () => {
  const lookups: TimelineLookups = {
    reps: new Map([['r1', 'Mehak'], ['mgr', 'Hassan']]),
    leads: new Map([['l1', { label: 'Sarah Chen · Acme', company: 'Acme', companyKey: 'acme', profileName: 'Mehak LinkedIn', source: 'linkedin' }]]),
    tasks: new Map([['t1', { title: 'Revise proposal', leadId: 'l1', assigneeRepId: 'r1' }]]),
  }
  const ae = (id: string, type: string, at: string, extra: Partial<Parameters<typeof mapActionEvent>[0]> = {}) =>
    mapActionEvent({ id, actor_id: 'r1', action_type: type, execution_status: 'sent', channel: 'linkedin', lead_id: 'l1', job_id: null, occurred_at: at, ...extra }, lookups)

  it('ACTIVITY_NO_UI_NOISE: drafts and recommendations are not timeline events', () => {
    expect(ae('1', 'DM_PREPARED', hoursAgo(1))).toBeNull()
    expect(ae('2', 'RECOMMENDATION_SHOWN', hoursAgo(1))).toBeNull()
    expect(ae('3', 'UPWORK_JOB_EXTRACTED', hoursAgo(1))).toBeNull()
    expect(ACTION_EVENT_META.FOLLOWUP_SENT.label).toBe('Follow-up sent')
  })

  it('ACTIVITY_ROW_SHAPE: time, actor, profile, lead, event, result, link', () => {
    const row = ae('4', 'FOLLOWUP_SENT', hoursAgo(1))!
    expect(row).toMatchObject({
      actorName: 'Mehak',
      profileName: 'Mehak LinkedIn',
      leadLabel: 'Sarah Chen · Acme',
      companyKey: 'acme',
      event: 'Follow-up sent',
      result: 'LinkedIn',
      href: '/leads/l1',
      source: 'linkedin',
    })
    expect(ae('5', 'DM_SENT', hoursAgo(1), { execution_status: 'failed' })!.result).toBe('Failed')
  })

  it('ACTIVITY_MERGE: actions, tasks and notes merge newest first without duplicates', () => {
    const merged = mergeTimeline(
      [
        ae('6', 'DM_SENT', hoursAgo(3)),
        mapTaskEvent({ id: 'e1', task_id: 't1', event_type: 'TASK_COMPLETED', actor_rep_id: 'r1', created_at: hoursAgo(1) }, lookups),
        mapNote({ id: 'n1', subject_type: 'LEAD', subject_id: 'l1', author_rep_id: 'mgr', body: 'Client asked for a revised proposal before Friday.', created_at: hoursAgo(2) }, lookups),
        ae('6', 'DM_SENT', hoursAgo(3)),
        null,
      ],
      10,
    )
    expect(merged.map((r) => r.event)).toEqual(['Task completed', 'Internal note', 'Message sent'])
    expect(merged[0].result).toBe('Revise proposal')
    expect(merged[1].actorName).toBe('Hassan')
  })

  // ACCOUNT_ACTIVITY uses the same mapper keyed by lead ids of one company.
  it('ACCOUNT_ACTIVITY: every row about a company lead carries the account key', () => {
    const rows = mergeTimeline([ae('7', 'REPLY_RECEIVED', hoursAgo(1)), ae('8', 'CONNECTION_SENT', hoursAgo(9))], 10)
    expect(rows.every((r) => r.companyKey === 'acme')).toBe(true)
    expect(rows[0].event).toBe('Inbound received')
  })
})

// ─── TEAM_PERFORMANCE / PROFILE_PERFORMANCE / SOURCE_PERFORMANCE ─────────────

describe('TEAM_PERFORMANCE', () => {
  const events: PerfEvent[] = [
    { actor_id: 'r1', action_type: 'CONNECTION_SENT', execution_status: 'sent', lead_id: 'l1' },
    { actor_id: 'r1', action_type: 'CONNECTION_PREPARED', execution_status: 'generated', lead_id: 'l2' },
    { actor_id: 'r1', action_type: 'DM_SENT', execution_status: 'failed', lead_id: 'l3' },
    { actor_id: 'r1', action_type: 'DM_SENT', execution_status: 'sent', lead_id: 'l2' },
    { actor_id: 'r1', action_type: 'REPLY_RECEIVED', execution_status: 'delivered', lead_id: 'l2' },
    { actor_id: 'r1', action_type: 'REPLY_SENT', execution_status: 'sent', lead_id: 'l2' },
    { actor_id: 'r2', action_type: 'CLIENT_WON', execution_status: 'sent', lead_id: 'l4' },
    { actor_id: 'r2', action_type: 'UPWORK_APPLIED', execution_status: 'sent', lead_id: null },
  ]

  it('TEAM_PERFORMANCE_EXECUTED_ONLY: drafts and failures are never counted', () => {
    const m = aggregateMetrics(events, 3)
    expect(m.connections).toBe(1)
    expect(m.messages).toBe(2)
    expect(m.repliesSent).toBe(1)
    expect(m.replies).toBe(1)
    expect(m.wins).toBe(1)
    expect(m.applications).toBe(1)
    expect(m.tasksCompleted).toBe(3)
    expect(m.leadsContacted).toBe(2)
    expect(m.leadsReplied).toBe(1)
  })

  it('TEAM_PERFORMANCE_REPLY_RATE: replied ÷ contacted leads; no contact means no rate', () => {
    expect(replyRate({ leadsContacted: 2, leadsReplied: 1 })).toBe(50)
    expect(replyRate({ leadsContacted: 0, leadsReplied: 0 })).toBeNull()
    expect(replyRate({ leadsContacted: 1, leadsReplied: 3 })).toBe(100)
  })

  it('TEAM_PERFORMANCE_REP_COMPARISON: grouped per rep, tasks attached per rep', () => {
    const byRep = groupMetrics(events, (e) => e.actor_id, new Map([['r3', 2]]))
    expect(byRep.get('r1')!.messages).toBe(2)
    expect(byRep.get('r2')!.wins).toBe(1)
    expect(byRep.get('r3')!.tasksCompleted).toBe(2)
  })

  it('TEAM_PERFORMANCE_FUNNEL: counts and step conversion at furthest known stage', () => {
    const steps = buildFunnel([
      { id: 'a', status: 'new', stage: null, lastSentAt: null, lastReplyAt: null, wonAt: null },
      { id: 'b', status: 'contacted', stage: 'contacted', lastSentAt: hoursAgo(5), lastReplyAt: null, wonAt: null },
      { id: 'c', status: 'replied', stage: 'replied', lastSentAt: hoursAgo(5), lastReplyAt: hoursAgo(2), wonAt: null },
      { id: 'd', status: 'replied', stage: 'proposal', lastSentAt: hoursAgo(5), lastReplyAt: hoursAgo(2), wonAt: null },
      { id: 'e', status: 'won', stage: 'won', lastSentAt: hoursAgo(5), lastReplyAt: hoursAgo(2), wonAt: hoursAgo(1) },
    ])
    expect(steps.map((s) => s.count)).toEqual([5, 4, 3, 2, 2, 1])
    expect(steps.map((s) => s.conversionPct)).toEqual([null, 80, 75, 67, 100, 50])
    expect(steps[1].transition).toBe('Lead → Contact')
  })

  it('TEAM_PERFORMANCE_LOST_EVIDENCE: a lost lead never counts as contacted without a send', () => {
    expect(furthestStage({ id: 'x', status: 'lost', stage: null, lastSentAt: null, lastReplyAt: null, wonAt: null })).toBe('lead')
    expect(furthestStage({ id: 'y', status: 'lost', stage: null, lastSentAt: hoursAgo(1), lastReplyAt: null, wonAt: null })).toBe('contact')
  })

  it('TEAM_PERFORMANCE_EMPTY: an empty funnel has no conversion, not 0%', () => {
    expect(buildFunnel([]).every((s) => s.count === 0 && s.conversionPct === null)).toBe(true)
  })
})

describe('PROFILE_PERFORMANCE', () => {
  it('PROFILE_PERFORMANCE_GROUPING: events group by the lead sending profile', () => {
    const profileOf: Record<string, string> = { l1: 'p1', l2: 'p2' }
    const groups = groupMetrics(
      [
        { actor_id: 'r1', action_type: 'DM_SENT', execution_status: 'sent', lead_id: 'l1' },
        { actor_id: 'r2', action_type: 'DM_SENT', execution_status: 'sent', lead_id: 'l1' },
        { actor_id: 'r1', action_type: 'REPLY_RECEIVED', execution_status: 'sent', lead_id: 'l2' },
        { actor_id: 'r1', action_type: 'DM_SENT', execution_status: 'sent', lead_id: null },
      ],
      (e) => (e.lead_id ? profileOf[e.lead_id] ?? 'none' : 'none'),
    )
    expect(groups.get('p1')!.messages).toBe(2)
    expect(groups.get('p2')!.replies).toBe(1)
    expect(groups.get('none')!.messages).toBe(1)
  })
})

describe('SOURCE_PERFORMANCE', () => {
  it('SOURCE_BUCKETS: linkedin / upwork / everything else, never guessed', () => {
    expect(sourceBucket('linkedin')).toBe('linkedin')
    expect(sourceBucket('UPWORK')).toBe('upwork')
    expect(sourceBucket('referral')).toBe('other')
    expect(sourceBucket(null)).toBe('other')
  })
})

// ─── ACCOUNT_360 / ACCOUNT_PEOPLE ────────────────────────────────────────────

describe('ACCOUNT_360', () => {
  const leads = [
    accountLead({ id: 'l1', contactName: 'Sarah Chen', score: 82, lastReplyAt: hoursAgo(3), lastSentAt: hoursAgo(10), stage: 'replied', status: 'replied' }),
    accountLead({ id: 'l2', contactName: 'Tom Lee', contactTitle: 'CTO', ownerRepId: 'r2', ownerName: 'Aneeb', profileId: 'p2', profileName: 'Aneeb Upwork', score: 60 }),
    accountLead({ id: 'l3', contactName: 'Ana Ruiz', status: 'won', stage: 'won', wonAt: hoursAgo(200), score: 90 }),
    accountLead({ id: 'l4', companyKey: 'orbit', company: 'Orbit', contactName: 'Ola', lastSentAt: null }),
  ]

  it('ACCOUNT_GROUPING: one row per company key, with people, profiles and owners', () => {
    const rows = groupAccounts(leads, NOW)
    const acme = rows.find((r) => r.companyKey === 'acme')!
    expect(rows).toHaveLength(2)
    expect(acme.people).toBe(3)
    expect(acme.activeOpportunities).toBe(2)
    expect(acme.profiles.sort()).toEqual(['Aneeb Upwork', 'Mehak LinkedIn'])
    expect(acme.owners.sort()).toEqual(['Aneeb', 'Mehak'])
    expect(acme.relationship).toBe('won')
    expect(acme.nextAction).toBe('Reply to Sarah Chen')
  })

  it('ACCOUNT_OVERVIEW: potential uses existing bands on the best open lead; revenue is not invented', () => {
    const overview = buildAccountOverview(leads.filter((l) => l.companyKey === 'acme'), NOW)!
    expect(overview.company).toBe('Acme')
    expect(overview.potential.leadId).toBe('l1')
    expect(overview.potential.score).toBe(82)
    expect(overview.metrics).toMatchObject({ people: 3, openLeads: 2, activeConversations: 1, wins: 1 })
    expect(Object.keys(overview.metrics)).not.toContain('revenue')
  })

  it('ACCOUNT_NEXT_ACTION: reply beats follow-up beats first contact', () => {
    expect(accountNextAction([accountLead({ lastSentAt: null })], NOW).label).toBe('Contact Sarah Chen')
    expect(accountNextAction([accountLead({ nextFollowupAt: hoursAgo(1) })], NOW).label).toBe('Follow up with Sarah Chen')
    expect(accountNextAction([accountLead({ status: 'won' })], NOW).label).toBe('No open opportunity')
  })

  it('ACCOUNT_360_EMPTY: no visible leads means no account (404 upstream)', () => {
    expect(buildAccountOverview([], NOW)).toBeNull()
  })
})

describe('ACCOUNT_PEOPLE', () => {
  it('ACCOUNT_PEOPLE_LIST: every known person with title, stage, profile and owner', () => {
    const overview = buildAccountOverview(
      [
        accountLead({ id: 'l1', contactName: 'Sarah Chen', lastReplyAt: hoursAgo(1), stage: 'replied' }),
        accountLead({ id: 'l2', contactName: null, contactTitle: null, profileName: null, status: 'new', lastSentAt: null, createdAt: hoursAgo(500) }),
      ],
      NOW,
    )!
    expect(overview.people[0]).toMatchObject({ name: 'Sarah Chen', title: 'VP Engineering', stageLabel: 'In conversation', profileName: 'Mehak LinkedIn', ownerName: 'Mehak' })
    expect(overview.people[1]).toMatchObject({ name: 'Unnamed contact', stageLabel: 'Not contacted', profileName: null })
  })
})

// ─── GLOBAL_SEARCH ───────────────────────────────────────────────────────────

describe('GLOBAL_SEARCH', () => {
  it('GLOBAL_SEARCH_SANITIZE: PostgREST syntax and wildcards are stripped', () => {
    expect(sanitizeSearchTerm('acme,(or)%*')).toBe('acme or')
    expect(sanitizeSearchTerm('  sarah   chen ')).toBe('sarah chen')
    expect(sanitizeSearchTerm('x'.repeat(100))).toHaveLength(60)
  })

  it('GLOBAL_SEARCH_GROUPS: people, companies, leads, tasks, conversations — grouped and linked', () => {
    const groups = buildSearchGroups({
      term: 'acme',
      people: [],
      leads: [
        { id: 'l1', contact_name: 'Sarah Chen', company: 'Acme', company_key: 'acme', contact_title: 'VP' },
        { id: 'l2', contact_name: 'Tom', company: 'Acme', company_key: 'acme', contact_title: null },
        { id: 'l3', contact_name: 'Acme Fan', company: 'Orbit', company_key: 'orbit', contact_title: null },
      ],
      conversationLeadIds: new Set(['l1']),
      tasks: [{ id: 't1', title: 'Reply to Acme', status: 'OPEN', assigneeName: 'Mehak' }],
      canOpenRep: true,
    })
    expect(groups.companies).toEqual([{ id: 'acme', label: 'Acme', detail: null, href: '/accounts/acme' }])
    expect(groups.leads.map((l) => l.label)).toEqual(['Acme Fan · Orbit', 'Sarah Chen · Acme', 'Tom · Acme'])
    expect(groups.tasks[0]).toMatchObject({ href: '/tasks?task=assigned:t1', detail: 'Mehak · Open' })
    expect(groups.conversations).toEqual([{ id: 'c:l1', label: 'Sarah Chen · Acme', detail: 'Conversation', href: '/chats?lead=l1' }])
  })

  it('GLOBAL_SEARCH_REP_LINKS: reps are not sent into manager surfaces', () => {
    const groups = buildSearchGroups({
      term: 'me',
      people: [{ id: 'r1', name: 'Mehak' }],
      leads: [],
      conversationLeadIds: new Set(),
      tasks: [{ id: 't1', title: 'Meet', status: 'OPEN', assigneeName: null }],
      canOpenRep: false,
    })
    expect(groups.people[0].href).toBe('/performance')
    expect(groups.tasks[0].href).toBe('/tasks?task=assigned:t1')
  })
})

// ─── SAVED_VIEWS ─────────────────────────────────────────────────────────────

describe('SAVED_VIEWS', () => {
  it('SAVED_VIEWS_QUERY: drops paging, drawer state, odd keys and oversize values', () => {
    expect(sanitizeViewQuery('?view=overdue&page=3&task=abc&group=rep')).toBe('view=overdue&group=rep')
    expect(sanitizeViewQuery('bad-key=1&ok=2')).toBe('ok=2')
    expect(sanitizeViewQuery(`q=${'x'.repeat(300)}&range=7d`)).toBe('range=7d')
    expect(sanitizeViewQuery(42)).toBe('')
  })

  it('SAVED_VIEWS_NAME: trimmed, required, bounded', () => {
    expect(normalizeViewName('  Replies   waiting >4h ')).toBe('Replies waiting >4h')
    expect(() => normalizeViewName('   ')).toThrow(SavedViewError)
    expect(() => normalizeViewName('x'.repeat(81))).toThrow(SavedViewError)
  })

  it('SAVED_VIEWS_SURFACE: only known surfaces; href restores the filters', () => {
    expect(isSavedViewSurface('team.tasks')).toBe(true)
    expect(isSavedViewSurface('admin.secrets')).toBe(false)
    expect(isSavedViewSurface('__proto__')).toBe(false)
    expect(savedViewHref('team.tasks', 'view=overdue')).toBe('/tasks?scope=team?view=overdue')
    expect(savedViewHref('accounts', '')).toBe('/accounts')
  })
})

// ─── INTERNAL_NOTES ──────────────────────────────────────────────────────────

describe('INTERNAL_NOTES', () => {
  const auth = (over: Partial<AuthContext>): AuthContext => ({
    repId: 'mgr', orgId: 'org', orgName: 'Org', organizationRole: 'MEMBER', teamMemberships: [], managedTeamIds: ['bd'],
    memberTeamIds: [], capabilities: new Set(), isOwner: false, isAdmin: false, isManager: true, isMember: true, ...over,
  })

  it('NOTES_BODY: trimmed, non-empty, bounded', () => {
    expect(normalizeNoteBody('  Client asked for a revised proposal.\r\n ')).toBe('Client asked for a revised proposal.')
    expect(() => normalizeNoteBody('   ')).toThrow(NoteError)
    expect(() => normalizeNoteBody('x'.repeat(4001))).toThrow(NoteError)
  })

  it('NOTES_PERMISSIONS: author edits; author or admin deletes', () => {
    expect(notePermissions({ authorRepId: 'mgr' }, auth({}))).toEqual({ canEdit: true, canDelete: true })
    expect(notePermissions({ authorRepId: 'r1' }, auth({}))).toEqual({ canEdit: false, canDelete: false })
    expect(notePermissions({ authorRepId: 'r1' }, auth({ isAdmin: true }))).toEqual({ canEdit: false, canDelete: true })
  })

  it('NOTES_SUBJECT_SCOPE: rep notes outside the team are refused before any read', async () => {
    const client = { from: () => { throw new Error('should not query') } } as never
    await expect(assertNoteSubjectAccess(client, auth({}), teamScope, 'REP', 'outsider')).rejects.toMatchObject({ status: 403 })
    await expect(assertNoteSubjectAccess(client, auth({}), teamScope, 'REP', 'r1')).resolves.toBeUndefined()
  })

  it('NOTES_LEAD_SCOPE: a lead owned outside the team is refused', async () => {
    const leadOwner = (owner: string | null) =>
      ({
        from: () => {
          const builder = {
            select: () => builder,
            eq: () => builder,
            maybeSingle: async () => ({ data: owner === null ? null : { owner_rep_id: owner }, error: null }),
          }
          return builder
        },
      }) as never
    await expect(assertNoteSubjectAccess(leadOwner('outsider'), auth({}), teamScope, 'LEAD', 'l1')).rejects.toMatchObject({ status: 403 })
    await expect(assertNoteSubjectAccess(leadOwner(null), auth({}), teamScope, 'LEAD', 'l1')).rejects.toMatchObject({ status: 403 })
    await expect(assertNoteSubjectAccess(leadOwner('r2'), auth({}), teamScope, 'LEAD', 'l1')).resolves.toBeUndefined()
  })
})

// ─── URL_STATE ───────────────────────────────────────────────────────────────

describe('URL_STATE', () => {
  it('URL_STATE_PARSE: known values kept, junk dropped, defaults applied', () => {
    const f = parseOpsFilters({ range: '30d', source: 'upwork', rep: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', team: 'drop table', view: 'overdue' })
    expect(f).toMatchObject({ range: '30d', source: 'upwork', rep: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', team: null, view: 'overdue' })
    expect(parseOpsFilters({ range: 'forever' }, { range: 'today' }).range).toBe('today')
    expect(parseOpsFilters({ source: 'fax' }).source).toBeNull()
  })

  it('URL_STATE_HREF: patches keep other filters, clear empties and reset paging', () => {
    expect(opsHref('/team/tasks', { view: 'overdue', group: 'rep', page: '2' }, { group: 'priority' })).toBe('/team/tasks?view=overdue&group=priority')
    expect(opsHref('/team', { team: 'bd', view: 'attention' }, { view: null })).toBe('/team?team=bd')
    expect(opsHref('/accounts', { q: 'acme' }, { page: '2' })).toBe('/accounts?q=acme&page=2')
  })

  it('URL_STATE_WINDOW: windows are minute-aligned so one request shares them', () => {
    const a = rangeWindow('7d', new Date('2026-11-01T12:00:10Z'))
    const b = rangeWindow('7d', new Date('2026-11-01T12:00:50Z'))
    expect(a).toEqual(b)
    expect(rangeWindow('today', new Date('2026-11-01T12:00:10Z')).start).toBe('2026-11-01T00:00:00.000Z')
  })
})
