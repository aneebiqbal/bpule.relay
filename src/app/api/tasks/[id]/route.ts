import { NextResponse } from 'next/server'
import { getDatabaseCapabilities, notAvailableBody } from '@/lib/operations/capabilities'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import {
  approveAssignedTaskTransfer,
  cancelAssignedTask,
  cancelAssignedTaskTransfer,
  completeAssignedTask,
  loadAssignedTaskDetail,
  reassignAssignedTask,
  declineAssignedTaskTransfer,
  reopenAssignedTask,
  requestAssignedTaskTransfer,
  rescheduleAssignedTask,
  resumeAssignedTask,
  setAssignedTaskWaiting,
  type TaskWaitingOn,
} from '@/lib/tasks/assigned-tasks'
import { toUnifiedTaskFromAssigned } from '@/lib/tasks/map-unified-task'

export const dynamic = 'force-dynamic'

/** Task detail drawer: the task + its lifecycle, scoped. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const store = await createScoutStore()
  const client = store.getSupabaseClient()
  try {
    const detail = await loadAssignedTaskDetail(client, auth, id)
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ task: toUnifiedTaskFromAssigned(detail.row), events: detail.events })
  } catch (err) {
    console.error('task detail failed:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { action, assigneeRepId, reason, dueAt, waitingOn, note } = body as {
    action?: 'complete' | 'cancel' | 'reassign' | 'start' | 'reschedule'
      | 'waiting' | 'resume' | 'reopen'
      | 'requestTransfer' | 'approveTransfer' | 'declineTransfer' | 'cancelTransfer'
    assigneeRepId?: string
    reason?: string
    dueAt?: string | null
    waitingOn?: TaskWaitingOn | null
    note?: string
  }

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  const store = await createScoutStore()
  const client = store.getSupabaseClient()
  if (!(await getDatabaseCapabilities(client)).assignedTasks) {
    return NextResponse.json(notAvailableBody('assignedTasks'), { status: 503 })
  }

  try {
    if (action === 'complete') {
      const row = await completeAssignedTask(client, auth, id)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'cancel') {
      const row = await cancelAssignedTask(client, auth, id, reason)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'reassign') {
      if (!assigneeRepId) {
        return NextResponse.json({ error: 'assigneeRepId required' }, { status: 400 })
      }
      const row = await reassignAssignedTask(client, auth, id, assigneeRepId, reason ?? null)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'waiting') {
      const row = await setAssignedTaskWaiting(client, auth, id, waitingOn ?? null, note ?? null)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'resume') {
      const row = await resumeAssignedTask(client, auth, id)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'reopen') {
      const row = await reopenAssignedTask(client, auth, id)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'requestTransfer') {
      if (!assigneeRepId) {
        return NextResponse.json({ error: 'assigneeRepId required' }, { status: 400 })
      }
      const row = await requestAssignedTaskTransfer(client, auth, id, assigneeRepId, reason ?? null)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'approveTransfer') {
      const row = await approveAssignedTaskTransfer(client, auth, id)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'declineTransfer') {
      const row = await declineAssignedTaskTransfer(client, auth, id)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'cancelTransfer') {
      const row = await cancelAssignedTaskTransfer(client, auth, id)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'reschedule') {
      const row = await rescheduleAssignedTask(client, auth, id, dueAt ?? null)
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) })
    }
    if (action === 'start') {
      const { data, error } = await client
        .from('assigned_tasks')
        .update({ status: 'IN_PROGRESS', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', auth.orgId)
        .eq('assignee_rep_id', auth.repId)
        .select('*')
        .single()
      if (error || !data) {
        return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
      }
      return NextResponse.json({ task: toUnifiedTaskFromAssigned(data) })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed'
    const status = /invalid due date|closed tasks/i.test(message)
      ? 400
      : /not allowed|outside|only managers|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
