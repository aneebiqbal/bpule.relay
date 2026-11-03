/**
 * Deterministic Sprint 4 fixtures — realistic people, tasks and timeline rows
 * for browser QA and parity tests. No lorem ipsum: every row is a plausible
 * operational state, and the set covers the six rep archetypes the sprint spec
 * calls for (healthy, overloaded, replies waiting, overdue, strong, inactive).
 */
import type { PeopleRow } from '@/lib/operations/people'
import type { UnifiedTask } from '@/lib/tasks/types'
import type { TimelineRow } from '@/lib/operations/activity'

const NOW = Date.now()
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()
const HOUR = 3_600_000
const DAY = 24 * HOUR

export const FIXTURE_NOW = NOW

export function fixturePerson(overrides: Partial<PeopleRow> & Pick<PeopleRow, 'repId' | 'repName'>): PeopleRow {
  return {
    activeProfile: `${overrides.repName} LinkedIn`,
    channel: 'linkedin',
    completedToday: 0,
    repliesWaiting: 0,
    followUpsOverdue: 0,
    highPriority: 0,
    overdueTasks: 0,
    meetings: 0,
    wins: 0,
    targetPct: 0,
    status: 'On track',
    roleLabel: 'Rep',
    teams: [],
    openLeads: 0,
    lastActivityAt: iso(-18 * 60_000),
    dayState: 'ACTIVE',
    ...overrides,
  }
}

export const FIXTURE_PEOPLE: PeopleRow[] = [
  // Overloaded — most open work, replies waiting, overdue tasks.
  fixturePerson({
    repId: 'rep-mehak',
    repName: 'Mehak Seedat',
    roleLabel: 'Senior Software Engineer',
    completedToday: 6,
    repliesWaiting: 4,
    followUpsOverdue: 2,
    highPriority: 3,
    overdueTasks: 2,
    meetings: 2,
    wins: 0,
    targetPct: 78,
    status: 'Critical',
    openLeads: 12,
    teams: [{ id: 'team-eng', name: 'Engineering' }],
    dayState: 'CRITICAL',
  }),
  // Healthy — steady, nothing waiting.
  fixturePerson({
    repId: 'rep-aneeb',
    repName: 'Aneeb',
    roleLabel: 'Software Engineer',
    completedToday: 11,
    repliesWaiting: 0,
    followUpsOverdue: 0,
    highPriority: 0,
    overdueTasks: 0,
    meetings: 3,
    wins: 1,
    targetPct: 92,
    status: 'On track',
    openLeads: 9,
    teams: [{ id: 'team-eng', name: 'Engineering' }],
  }),
  // Replies waiting — inbound moved last.
  fixturePerson({
    repId: 'rep-madiha',
    repName: 'Madiha',
    roleLabel: 'Account Executive',
    completedToday: 4,
    repliesWaiting: 3,
    followUpsOverdue: 1,
    highPriority: 2,
    overdueTasks: 0,
    meetings: 1,
    wins: 0,
    targetPct: 64,
    status: 'Attention',
    openLeads: 6,
    lastActivityAt: iso(-5 * HOUR),
    teams: [{ id: 'team-sales', name: 'Sales' }],
  }),
  // Overdue tasks — assigned work past due.
  fixturePerson({
    repId: 'rep-hassan',
    repName: 'Hassan',
    roleLabel: 'Software Engineer',
    completedToday: 2,
    repliesWaiting: 0,
    followUpsOverdue: 0,
    highPriority: 0,
    overdueTasks: 3,
    meetings: 0,
    wins: 0,
    targetPct: 41,
    status: 'Critical',
    openLeads: 3,
    lastActivityAt: iso(-2 * HOUR),
    teams: [{ id: 'team-eng', name: 'Engineering' }],
  }),
  // Strong performance — target exceeded.
  fixturePerson({
    repId: 'rep-sara',
    repName: 'Sara',
    roleLabel: 'Senior Account Executive',
    completedToday: 18,
    repliesWaiting: 0,
    followUpsOverdue: 0,
    highPriority: 0,
    overdueTasks: 0,
    meetings: 5,
    wins: 2,
    targetPct: 110,
    status: 'On track',
    openLeads: 8,
    teams: [{ id: 'team-sales', name: 'Sales' }],
  }),
  // Inactive — no activity today.
  fixturePerson({
    repId: 'rep-omar',
    repName: 'Omar',
    roleLabel: 'SDR',
    completedToday: 0,
    repliesWaiting: 0,
    followUpsOverdue: 0,
    highPriority: 0,
    overdueTasks: 0,
    meetings: 0,
    wins: 0,
    targetPct: 12,
    status: 'Attention',
    openLeads: 2,
    lastActivityAt: iso(-30 * HOUR),
    dayState: 'NOT_STARTED',
    teams: [{ id: 'team-sales', name: 'Sales' }],
  }),
]

export function fixtureTask(overrides: Partial<UnifiedTask> & Pick<UnifiedTask, 'id' | 'title'>): UnifiedTask {
  return {
    source: 'ASSIGNED',
    kind: 'REVIEW',
    reason: 'Assigned task',
    organizationId: 'org-1',
    assigneeRepId: 'rep-mehak',
    priority: 'NORMAL',
    status: 'OPEN',
    createdAt: iso(-HOUR),
    action: { label: 'Open', href: '/tasks' },
    ...overrides,
  }
}

export const FIXTURE_TASKS: UnifiedTask[] = [
  fixtureTask({
    id: 'derived:lead-sarah',
    source: 'DERIVED',
    kind: 'REPLY',
    title: 'Reply to Sarah Chen',
    reason: 'Client replied · Acme',
    assigneeRepId: 'rep-mehak',
    priority: 'HIGH',
    createdAt: iso(-11 * HOUR),
    companyName: 'Acme',
    action: { label: 'Reply', href: '/leads/lead-sarah' },
  }),
  fixtureTask({
    id: 'derived:lead-john',
    source: 'DERIVED',
    kind: 'FOLLOW_UP',
    title: 'Follow up with John',
    reason: 'Follow-up due · Orbit',
    assigneeRepId: 'rep-madiha',
    priority: 'HIGH',
    dueAt: iso(-2 * HOUR),
    createdAt: iso(-DAY),
    companyName: 'Orbit',
    action: { label: 'Follow up', href: '/leads/lead-john' },
  }),
  fixtureTask({
    id: 'assigned:t-1',
    kind: 'REVIEW',
    title: 'Review enterprise lead',
    reason: 'From Hassan',
    assigneeRepId: 'rep-mehak',
    priority: 'HIGH',
    dueAt: iso(3 * HOUR),
    companyName: 'NorthPeak',
    createdByName: 'Hassan',
    action: { label: 'Open lead', href: '/leads/lead-1' },
  }),
  fixtureTask({
    id: 'assigned:t-2',
    kind: 'REQUEST_UPDATE',
    title: 'Update needed',
    reason: 'Manager requested an update · Aneeb',
    assigneeRepId: 'rep-hassan',
    priority: 'CRITICAL',
    dueAt: iso(-6 * HOUR),
    createdByName: 'Aneeb',
    action: { label: 'View task', href: '/tasks' },
  }),
  fixtureTask({
    id: 'assigned:t-3',
    kind: 'CALL',
    title: 'Call with Orbit',
    reason: 'From Aneeb',
    assigneeRepId: 'rep-aneeb',
    priority: 'NORMAL',
    dueAt: iso(2 * DAY),
    createdByName: 'Aneeb',
    action: { label: 'View task', href: '/tasks' },
  }),
  fixtureTask({
    id: 'assigned:t-4',
    kind: 'REVIEW',
    title: 'Quarterly business review',
    reason: 'From Sara',
    assigneeRepId: 'rep-sara',
    priority: 'NORMAL',
    status: 'DONE',
    dueAt: iso(-DAY),
    completedAt: iso(-HOUR),
    createdByName: 'Sara',
    action: { label: 'View task', href: '/tasks' },
  }),
]

export const FIXTURE_TIMELINE: TimelineRow[] = [
  {
    id: 'ae:1',
    at: iso(-18 * 60_000),
    actorRepId: 'rep-mehak',
    actorName: 'Mehak Seedat',
    profileName: 'Mehak Seedat LinkedIn',
    leadId: 'lead-1',
    leadLabel: 'Sarah Chen',
    company: 'Acme',
    companyKey: 'acme',
    event: 'Reply sent',
    category: 'conversation',
    result: 'LinkedIn',
    href: '/leads/lead-1',
    source: 'linkedin',
  },
  {
    id: 'te:1',
    at: iso(-2 * HOUR),
    actorRepId: 'rep-aneeb',
    actorName: 'Aneeb',
    profileName: 'Aneeb LinkedIn',
    leadId: null,
    leadLabel: null,
    company: null,
    companyKey: null,
    event: 'Task assigned',
    category: 'task',
    result: 'Review enterprise lead',
    href: '/tasks?task=assigned:t-1',
    source: null,
  },
  {
    id: 'ae:2',
    at: iso(-5 * HOUR),
    actorRepId: 'rep-madiha',
    actorName: 'Madiha',
    profileName: 'Madiha LinkedIn',
    leadId: 'lead-2',
    leadLabel: 'John',
    company: 'Orbit',
    companyKey: 'orbit',
    event: 'Inbound received',
    category: 'conversation',
    result: 'LinkedIn',
    href: '/leads/lead-2',
    source: 'linkedin',
  },
]

export const FIXTURE_TEAMS = [
  { id: 'team-eng', name: 'Engineering', memberIds: ['rep-mehak', 'rep-aneeb', 'rep-hassan'] },
  { id: 'team-sales', name: 'Sales', memberIds: ['rep-madiha', 'rep-sara', 'rep-omar'] },
]
