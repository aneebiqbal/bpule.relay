import { describe, expect, it } from 'vitest'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import { toUnifiedTaskFromAction, toUnifiedTaskFromAssigned } from '@/lib/tasks/map-unified-task'
import {
  classifyUnifiedTaskTab,
  countOpenUnifiedTasks,
  countOverdueUnifiedTasks,
  filterUnifiedTasks,
  isOverdue,
  rankUnifiedTasks,
} from '@/lib/tasks/rank-unified-tasks'
import { derivedTaskKind, derivedTaskPriority } from '@/lib/tasks/task-priority-policy'
import type { AssignedTaskRow, UnifiedTask } from '@/lib/tasks/types'
import { buildRepAttentionSignals } from '@/lib/team/attention-policy'

function action(partial: Partial<RelayTodayAction> & Pick<RelayTodayAction, 'id' | 'kind' | 'title'>): RelayTodayAction {
  return {
    priority: 'high',
    subtitle: 'Acme',
    href: `/leads/${partial.id}`,
    whatHappened: 'Client replied',
    whyItMatters: 'Positive commercial reply',
    whyLines: [],
    prepared: null,
    humanAction: 'REPLY_NOW',
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    fitScore: 8,
    identity: { id: 'prof-1', name: 'Mehak Seedat', title: null, channel: 'linkedin' },
    proof: null,
    inbound: true,
    ...partial,
  }
}

function assigned(partial: Partial<AssignedTaskRow> & Pick<AssignedTaskRow, 'id' | 'title'>): AssignedTaskRow {
  return {
    organization_id: 'org-1',
    assignee_rep_id: 'rep-a',
    created_by_rep_id: 'mgr-1',
    lead_id: 'lead-1',
    profile_id: 'prof-1',
    kind: 'REVIEW',
    description: 'Please review',
    priority: 'NORMAL',
    due_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    status: 'OPEN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    previous_assignee_rep_id: null,
    ...partial,
  }
}

describe('unified tasks — derived', () => {
  it('TASK_DERIVED_REPLY maps reply queue action to REPLY without persisting', () => {
    const a = action({ id: 'lead-reply', kind: 'reply_needed', title: 'Reply to Sarah Chen' })
    expect(derivedTaskKind(a)).toBe('REPLY')
    expect(derivedTaskPriority(a)).toBe('HIGH')
    const task = toUnifiedTaskFromAction(a, { organizationId: 'org-1', assigneeRepId: 'rep-a' })
    expect(task.source).toBe('DERIVED')
    expect(task.id.startsWith('derived:')).toBe(true)
    expect(task.kind).toBe('REPLY')
    expect(task.profileName).toBe('Mehak Seedat')
    expect(task.action.label).toBe('Reply')
  })

  it('TASK_DERIVED_FOLLOWUP uses createdAt as dueAt when policy already due', () => {
    const a = action({
      id: 'lead-fu',
      kind: 'followup_due',
      title: 'Follow up Acme',
      humanAction: 'SEND_FOLLOWUP',
      whatHappened: 'Follow-up due',
      createdAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
    })
    const task = toUnifiedTaskFromAction(a, { organizationId: 'org-1', assigneeRepId: 'rep-a' })
    expect(task.kind).toBe('FOLLOW_UP')
    expect(task.dueAt).toBe(a.createdAt)
    expect(isOverdue(task)).toBe(true)
  })

  it('TASK_DERIVED_RESOLVES_FROM_STATE — derived completion is state projection (no manual DONE)', () => {
    const a = action({ id: 'lead-x', kind: 'reply_needed', title: 'Reply' })
    const task = toUnifiedTaskFromAction(a, { organizationId: 'org-1', assigneeRepId: 'rep-a' })
    expect(task.status).toBe('OPEN')
    // When source disappears from queue, it simply is not mapped — no DONE row.
    expect(filterUnifiedTasks([], { tab: 'completed' })).toEqual([])
  })

  it('TASK_PROFILE_ATTRIBUTION comes from action identity, not selected profile inference', () => {
    const a = action({
      id: 'lead-y',
      kind: 'reply_needed',
      title: 'Reply',
      identity: { id: 'p2', name: 'Aneeb', title: null, channel: 'linkedin' },
    })
    const task = toUnifiedTaskFromAction(a, { organizationId: 'org-1', assigneeRepId: 'rep-a' })
    expect(task.profileId).toBe('p2')
    expect(task.profileName).toBe('Aneeb')
  })
})

describe('unified tasks — assigned', () => {
  it('TASK_ASSIGNED_PERSISTS as ASSIGNED with human fields', () => {
    const row = assigned({ id: 't1', title: 'Review enterprise lead', kind: 'REVIEW' })
    const task = toUnifiedTaskFromAssigned(row, {
      companyName: 'NorthPeak',
      createdByName: 'Hassan',
      profileName: 'Aneeb',
    })
    expect(task.source).toBe('ASSIGNED')
    expect(task.reason).toContain('Hassan')
    expect(task.companyName).toBe('NorthPeak')
    expect(task.id).toBe('assigned:t1')
  })

  it('TASK_NO_DUPLICATE — derived and assigned use distinct id namespaces', () => {
    const d = toUnifiedTaskFromAction(
      action({ id: 'same', kind: 'reply_needed', title: 'R' }),
      { organizationId: 'org-1', assigneeRepId: 'rep-a' },
    )
    const a = toUnifiedTaskFromAssigned(assigned({ id: 'same', title: 'R' }))
    expect(d.id).not.toBe(a.id)
    expect(new Set([d.id, a.id]).size).toBe(2)
  })

  it('TASK_OVERDUE for assigned when dueAt past and open', () => {
    const task = toUnifiedTaskFromAssigned(
      assigned({
        id: 'late',
        title: 'Late',
        due_at: new Date(Date.now() - 3_600_000).toISOString(),
        status: 'OPEN',
      }),
    )
    expect(isOverdue(task)).toBe(true)
    expect(classifyUnifiedTaskTab(task)).toBe('overdue')
  })

  it('TASK_COMPLETE assigned stays historical in completed tab', () => {
    const task = toUnifiedTaskFromAssigned(
      assigned({
        id: 'done',
        title: 'Done task',
        status: 'DONE',
        completed_at: new Date().toISOString(),
      }),
    )
    expect(classifyUnifiedTaskTab(task)).toBe('completed')
  })
})

describe('unified tasks — ranking & parity', () => {
  it('rankUnifiedTasks puts CRITICAL assigned and REPLY first', () => {
    const tasks: UnifiedTask[] = [
      toUnifiedTaskFromAssigned(
        assigned({ id: 'n', title: 'Normal', priority: 'NORMAL' }),
      ),
      toUnifiedTaskFromAction(
        action({ id: 'r', kind: 'reply_needed', title: 'Reply' }),
        { organizationId: 'org-1', assigneeRepId: 'rep-a' },
      ),
      toUnifiedTaskFromAssigned(
        assigned({ id: 'c', title: 'Critical', priority: 'CRITICAL' }),
      ),
    ]
    const ranked = rankUnifiedTasks(tasks)
    expect(ranked[0].priority).toBe('CRITICAL')
    expect(ranked[1].kind).toBe('REPLY')
  })

  it('REP HOME TASK PARITY — open counts match filter helpers', () => {
    const tasks = [
      toUnifiedTaskFromAction(
        action({ id: '1', kind: 'reply_needed', title: 'R' }),
        { organizationId: 'org-1', assigneeRepId: 'rep-a' },
      ),
      toUnifiedTaskFromAssigned(assigned({ id: '2', title: 'A' })),
    ]
    const open = countOpenUnifiedTasks(tasks)
    const filtered = filterUnifiedTasks(tasks, { tab: 'all' }).filter(
      (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS',
    )
    expect(open).toBe(filtered.length)
  })

  it('MANAGER TASK PARITY — TASKS_OVERDUE attention uses overdueTasks count', () => {
    const signals = buildRepAttentionSignals({
      repId: 'r1',
      repName: 'Mehak',
      activeProfile: 'LI',
      completedToday: 2,
      repliesWaiting: 0,
      followUpsOverdue: 0,
      highPriorityUntouched: 0,
      overdueTasks: 4,
      meetings: 0,
      wins: 0,
      targetPct: 50,
      oldestReplyAgeHours: null,
      oldestFollowUpAgeHours: null,
      oldestHighPriorityAgeHours: null,
      oldestOverdueTaskAgeHours: 30,
      lastActivityAt: new Date().toISOString(),
      hasProfileAssignment: true,
      requiredRemaining: 0,
      dayState: 'ACTIVE',
    })
    const overdue = signals.find((s) => s.category === 'TASKS_OVERDUE')
    expect(overdue).toBeTruthy()
    expect(overdue!.count).toBe(4)
    expect(overdue!.href).toContain('/tasks')
  })

  it('countOverdueUnifiedTasks matches overdue tab filter', () => {
    const tasks = [
      toUnifiedTaskFromAssigned(
        assigned({
          id: 'late',
          title: 'Late',
          due_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
      toUnifiedTaskFromAssigned(
        assigned({
          id: 'soon',
          title: 'Soon',
          due_at: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      ),
    ]
    expect(countOverdueUnifiedTasks(tasks)).toBe(
      filterUnifiedTasks(tasks, { tab: 'overdue' }).length,
    )
  })
})

describe('task priority policy — single mapping', () => {
  it('thread mismatch style copy → CRITICAL', () => {
    const a = action({
      id: 'm',
      kind: 'reply_needed',
      title: 'Review thread',
      whatHappened: 'Thread mismatch needs review',
      whyItMatters: 'Thread mismatch',
    })
    expect(derivedTaskPriority(a)).toBe('CRITICAL')
  })

  it('research → NORMAL', () => {
    const a = action({
      id: 'res',
      kind: 'high_fit_lead',
      title: 'Research',
      humanAction: 'RESEARCH',
      priority: 'medium',
      whatHappened: 'Missing evidence',
    })
    expect(derivedTaskPriority(a)).toBe('NORMAL')
  })
})
