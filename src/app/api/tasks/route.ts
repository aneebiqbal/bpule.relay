import { NextResponse } from 'next/server'
import { getDatabaseCapabilities, notAvailableBody } from '@/lib/operations/capabilities'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import {
  createAssignedTask,
  listAssignedTaskRows,
} from '@/lib/tasks/assigned-tasks'
import { toUnifiedTaskFromAssigned } from '@/lib/tasks/map-unified-task'
import type { AssignedTaskKind, UnifiedTaskPriority } from '@/lib/tasks/types'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const includeCompleted = url.searchParams.get('includeCompleted') === '1'
  const assigneeRepId = url.searchParams.get('assignee') ?? undefined
  const leadId = url.searchParams.get('leadId') ?? undefined

  const store = await createScoutStore()
  const client = store.getSupabaseClient()

  try {
    const rows = await listAssignedTaskRows(client, auth, {
      includeCompleted,
      assigneeRepId,
      leadId,
    })
    const tasks = rows.map((r) => toUnifiedTaskFromAssigned(r))
    return NextResponse.json({ tasks })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load tasks' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const capabilityStore = await createScoutStore().catch(() => null)
  const capabilities = await getDatabaseCapabilities(capabilityStore?.getSupabaseClient() ?? null)
  if (!capabilities.assignedTasks) return NextResponse.json(notAvailableBody('assignedTasks'), { status: 503 })

  const body = await request.json().catch(() => ({}))
  const {
    assigneeRepId,
    kind,
    title,
    description,
    priority,
    dueAt,
    leadId,
    profileId,
  } = body as {
    assigneeRepId?: string
    kind?: AssignedTaskKind
    title?: string
    description?: string
    priority?: UnifiedTaskPriority
    dueAt?: string
    leadId?: string
    profileId?: string
  }

  if (!assigneeRepId || !kind || !title?.trim()) {
    return NextResponse.json(
      { error: 'assigneeRepId, kind, and title are required' },
      { status: 400 },
    )
  }

  const store = await createScoutStore()
  const client = store.getSupabaseClient()

  try {
    const row = await createAssignedTask(client, auth, {
      assigneeRepId,
      kind,
      title: title.trim(),
      description: description ?? null,
      priority,
      dueAt: dueAt ?? null,
      leadId: leadId ?? null,
      profileId: profileId ?? null,
    })
    return NextResponse.json({ task: toUnifiedTaskFromAssigned(row) }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create task'
    const status = /only managers|outside your team|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
