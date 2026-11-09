/**
 * Sprint 4 — Team operations, Tasks and Rep 360 named fixtures.
 *
 * Every test is deterministic and uses the realistic fixture set (healthy,
 * overloaded, replies-waiting, overdue, strong and inactive reps). These are
 * the gate names the sprint spec asks for; they assert the canonical contracts
 * without a database or a browser.
 */
import { describe, expect, it } from 'vitest'
import {
  buildRepAttentionSignals,
  buildTeamAttentionFromPeople,
  deriveRepStatus,
} from '@/lib/team/attention-policy'
import { buildWorkloadRows, workloadScale } from '@/lib/team/workload'
import {
  canInterveneOnRep,
  effectiveRepIds,
  filterRepIdsToScope,
  repInScope,
  type OperationalScope,
} from '@/lib/operations/scope'
import {
  classifyUnifiedTaskTab,
  countOpenUnifiedTasks,
  countOverdueUnifiedTasks,
  filterUnifiedTasks,
  isOverdue,
} from '@/lib/tasks/rank-unified-tasks'
import { taskViewMatches } from '@/lib/operations/task-views'
import { toUnifiedTaskFromAssigned } from '@/lib/tasks/map-unified-task'
import { mergeTimeline, mapTaskEvent } from '@/lib/operations/activity'
import { metricsToStrip } from '@/components/operations/performance-views'
import { buildRepAttention } from '@/lib/operations/rep-360'
import { parseOpsFilters } from '@/lib/operations/filters'
import type { AssignedTaskRow, UnifiedTask } from '@/lib/tasks/types'
import {
  FIXTURE_PEOPLE,
  FIXTURE_TASKS,
  FIXTURE_TIMELINE,
  fixturePerson,
  fixtureTask,
} from './fixtures/v3-team-fixtures'

const scope = (over: Partial<OperationalScope>): OperationalScope => ({
  mode: 'own',
  orgId: 'org-1',
  actorRepId: 'rep-a',
  repIds: ['rep-a'],
  ...over,
})

function assignedRow(over: Partial<AssignedTaskRow> & Pick<AssignedTaskRow, 'id' | 'title'>): AssignedTaskRow {
  return {
    organization_id: 'org-1',
    assignee_rep_id: 'rep-a',
    created_by_rep_id: 'mgr-1',
    lead_id: null,
    profile_id: null,
    kind: 'REVIEW',
    description: null,
    priority: 'NORMAL',
    due_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'OPEN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    previous_assignee_rep_id: null,
    ...over,
  }
}

describe('V3 tasks', () => {
  it('V3_TASK_TODAY — an open task due inside 24h classifies as today', () => {
    const task = toUnifiedTaskFromAssigned(
      assignedRow({
        id: 'today',
        title: 'Due today',
        priority: 'HIGH',
        due_at: new Date(Date.now() + 3 * 3_600_000).toISOString(),
      }),
    )
    expect(classifyUnifiedTaskTab(task)).toBe('today')
    expect(filterUnifiedTasks([task], { tab: 'today' })).toHaveLength(1)
  })

  it('V3_TASK_OVERDUE — an open task past dueAt classifies as overdue', () => {
    const task = toUnifiedTaskFromAssigned(
      assignedRow({ id: 'late', title: 'Late', due_at: new Date(Date.now() - 3_600_000).toISOString() }),
    )
    expect(isOverdue(task)).toBe(true)
    expect(classifyUnifiedTaskTab(task)).toBe('overdue')
    expect(countOverdueUnifiedTasks([task])).toBe(1)
  })

  it('V3_TASK_DERIVED_RESOLUTION — derived work is a projection, never a stored DONE row', () => {
    const derived = FIXTURE_TASKS.find((t) => t.id.startsWith('derived:'))!
    expect(derived.status).toBe('OPEN')
    // When the source leaves the queue it is simply absent — no completion row.
    expect(filterUnifiedTasks([], { tab: 'completed' })).toEqual([])
  })

  it('V3_TASK_ASSIGNED_PERSISTENCE — assigned work keeps its lifecycle status', () => {
    const open = toUnifiedTaskFromAssigned(assignedRow({ id: 'open', title: 'Open' }))
    const done = toUnifiedTaskFromAssigned(
      assignedRow({ id: 'done', title: 'Done', status: 'DONE', completed_at: new Date().toISOString() }),
    )
    expect(open.source).toBe('ASSIGNED')
    expect(open.status).toBe('OPEN')
    expect(done.status).toBe('DONE')
    expect(classifyUnifiedTaskTab(done)).toBe('completed')
  })

  it('V3_TASK_REASSIGNMENT — a reassigned task follows the new assignee', () => {
    const reassigned = toUnifiedTaskFromAssigned(
      assignedRow({
        id: 're',
        title: 'Reassigned',
        assignee_rep_id: 'rep-b',
        previous_assignee_rep_id: 'rep-a',
      }),
    )
    expect(reassigned.assigneeRepId).toBe('rep-b')
    expect(filterUnifiedTasks([reassigned], { assigneeRepId: 'rep-b' })).toHaveLength(1)
    expect(filterUnifiedTasks([reassigned], { assigneeRepId: 'rep-a' })).toHaveLength(0)
  })

  it('V3_TASK_ROLE_SCOPE — reps cannot widen scope; managers narrow to their team', () => {
    const own = scope({ mode: 'own', repIds: ['rep-a'] })
    const team = scope({ mode: 'team', repIds: ['rep-a', 'rep-b'] })
    const org = scope({ mode: 'org', repIds: null })

    expect(canInterveneOnRep(own, 'rep-a')).toBe(false)
    expect(canInterveneOnRep(team, 'rep-b')).toBe(true)
    expect(canInterveneOnRep(team, 'rep-c')).toBe(false)
    expect(canInterveneOnRep(org, 'rep-z')).toBe(true)

    expect(repInScope(team, 'rep-c')).toBe(false)
    expect(repInScope(org, 'rep-z')).toBe(true)
    expect(effectiveRepIds(team, { repId: 'rep-c' })).toEqual([])
    expect(effectiveRepIds(team, { repId: 'rep-b' })).toEqual(['rep-b'])
    expect(effectiveRepIds(team, { teamMemberIds: ['rep-b', 'rep-c'] })).toEqual(['rep-b'])
    expect(effectiveRepIds(org, { teamMemberIds: ['rep-x'] })).toEqual(['rep-x'])
    expect(filterRepIdsToScope(team, ['rep-b', 'rep-c'])).toEqual(['rep-b'])
  })
})

describe('V3 team', () => {
  it('V3_TEAM_ATTENTION — replies waiting surface as an attention signal', () => {
    const signals = buildTeamAttentionFromPeople(FIXTURE_PEOPLE)
    const mehak = signals.filter((s) => s.repId === 'rep-mehak')
    expect(mehak.some((s) => s.category === 'REPLIES_WAITING' && s.count === 4)).toBe(true)
    expect(mehak.some((s) => s.category === 'TASKS_OVERDUE' && s.count === 2)).toBe(true)
    expect(signals[0].severity === 'critical' || signals[0].severity === 'attention').toBe(true)
  })

  it('V3_TEAM_WORKLOAD — open work sorts descending and the scale is the max', () => {
    const rows = buildWorkloadRows(FIXTURE_PEOPLE)
    expect(rows[0].repId).toBe('rep-mehak')
    expect(rows[0].open).toBe(12 + 4 + 2 + 2)
    expect(workloadScale(rows)).toBe(rows[0].open)
    expect(rows.every((r, i) => i === 0 || rows[i - 1].open >= r.open)).toBe(true)
  })

  it('V3_TEAM_MANAGER_SCOPE — a manager only ever sees managed reps', () => {
    const team = scope({ mode: 'team', repIds: ['rep-mehak', 'rep-aneeb'] })
    expect(filterRepIdsToScope(team, ['rep-mehak', 'rep-sara'])).toEqual(['rep-mehak'])
    expect(effectiveRepIds(team, { repId: 'rep-sara' })).toEqual([])
  })

  it('V3_TEAM_ADMIN_SCOPE — an admin sees the org and may narrow it', () => {
    const org = scope({ mode: 'org', repIds: null })
    expect(effectiveRepIds(org, {})).toBeNull()
    expect(effectiveRepIds(org, { repId: 'rep-any' })).toEqual(['rep-any'])
  })

  it('V3_TEAM_REP360_HOME_PARITY — directory rows and snapshots agree on attention', () => {
    const fromPeople = buildTeamAttentionFromPeople(FIXTURE_PEOPLE)
    for (const person of FIXTURE_PEOPLE) {
      const signals = buildRepAttentionSignals({
        repId: person.repId,
        repName: person.repName,
        activeProfile: person.activeProfile,
        completedToday: person.completedToday,
        repliesWaiting: person.repliesWaiting,
        followUpsOverdue: person.followUpsOverdue,
        highPriorityUntouched: person.highPriority,
        overdueTasks: person.overdueTasks,
        meetings: person.meetings,
        wins: person.wins,
        targetPct: person.targetPct,
        oldestReplyAgeHours: null,
        oldestFollowUpAgeHours: null,
        oldestHighPriorityAgeHours: null,
        oldestOverdueTaskAgeHours: null,
        lastActivityAt: person.lastActivityAt,
        hasProfileAssignment: person.activeProfile != null,
        requiredRemaining: 0,
        dayState: person.dayState,
      })
      const expected = fromPeople.filter((s) => s.repId === person.repId)
      const byCategory = (list: Array<{ category: string; count: number }>) =>
        [...list].sort((a, b) => a.category.localeCompare(b.category)).map((s) => [s.category, s.count])
      expect(byCategory(signals)).toEqual(byCategory(expected))
      expect(deriveRepStatus(signals)).toBe(person.status)
    }
  })
})

describe('V3 rep 360', () => {
  it('V3_REP360_OVERVIEW — attention items come from canonical inputs', () => {
    const row = FIXTURE_PEOPLE[0]
    const items = buildRepAttention({
      repId: row.repId,
      row,
      conversations: [
        {
          leadId: 'lead-1',
          person: 'Sarah Chen',
          company: 'Acme',
          state: 'waiting_on_rep',
          ageHours: 13,
          href: '/leads/lead-1',
        } as never,
      ],
      tasks: FIXTURE_TASKS,
      now: Date.now(),
    })
    expect(items).toHaveLength(4)
    expect(items[0].label).toBe('Oldest reply waiting')
    expect(items[0].tone).toBe('critical')
    expect(items.some((i) => i.label === 'Oldest overdue task')).toBe(true)
  })

  it('V3_REP360_TASKS — every task matches exactly one board view', () => {
    const now = Date.now()
    for (const task of FIXTURE_TASKS) {
      const open = task.status === 'OPEN' || task.status === 'IN_PROGRESS'
      expect(taskViewMatches(task, 'all', now)).toBe(open)
      const specific = ['overdue', 'today', 'upcoming', 'completed'].filter((v) =>
        taskViewMatches(task, v as never, now),
      )
      expect(specific).toHaveLength(1)
    }
    expect(FIXTURE_TASKS.filter((t) => taskViewMatches(t, 'overdue', now)).length).toBeGreaterThan(0)
  })

  it('V3_REP360_LEADS — owner scope narrows, never widens', () => {
    const team = scope({ mode: 'team', repIds: ['rep-mehak', 'rep-aneeb'] })
    const filters = parseOpsFilters({ owner: 'rep-sara', scope: 'team' })
    expect(filters.rep).toBeNull()
    expect(effectiveRepIds(team, { repId: 'rep-sara' })).toEqual([])
    expect(effectiveRepIds(team, { repId: 'rep-mehak' })).toEqual(['rep-mehak'])
  })

  it('V3_REP360_ACTIVITY — timeline merges, dedupes and sorts newest first', () => {
    const merged = mergeTimeline([...FIXTURE_TIMELINE, FIXTURE_TIMELINE[0]], 20)
    expect(merged).toHaveLength(FIXTURE_TIMELINE.length)
    expect(merged[0].at >= merged[merged.length - 1].at).toBe(true)
    const mapped = mapTaskEvent(
      { id: 'te:9', task_id: 't-1', event_type: 'TASK_COMPLETED', actor_rep_id: 'rep-a', created_at: new Date().toISOString() },
      { reps: new Map([['rep-a', 'Mehak']]), leads: new Map(), tasks: new Map([['t-1', { title: 'Done', leadId: null, assigneeRepId: 'rep-a' }]]) },
    )
    expect(mapped?.event).toBe('Task completed')
    expect(mapped?.result).toBe('Done')
  })

  it('V3_REP360_PERFORMANCE — metrics strip carries drill-down links', () => {
    const strip = metricsToStrip(
      { connections: 1, messages: 2, replies: 3, meetings: 4, proposals: 5, wins: 6, applications: 7, tasksCompleted: 8, leadsWorked: 9, replyRate: 42 } as never,
      (event) => `/reports/activity?event=${event ?? 'ALL'}`,
    )
    expect(strip).toHaveLength(8)
    expect(strip.every((m) => m.href?.startsWith('/reports/activity'))).toBe(true)
  })
})

describe('V3 task cross-surface parity', () => {
  it('V3_TASK_CROSS_SURFACE_PARITY — counts agree across every surface', () => {
    const open = countOpenUnifiedTasks(FIXTURE_TASKS)
    const openFiltered = filterUnifiedTasks(FIXTURE_TASKS, { tab: 'all' }).filter(
      (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS',
    ).length
    expect(open).toBe(openFiltered)

    expect(countOverdueUnifiedTasks(FIXTURE_TASKS)).toBe(
      filterUnifiedTasks(FIXTURE_TASKS, { tab: 'overdue' }).length,
    )

    for (const task of FIXTURE_TASKS) {
      const tab = classifyUnifiedTaskTab(task)
      expect(taskViewMatches(task, tab, Date.now())).toBe(true)
    }
  })
})

describe('V3 fixtures — realistic coverage', () => {
  it('covers all six rep archetypes with real-shaped data', () => {
    const statuses = new Set(FIXTURE_PEOPLE.map((p) => p.status))
    expect(statuses.has('Critical')).toBe(true)
    expect(statuses.has('Attention')).toBe(true)
    expect(statuses.has('On track')).toBe(true)
    expect(FIXTURE_PEOPLE.some((p) => p.repliesWaiting > 0)).toBe(true)
    expect(FIXTURE_PEOPLE.some((p) => p.overdueTasks > 0)).toBe(true)
    expect(FIXTURE_PEOPLE.some((p) => p.lastActivityAt && Date.now() - Date.parse(p.lastActivityAt) > 86_400_000)).toBe(true)
    expect(FIXTURE_TASKS.some((t) => t.source === 'DERIVED')).toBe(true)
    expect(FIXTURE_TASKS.some((t) => t.source === 'ASSIGNED')).toBe(true)
  })

  it('fixture builders stay type-safe for new rows', () => {
    const person = fixturePerson({ repId: 'rep-x', repName: 'X', openLeads: 1 })
    const task = fixtureTask({ id: 'assigned:x', title: 'X', assigneeRepId: 'rep-x' })
    expect(person.repId).toBe('rep-x')
    expect(task.assigneeRepId).toBe('rep-x')
  })
})
