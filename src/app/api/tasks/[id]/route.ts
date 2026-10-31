import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import {
  cancelAssignedTask,
  completeAssignedTask,
  reassignAssignedTask,
} from '@/lib/tasks/assigned-tasks'
import { toUnifiedTaskFromAssigned } from '@/lib/tasks/map-unified-task'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { action, assigneeRepId, reason } = body as {
    action?: 'complete' | 'cancel' | 'reassign' | 'start'
    assigneeRepId?: string
    reason?: string
  }

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  const store = await createScoutStore()
  const client = store.getSupabaseClient()

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
      const row = await reassignAssignedTask(client, auth, id, assigneeRepId)
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
    const status = /not allowed|outside|only managers|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
