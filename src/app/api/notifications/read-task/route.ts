import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { markTaskCommentsRead } from '@/lib/tasks/assigned-tasks'

export const dynamic = 'force-dynamic'

/**
 * Opening a task conversation marks its unread internal comments read.
 * Uses the canonical notification read flag — the task list reads the same
 * state, so the bell and the task row can never disagree.
 */
export async function POST(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const taskId = typeof body?.taskId === 'string' ? body.taskId : ''
  if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 })

  const store = await createScoutStore()
  await markTaskCommentsRead(store.getSupabaseClient(), auth, taskId)
  return NextResponse.json({ ok: true })
}
