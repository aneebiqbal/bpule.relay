import type { AuthContext } from '@/lib/auth/organization'
import type { AssignedTaskKind, AssignedTaskRow, UnifiedTaskPriority, UnifiedTaskStatus } from '@/lib/tasks/types'
import { notifyForEvent, notifyOnce } from '@/lib/notifications/deliver'
import type { DbClient } from '@/lib/db/types'

export type TaskEventType =
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_CANCELLED'
  | 'TASK_RESCHEDULED'
  | 'TASK_WAITING'
  | 'TASK_REOPENED'
  | 'TASK_TRANSFER_REQUESTED'
  | 'TASK_TRANSFER_APPROVED'
  | 'TASK_TRANSFER_CANCELLED'

/** What a WAITING task is blocked on. */
export type TaskWaitingOn = 'ADMIN' | 'REP' | 'CLIENT' | 'EXTERNAL'

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')
}

export async function emitTaskEvent(
  client: DbClient,
  input: {
    organizationId: string
    taskId: string
    eventType: TaskEventType
    actorRepId: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await client.from('task_events').insert({
    organization_id: input.organizationId,
    task_id: input.taskId,
    event_type: input.eventType,
    actor_rep_id: input.actorRepId,
    metadata: input.metadata ?? {},
  })
  if (error && !isMissingRelation(error)) {
    console.error('[task_events] insert failed', error.message)
  }
}

export async function notifyTaskAssignee(
  client: DbClient,
  input: {
    organizationId: string
    recipientId: string
    type: string
    title: string
    body: string
    link: string
    dedupeKey: string
  },
): Promise<void> {
  // One writer for every notification (src/lib/notifications/deliver.ts).
  await notifyOnce(client, input)
}

/** Resolve which assignee IDs the actor may see / mutate. */
export async function resolveTaskAssigneeScope(
  client: DbClient,
  auth: AuthContext,
): Promise<{ mode: 'own' | 'team' | 'org'; assigneeIds: string[] | null }> {
  if (auth.isOwner || auth.isAdmin) {
    return { mode: 'org', assigneeIds: null }
  }
  if (auth.isManager && auth.managedTeamIds.length > 0) {
    const { data } = await client
      .from('team_memberships')
      .select('person_id')
      .in('team_id', auth.managedTeamIds)
      .eq('active', true)
    const ids = new Set<string>((data ?? []).map((r: { person_id: string }) => r.person_id))
    ids.add(auth.repId)
    return { mode: 'team', assigneeIds: [...ids] }
  }
  return { mode: 'own', assigneeIds: [auth.repId] }
}

export async function listAssignedTaskRows(
  client: DbClient,
  auth: AuthContext,
  opts?: { includeCompleted?: boolean; assigneeRepId?: string; leadId?: string },
): Promise<AssignedTaskRow[]> {
  let query = client
    .from('assigned_tasks')
    .select('*')
    .eq('organization_id', auth.orgId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!opts?.includeCompleted) {
    // WAITING is open work — the rep is blocked, not done.
    query = query.in('status', ['OPEN', 'IN_PROGRESS', 'WAITING'])
  }

  if (opts?.leadId) {
    query = query.eq('lead_id', opts.leadId)
  }

  const scope = await resolveTaskAssigneeScope(client, auth)
  if (opts?.assigneeRepId) {
    if (scope.assigneeIds && !scope.assigneeIds.includes(opts.assigneeRepId)) {
      return []
    }
    query = query.eq('assignee_rep_id', opts.assigneeRepId)
  } else if (scope.assigneeIds) {
    query = query.in('assignee_rep_id', scope.assigneeIds)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
  return (data ?? []) as AssignedTaskRow[]
}

export interface CreateAssignedTaskInput {
  assigneeRepId: string
  kind: AssignedTaskKind
  title: string
  description?: string | null
  priority?: UnifiedTaskPriority
  dueAt?: string | null
  leadId?: string | null
  profileId?: string | null
}

export async function createAssignedTask(
  client: DbClient,
  auth: AuthContext,
  input: CreateAssignedTaskInput,
): Promise<AssignedTaskRow> {
  if (!auth.isManager && !auth.isAdmin && !auth.isOwner) {
    throw new Error('Only managers and admins can assign tasks')
  }

  const scope = await resolveTaskAssigneeScope(client, auth)
  if (scope.assigneeIds && !scope.assigneeIds.includes(input.assigneeRepId)) {
    throw new Error('Assignee outside your team scope')
  }

  // Confirm assignee is same org
  const { data: assignee } = await client
    .from('reps')
    .select('id, organization_id')
    .eq('id', input.assigneeRepId)
    .maybeSingle()
  if (!assignee || assignee.organization_id !== auth.orgId) {
    throw new Error('Assignee not found in organization')
  }

  const dueAt =
    input.dueAt
    ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await client
    .from('assigned_tasks')
    .insert({
      organization_id: auth.orgId,
      assignee_rep_id: input.assigneeRepId,
      created_by_rep_id: auth.repId,
      lead_id: input.leadId ?? null,
      profile_id: input.profileId ?? null,
      kind: input.kind,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'NORMAL',
      due_at: dueAt,
      status: 'OPEN',
    })
    .select('*')
    .single()

  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_CREATED',
    actorRepId: auth.repId,
    metadata: { kind: row.kind, assignee_rep_id: row.assignee_rep_id },
  })
  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_ASSIGNED',
    actorRepId: auth.repId,
    metadata: { assignee_rep_id: row.assignee_rep_id },
  })

  await notifyForEvent(
    client,
    auth.orgId,
    row.kind === 'REQUEST_UPDATE'
      ? { kind: 'UPDATE_REQUESTED', taskId: row.id, assigneeRepId: row.assignee_rep_id, actorRepId: auth.repId, actorName: null, title: row.title }
      : { kind: 'TASK_ASSIGNED', taskId: row.id, assigneeRepId: row.assignee_rep_id, actorRepId: auth.repId, actorName: null, title: row.title },
  )

  return row
}

export async function reassignAssignedTask(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
  newAssigneeRepId: string,
  reason?: string | null,
): Promise<AssignedTaskRow> {
  if (!auth.isManager && !auth.isAdmin && !auth.isOwner) {
    throw new Error('Only managers and admins can reassign tasks')
  }

  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')

  const scope = await resolveTaskAssigneeScope(client, auth)
  if (scope.assigneeIds) {
    if (!scope.assigneeIds.includes(current.assignee_rep_id) || !scope.assigneeIds.includes(newAssigneeRepId)) {
      throw new Error('Reassignment outside your team scope')
    }
  }

  const { data: assignee } = await client
    .from('reps')
    .select('id, organization_id')
    .eq('id', newAssigneeRepId)
    .maybeSingle()
  if (!assignee || assignee.organization_id !== auth.orgId) {
    throw new Error('New assignee not found in organization')
  }

  const previous = current.assignee_rep_id as string
  const hadPendingRequest = Boolean(current.transfer_requested_to)
  const { data, error } = await client
    .from('assigned_tasks')
    .update({
      previous_assignee_rep_id: previous,
      assignee_rep_id: newAssigneeRepId,
      transfer_requested_by: null,
      transfer_requested_to: null,
      transfer_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .select('*')
    .single()
  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_REASSIGNED',
    actorRepId: auth.repId,
    metadata: {
      previous_assignee_rep_id: previous,
      new_assignee_rep_id: newAssigneeRepId,
      reason: reason ?? null,
    },
  })
  if (hadPendingRequest) {
    await emitTaskEvent(client, {
      organizationId: auth.orgId,
      taskId: row.id,
      eventType: 'TASK_TRANSFER_APPROVED',
      actorRepId: auth.repId,
      metadata: { approved_request: true },
    })
  }

  await notifyForEvent(client, auth.orgId, {
    kind: 'TASK_REASSIGNED',
    taskId: row.id,
    assigneeRepId: newAssigneeRepId,
    actorRepId: auth.repId,
    actorName: null,
    title: row.title,
  })
  // Both reps hear about a transfer — the one losing work as well as the one
  // gaining it. The previous assignee is not the actor in a manager reassign.
  if (previous !== auth.repId && previous !== newAssigneeRepId) {
    await notifyTaskAssignee(client, {
      organizationId: auth.orgId,
      recipientId: previous,
      type: 'task_transferred_away',
      title: 'Task transferred away',
      body: row.title,
      link: `/tasks?task=assigned:${row.id}`,
      dedupeKey: `task_transferred_away:${row.id}:${previous}`,
    })
  }

  return row
}

/** The actor may act on a task when they hold it, created it, or manage its scope. */
async function canOperateOnTask(
  client: DbClient,
  auth: AuthContext,
  task: AssignedTaskRow,
): Promise<boolean> {
  if (auth.isAdmin || auth.isOwner) return true
  if (task.assignee_rep_id === auth.repId || task.created_by_rep_id === auth.repId) return true
  if (auth.isManager) {
    const scope = await resolveTaskAssigneeScope(client, auth)
    return !scope.assigneeIds || scope.assigneeIds.includes(task.assignee_rep_id)
  }
  return false
}

/** Mark a task blocked. The assignee (or creator/manager) records what it waits on. */
export async function setAssignedTaskWaiting(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
  waitingOn: TaskWaitingOn | null,
): Promise<AssignedTaskRow> {
  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')
  if (current.status === 'DONE' || current.status === 'CANCELLED') {
    throw new Error('Closed tasks cannot be changed')
  }
  if (!(await canOperateOnTask(client, auth, current as AssignedTaskRow))) {
    throw new Error('Not allowed to update this task')
  }

  const { data, error } = await client
    .from('assigned_tasks')
    .update({
      status: waitingOn ? 'WAITING' : 'OPEN',
      waiting_on: waitingOn,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .select('*')
    .single()
  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_WAITING',
    actorRepId: auth.repId,
    metadata: { waiting_on: waitingOn ?? null, status: row.status },
  })

  return row
}

/** Reopen a completed task. Admin/owner, the creator, or a scoped manager. */
export async function reopenAssignedTask(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
): Promise<AssignedTaskRow> {
  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')
  if (current.status !== 'DONE' && current.status !== 'CANCELLED') {
    throw new Error('Only closed tasks can be reopened')
  }
  if (!(await canOperateOnTask(client, auth, current as AssignedTaskRow))) {
    throw new Error('Not allowed to reopen this task')
  }

  const { data, error } = await client
    .from('assigned_tasks')
    .update({
      status: 'OPEN',
      completed_at: null,
      cancelled_at: null,
      cancel_reason: null,
      waiting_on: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .select('*')
    .single()
  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_REOPENED',
    actorRepId: auth.repId,
  })

  return row
}

/**
 * A rep asks for a handoff. This never moves the task: it records the request,
 * writes an event, and notifies the creator and every org manager/admin. Only
 * `approveAssignedTaskTransfer` reassigns.
 */
export async function requestAssignedTaskTransfer(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
  toRepId: string,
  reason?: string | null,
): Promise<AssignedTaskRow> {
  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')
  const task = current as AssignedTaskRow
  if (task.status === 'DONE' || task.status === 'CANCELLED') {
    throw new Error('Closed tasks cannot be transferred')
  }
  // Only the rep holding the work may request the handoff.
  if (task.assignee_rep_id !== auth.repId) {
    throw new Error('Only the assignee can request a transfer')
  }
  if (toRepId === auth.repId) throw new Error('Choose a different rep')

  const { data: target } = await client
    .from('reps')
    .select('id, organization_id')
    .eq('id', toRepId)
    .maybeSingle()
  if (!target || target.organization_id !== auth.orgId) {
    throw new Error('Target rep not found in organization')
  }

  const { data, error } = await client
    .from('assigned_tasks')
    .update({
      transfer_requested_by: auth.repId,
      transfer_requested_to: toRepId,
      transfer_reason: reason?.trim() ? reason.trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .select('*')
    .single()
  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_TRANSFER_REQUESTED',
    actorRepId: auth.repId,
    metadata: { requested_to: toRepId, reason: reason?.trim() ? reason.trim() : null },
  })

  await notifyTaskTransferRequested(client, auth.orgId, {
    taskId: row.id,
    title: row.title,
    fromRepId: auth.repId,
    toRepId,
    reason: reason?.trim() ? reason.trim() : null,
    creatorRepId: row.created_by_rep_id,
  })

  return row
}

/** Manager/admin approval of a pending request. The request is the authority. */
export async function approveAssignedTaskTransfer(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
): Promise<AssignedTaskRow> {
  if (!auth.isManager && !auth.isAdmin && !auth.isOwner) {
    throw new Error('Only managers and admins can approve a transfer')
  }
  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')
  const task = current as AssignedTaskRow
  if (!task.transfer_requested_to) throw new Error('No transfer request is pending')

  const scope = await resolveTaskAssigneeScope(client, auth)
  if (scope.assigneeIds) {
    if (
      !scope.assigneeIds.includes(task.assignee_rep_id)
      || !scope.assigneeIds.includes(task.transfer_requested_to)
    ) {
      throw new Error('Transfer outside your team scope')
    }
  }

  return reassignAssignedTask(client, auth, taskId, task.transfer_requested_to, task.transfer_reason)
}

/** The requester (or a manager/admin) withdraws a pending request. */
export async function cancelAssignedTaskTransfer(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
): Promise<AssignedTaskRow> {
  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')
  const task = current as AssignedTaskRow
  if (!task.transfer_requested_to) throw new Error('No transfer request is pending')
  let allowed = auth.isAdmin || auth.isOwner || task.transfer_requested_by === auth.repId
  if (!allowed && auth.isManager) {
    const scope = await resolveTaskAssigneeScope(client, auth)
    allowed = !scope.assigneeIds || scope.assigneeIds.includes(task.assignee_rep_id)
  }
  if (!allowed) throw new Error('Not allowed to cancel this transfer')

  const { data, error } = await client
    .from('assigned_tasks')
    .update({
      transfer_requested_by: null,
      transfer_requested_to: null,
      transfer_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .select('*')
    .single()
  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_TRANSFER_CANCELLED',
    actorRepId: auth.repId,
  })

  return row
}

async function notifyTaskTransferRequested(
  client: DbClient,
  organizationId: string,
  input: {
    taskId: string
    title: string
    fromRepId: string
    toRepId: string
    reason: string | null
    creatorRepId: string
  },
): Promise<void> {
  const { data: admins } = await client
    .from('organization_roles')
    .select('person_id')
    .eq('organization_id', organizationId)
    .in('role', ['OWNER', 'ADMIN', 'MANAGER'])
  const recipients = new Set<string>((admins ?? []).map((row) => row.person_id as string))
  if (input.creatorRepId) recipients.add(input.creatorRepId)
  recipients.delete(input.fromRepId)

  for (const recipientId of recipients) {
    await notifyTaskAssignee(client, {
      organizationId,
      recipientId,
      type: 'task_transfer_requested',
      title: 'Transfer requested',
      body: input.reason ? `${input.title} · ${input.reason}` : input.title,
      link: `/tasks?task=assigned:${input.taskId}`,
      dedupeKey: `task_transfer_requested:${input.taskId}:${recipientId}`,
    })
  }
  // The proposed recipient hears about it too, so the handoff is not a surprise.
  if (input.toRepId !== input.fromRepId) {
    await notifyTaskAssignee(client, {
      organizationId,
      recipientId: input.toRepId,
      type: 'task_transfer_proposed',
      title: 'Handoff proposed to you',
      body: input.title,
      link: `/tasks?task=assigned:${input.taskId}`,
      dedupeKey: `task_transfer_proposed:${input.taskId}:${input.toRepId}`,
    })
  }
}

/** Change a task's due date. Creator, admin/owner, or a manager whose scope covers the assignee. */
export async function rescheduleAssignedTask(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
  dueAt: string | null,
): Promise<AssignedTaskRow> {
  if (dueAt !== null && Number.isNaN(Date.parse(dueAt))) throw new Error('Invalid due date')

  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')
  if (current.status === 'DONE' || current.status === 'CANCELLED') {
    throw new Error('Closed tasks cannot be rescheduled')
  }

  let allowed = current.created_by_rep_id === auth.repId || auth.isAdmin || auth.isOwner
  if (!allowed && auth.isManager) {
    const scope = await resolveTaskAssigneeScope(client, auth)
    allowed = !scope.assigneeIds || scope.assigneeIds.includes(current.assignee_rep_id)
  }
  if (!allowed) throw new Error('Not allowed to reschedule this task')

  const { data, error } = await client
    .from('assigned_tasks')
    .update({ due_at: dueAt, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .select('*')
    .single()
  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_RESCHEDULED',
    actorRepId: auth.repId,
    metadata: { previous_due_at: current.due_at ?? null, new_due_at: dueAt },
  })

  return row
}

export interface AssignedTaskEventView {
  id: string
  eventType: TaskEventType
  actorName: string | null
  createdAt: string
}

/** One task + its lifecycle, scoped like listAssignedTaskRows. null when not visible. */
export async function loadAssignedTaskDetail(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
): Promise<{ row: AssignedTaskRow; events: AssignedTaskEventView[] } | null> {
  const { data: row, error } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  if (!row) return null
  const scope = await resolveTaskAssigneeScope(client, auth)
  const visible =
    !scope.assigneeIds
    || scope.assigneeIds.includes(row.assignee_rep_id)
    || row.created_by_rep_id === auth.repId
  if (!visible) return null

  const { data: events } = await client
    .from('task_events')
    .select('id, event_type, actor_rep_id, created_at')
    .eq('organization_id', auth.orgId)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(50)
  const list = (events ?? []) as Array<{ id: string; event_type: TaskEventType; actor_rep_id: string | null; created_at: string }>
  const actorIds = [...new Set(list.map((e) => e.actor_rep_id).filter(Boolean))] as string[]
  const { data: reps } = actorIds.length
    ? await client.from('reps').select('id, name').eq('organization_id', auth.orgId).in('id', actorIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const names = new Map(((reps ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name]))

  return {
    row: row as AssignedTaskRow,
    events: list.map((e) => ({
      id: e.id,
      eventType: e.event_type,
      actorName: e.actor_rep_id ? names.get(e.actor_rep_id) ?? null : null,
      createdAt: e.created_at,
    })),
  }
}

export async function completeAssignedTask(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
): Promise<AssignedTaskRow> {
  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')

  const canComplete =
    current.assignee_rep_id === auth.repId
    || current.created_by_rep_id === auth.repId
    || auth.isAdmin
    || auth.isOwner
  if (!canComplete) throw new Error('Not allowed to complete this task')

  const now = new Date().toISOString()
  const { data, error } = await client
    .from('assigned_tasks')
    .update({
      status: 'DONE' satisfies UnifiedTaskStatus,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .select('*')
    .single()
  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_COMPLETED',
    actorRepId: auth.repId,
  })

  // The creator (usually a manager) hears about completion; the assignee is
  // the actor in the common case and never notifies themselves.
  if (row.created_by_rep_id && row.created_by_rep_id !== auth.repId) {
    await notifyTaskAssignee(client, {
      organizationId: auth.orgId,
      recipientId: row.created_by_rep_id,
      type: 'task_completed',
      title: 'Task completed',
      body: row.title,
      link: `/tasks?task=assigned:${row.id}`,
      dedupeKey: `task_completed:${row.id}:${row.created_by_rep_id}`,
    })
  }

  return row
}

export async function cancelAssignedTask(
  client: DbClient,
  auth: AuthContext,
  taskId: string,
  reason?: string | null,
): Promise<AssignedTaskRow> {
  if (!auth.isManager && !auth.isAdmin && !auth.isOwner) {
    throw new Error('Only managers and admins can cancel tasks')
  }

  const { data: current, error: loadError } = await client
    .from('assigned_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .maybeSingle()
  if (loadError || !current) throw new Error('Task not found')

  const scope = await resolveTaskAssigneeScope(client, auth)
  if (scope.assigneeIds && !scope.assigneeIds.includes(current.assignee_rep_id)) {
    throw new Error('Cancel outside your team scope')
  }

  const now = new Date().toISOString()
  const { data, error } = await client
    .from('assigned_tasks')
    .update({
      status: 'CANCELLED' satisfies UnifiedTaskStatus,
      cancelled_at: now,
      cancel_reason: reason ?? null,
      updated_at: now,
    })
    .eq('id', taskId)
    .eq('organization_id', auth.orgId)
    .select('*')
    .single()
  if (error) throw error
  const row = data as AssignedTaskRow

  await emitTaskEvent(client, {
    organizationId: auth.orgId,
    taskId: row.id,
    eventType: 'TASK_CANCELLED',
    actorRepId: auth.repId,
    metadata: { reason: reason ?? null },
  })

  await notifyTaskAssignee(client, {
    organizationId: auth.orgId,
    recipientId: row.assignee_rep_id,
    type: 'task_cancelled',
    title: 'Task cancelled',
    body: row.title,
    link: `/tasks?task=assigned:${row.id}`,
    dedupeKey: `task_cancelled:${row.id}`,
  })

  return row
}

/** Overdue assigned-task counts keyed by assignee — one batched query. */
export async function countOverdueAssignedByRep(
  client: DbClient,
  orgId: string,
  assigneeIds: string[] | null,
  now = new Date(),
): Promise<Map<string, number>> {
  let query = client
    .from('assigned_tasks')
    .select('assignee_rep_id, due_at')
    .eq('organization_id', orgId)
    .in('status', ['OPEN', 'IN_PROGRESS'])
    .lt('due_at', now.toISOString())

  if (assigneeIds) {
    if (assigneeIds.length === 0) return new Map()
    query = query.in('assignee_rep_id', assigneeIds)
  }

  const { data, error } = await query
  if (error) {
    if (isMissingRelation(error)) return new Map()
    throw error
  }

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    const id = row.assignee_rep_id as string
    map.set(id, (map.get(id) ?? 0) + 1)
  }
  return map
}

export async function countUnassignedOpenTasks(
  client: DbClient,
  orgId: string,
): Promise<number> {
  // "Unassigned" in product terms: open tasks with no due date and no lead —
  // rare; more useful signal is open org tasks without an active assignee check.
  // Spec UNASSIGNED_TASKS: treat as open tasks whose assignee is missing/inactive.
  // For Sprint 1: count OPEN tasks with null due_at as needs-triage proxy is wrong.
  // Use: open tasks where assignee left org — skip; return 0 until we have soft-delete.
  // Instead count open tasks created but still OPEN with priority CRITICAL without activity.
  // Practical Sprint 1: open tasks with status OPEN and assignee not in active reps.
  const { data: tasks, error } = await client
    .from('assigned_tasks')
    .select('assignee_rep_id')
    .eq('organization_id', orgId)
    .in('status', ['OPEN', 'IN_PROGRESS', 'WAITING'])
  if (error) {
    if (isMissingRelation(error)) return 0
    throw error
  }
  if (!tasks?.length) return 0

  const assigneeIds = [...new Set(tasks.map((t) => t.assignee_rep_id as string))]
  const { data: reps } = await client
    .from('reps')
    .select('id')
    .eq('organization_id', orgId)
    .in('id', assigneeIds)
  const active = new Set((reps ?? []).map((r) => r.id as string))
  return tasks.filter((t) => !active.has(t.assignee_rep_id as string)).length
}
