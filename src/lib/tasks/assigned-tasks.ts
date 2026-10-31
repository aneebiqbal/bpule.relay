import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthContext } from '@/lib/auth/organization'
import type { AssignedTaskKind, AssignedTaskRow, UnifiedTaskPriority, UnifiedTaskStatus } from '@/lib/tasks/types'

export type TaskEventType =
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_CANCELLED'

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')
}

export async function emitTaskEvent(
  client: SupabaseClient,
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
  client: SupabaseClient,
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
  const { data: existing } = await client
    .from('notifications')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('recipient_id', input.recipientId)
    .eq('dedupe_key', input.dedupeKey)
    .maybeSingle()
  if (existing) return

  await client.from('notifications').insert({
    organization_id: input.organizationId,
    recipient_id: input.recipientId,
    notification_type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    dedupe_key: input.dedupeKey,
  })
}

/** Resolve which assignee IDs the actor may see / mutate. */
export async function resolveTaskAssigneeScope(
  client: SupabaseClient,
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
  client: SupabaseClient,
  auth: AuthContext,
  opts?: { includeCompleted?: boolean; assigneeRepId?: string },
): Promise<AssignedTaskRow[]> {
  let query = client
    .from('assigned_tasks')
    .select('*')
    .eq('organization_id', auth.orgId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!opts?.includeCompleted) {
    query = query.in('status', ['OPEN', 'IN_PROGRESS'])
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
  client: SupabaseClient,
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

  await notifyTaskAssignee(client, {
    organizationId: auth.orgId,
    recipientId: row.assignee_rep_id,
    type: 'task_assigned',
    title: 'New task assigned',
    body: row.title,
    link: '/tasks',
    dedupeKey: `task_assigned:${row.id}`,
  })

  return row
}

export async function reassignAssignedTask(
  client: SupabaseClient,
  auth: AuthContext,
  taskId: string,
  newAssigneeRepId: string,
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
  const { data, error } = await client
    .from('assigned_tasks')
    .update({
      previous_assignee_rep_id: previous,
      assignee_rep_id: newAssigneeRepId,
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
    metadata: { previous_assignee_rep_id: previous, new_assignee_rep_id: newAssigneeRepId },
  })

  await notifyTaskAssignee(client, {
    organizationId: auth.orgId,
    recipientId: newAssigneeRepId,
    type: 'task_reassigned',
    title: 'Task reassigned to you',
    body: row.title,
    link: '/tasks',
    dedupeKey: `task_reassigned:${row.id}:${newAssigneeRepId}`,
  })

  return row
}

export async function completeAssignedTask(
  client: SupabaseClient,
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

  return row
}

export async function cancelAssignedTask(
  client: SupabaseClient,
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
    link: '/tasks',
    dedupeKey: `task_cancelled:${row.id}`,
  })

  return row
}

/** Overdue assigned-task counts keyed by assignee — one batched query. */
export async function countOverdueAssignedByRep(
  client: SupabaseClient,
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
  client: SupabaseClient,
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
    .in('status', ['OPEN', 'IN_PROGRESS'])
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
