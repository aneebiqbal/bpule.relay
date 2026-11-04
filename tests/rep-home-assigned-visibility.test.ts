/**
 * Rep Home ↔ Tasks assigned-work parity (production bug, 4 Nov 2026).
 *
 * Assignment belongs to `assigned_tasks.assignee_rep_id` — never to the active
 * sending profile. Rep Home and /tasks must read the same canonical selection.
 * Fixtures use Madiha's real rep identity and Aneeb as the assigning manager.
 */
import { describe, expect, it } from 'vitest'
import type { RelayTodayAction } from '@/components/relay-today-workspace'
import { toUnifiedTaskFromAction, toUnifiedTaskFromAssigned } from '@/lib/tasks/map-unified-task'
import {
  classifyUnifiedTaskTab,
  filterUnifiedTasks,
  selectAssignedOpenTasks,
  selectAssignedOverdueTasks,
} from '@/lib/tasks/rank-unified-tasks'
import { formatOverdueBreakdown } from '@/lib/rep-home/v3-present'
import type { AssignedTaskRow, UnifiedTask } from '@/lib/tasks/types'

const ORG = '11111111-1111-1111-1111-111111111111'
const MADIHA = 'aaaaaaaa-0000-0000-0000-000000000003'
const ANEEB = 'aaaaaaaa-0000-0000-0000-000000000001'

function assignedRow(
  partial: Partial<AssignedTaskRow> & Pick<AssignedTaskRow, 'id' | 'title'>,
): AssignedTaskRow {
  return {
    organization_id: ORG,
    assignee_rep_id: MADIHA,
    created_by_rep_id: ANEEB,
    lead_id: null,
    profile_id: null,
    kind: 'REVIEW',
    description: null,
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

function derivedAction(partial: Partial<RelayTodayAction> & Pick<RelayTodayAction, 'id' | 'kind'>): RelayTodayAction {
  return {
    priority: 'high',
    title: 'Follow up Acme',
    subtitle: 'Acme',
    href: `/leads/${partial.id}`,
    whatHappened: 'Follow-up due',
    whyItMatters: 'Follow-up due',
    whyLines: [],
    prepared: null,
    humanAction: 'SEND_FOLLOWUP',
    createdAt: new Date().toISOString(),
    fitScore: null,
    identity: { id: 'profile-a', name: 'Madiha Irfan', title: null, channel: 'linkedin' },
    proof: null,
    inbound: false,
    ...partial,
  }
}

function unifiedAssigned(partial: Partial<AssignedTaskRow> & Pick<AssignedTaskRow, 'id' | 'title'>): UnifiedTask {
  return toUnifiedTaskFromAssigned(assignedRow(partial), {
    createdByName: 'Aneeb',
    assigneeName: 'Madiha',
  })
}

describe('REP_HOME_ASSIGNED_TASK_VISIBLE', () => {
  it('a persisted assigned task appears in the canonical assigned selection', () => {
    const task = unifiedAssigned({ id: 'task-madiha-1', title: 'Update needed', kind: 'REQUEST_UPDATE' })
    const selected = selectAssignedOpenTasks([task])
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('assigned:task-madiha-1')
    expect(selected[0].source).toBe('ASSIGNED')
    expect(selected[0].assigneeRepId).toBe(MADIHA)
    expect(selected[0].status).toBe('OPEN')
  })

  it('a Relay-derived follow-up is never labelled assigned', () => {
    const derived = toUnifiedTaskFromAction(
      derivedAction({ id: 'lead-1', kind: 'followup_due' }),
      { organizationId: ORG, assigneeRepId: MADIHA },
    )
    expect(derived.source).toBe('DERIVED')
    expect(selectAssignedOpenTasks([derived])).toHaveLength(0)
  })
})

describe('REP_HOME_ASSIGNED_TASK_COUNT_PARITY', () => {
  it('Rep Home assigned count equals the /tasks assigned-source count', () => {
    const tasks = [
      unifiedAssigned({ id: 'open-1', title: 'Update needed' }),
      unifiedAssigned({ id: 'done-1', title: 'Complete daily stats', status: 'DONE', completed_at: new Date().toISOString() }),
      toUnifiedTaskFromAction(derivedAction({ id: 'lead-1', kind: 'followup_due' }), { organizationId: ORG, assigneeRepId: MADIHA }),
    ]
    const repHomeCount = selectAssignedOpenTasks(tasks).length
    const tasksWorkspaceCount = filterUnifiedTasks(tasks, { source: 'ASSIGNED', tab: 'all' }).filter(
      (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS',
    ).length
    expect(repHomeCount).toBe(1)
    expect(repHomeCount).toBe(tasksWorkspaceCount)
  })
})

describe('REP_ASSIGNED_TASK_PROFILE_INDEPENDENCE', () => {
  it('the same assignment is selected under profile A and profile B', () => {
    const profileA = unifiedAssigned({ id: 'profile-task', title: 'Update needed' })
    const profileB = { ...profileA, profileId: 'profile-b', profileName: 'Fizza' }
    const selected = selectAssignedOpenTasks([profileA, profileB])
    expect(selected).toHaveLength(2)
    expect(selected.map((t) => t.id)).toEqual(['assigned:profile-task', 'assigned:profile-task'])
  })
})

describe('REP_ASSIGNED_TASK_MANAGER_FLOW', () => {
  it('a manager-created task is visible to the named assignee, not the manager', () => {
    const task = unifiedAssigned({ id: 'manager-task', title: 'Update needed' })
    expect(task.createdBy).toBe(ANEEB)
    expect(task.assigneeRepId).toBe(MADIHA)
    expect(selectAssignedOpenTasks([task]).map((t) => t.id)).toEqual(['assigned:manager-task'])
  })
})

describe('REP_ASSIGNED_TASK_COMPLETION_PARITY', () => {
  it('a completed assignment leaves the open selection and lands in Completed', () => {
    const done = unifiedAssigned({
      id: 'done-task',
      title: 'Complete daily stats',
      status: 'DONE',
      completed_at: new Date().toISOString(),
    })
    expect(selectAssignedOpenTasks([done])).toHaveLength(0)
    expect(classifyUnifiedTaskTab(done)).toBe('completed')
  })
})

describe('REP_OVERDUE_TASK_FOLLOWUP_BREAKDOWN', () => {
  it('follow-up and assigned overdue counts are reported separately', () => {
    expect(formatOverdueBreakdown(96, 2)).toBe('96 follow-ups · 2 tasks')
    expect(formatOverdueBreakdown(98, 0)).toBe('98 follow-ups · 0 tasks')
    expect(formatOverdueBreakdown(0, 0)).toBe('Nothing overdue')
  })

  it('only assigned tasks count toward the assigned overdue number', () => {
    const overdueAssigned = unifiedAssigned({
      id: 'late-assigned',
      title: 'Late update',
      due_at: new Date(Date.now() - 3_600_000).toISOString(),
    })
    const overdueFollowUp = toUnifiedTaskFromAction(
      derivedAction({ id: 'lead-late', kind: 'followup_due', createdAt: new Date(Date.now() - 3_600_000).toISOString() }),
      { organizationId: ORG, assigneeRepId: MADIHA },
    )
    expect(selectAssignedOverdueTasks([overdueAssigned, overdueFollowUp])).toHaveLength(1)
    expect(selectAssignedOverdueTasks([overdueAssigned, overdueFollowUp])[0].id).toBe('assigned:late-assigned')
  })
})

describe('REP_TASKS_WORKSPACE_PARITY', () => {
  it('the canonical assigned selection matches the tasks workspace assigned filter', () => {
    const tasks = [
      unifiedAssigned({ id: 'a1', title: 'Update needed' }),
      unifiedAssigned({ id: 'a2', title: 'Review enterprise lead', priority: 'HIGH' }),
      unifiedAssigned({ id: 'a3', title: 'Done task', status: 'DONE', completed_at: new Date().toISOString() }),
    ]
    const canonical = selectAssignedOpenTasks(tasks)
    const workspace = filterUnifiedTasks(tasks, { source: 'ASSIGNED', tab: 'all' }).filter(
      (t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS',
    )
    expect(canonical.map((t) => t.id).sort()).toEqual(workspace.map((t) => t.id).sort())
  })
})
