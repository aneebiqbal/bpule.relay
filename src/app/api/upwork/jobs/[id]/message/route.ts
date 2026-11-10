import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { cancelAssignedTask } from '@/lib/tasks/assigned-tasks'
import { notifyForEvent } from '@/lib/notifications/deliver'
import { emitAction } from '@/lib/action-ledger'

/**
 * POST /api/upwork/jobs/[id]/message
 * Body: { text, direction?: 'inbound' | 'outbound' }
 *
 * Inbound client messages are stored as inbound communication — never as a
 * proposal draft — and move an applied job to CLIENT_REPLIED with real
 * first/last reply timestamps. Outbound messages are history only.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { text?: string; direction?: 'inbound' | 'outbound'; type?: 'followup' | 'reply' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'text is required.' }, { status: 400 })

  const store = await createScoutStore()
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const job = await store.getUpworkJob(id)
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  if (job.organizationId !== authCtx.orgId) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }
  const isAdmin = Boolean(authCtx.isAdmin || authCtx.isOwner)
  if (job.ownerRepId !== authCtx.repId && !isAdmin) {
    return NextResponse.json({ error: 'You do not own this job.' }, { status: 403 })
  }

  const direction = body.direction === 'inbound' ? 'inbound' : 'outbound'
  const type: 'followup' | 'reply' =
    body.type === 'followup' || body.type === 'reply'
      ? body.type
      : direction === 'inbound' ? 'reply' : 'followup'

  // A client cannot reply before an application exists.
  if (direction === 'inbound' && (job.status === 'SAVED' || job.status === 'DRAFT_READY')) {
    return NextResponse.json({ error: 'An application must be submitted before a client can reply.' }, { status: 400 })
  }
  const message = await store.logUpworkMessage({
    jobId: id,
    repId: authCtx.repId,
    type,
    direction,
    body: text,
    senderProfileId: null,
  })

  if (direction === 'inbound' && job.status === 'APPLIED') {
    const now = new Date().toISOString()
    const application = await store.getUpworkApplication(id)
    if (application) {
      await store.updateUpworkApplication(application.id, {
        firstReplyAt: application.firstReplyAt ?? now,
        latestReplyAt: now,
      })
    }
    await store.updateUpworkJob(id, { status: 'CLIENT_REPLIED' })

    try {
      await emitAction({
        orgId: authCtx.orgId,
        actionType: 'UPWORK_CLIENT_REPLIED',
        actorType: 'rep',
        actorId: authCtx.repId,
        jobId: id,
        senderProfileId: application?.personProfileId ?? null,
        channel: 'upwork',
        idempotencyKey: `upwork_client_replied:${id}:${message.id}`,
      })
    } catch { /* ledger must never break domain operations */ }

    const client = store.getSupabaseClient()
    const { data: tasks } = await client
      .from('assigned_tasks')
      .select('id')
      .eq('job_id', id)
      .eq('kind', 'FOLLOW_UP')
      .in('status', ['OPEN', 'IN_PROGRESS'])
    for (const task of tasks ?? []) {
      try {
        await cancelAssignedTask(client, authCtx, task.id as string, 'Client replied')
      } catch { /* a stuck task must not block the reply */ }
    }

    try {
      await notifyForEvent(client, authCtx.orgId, {
        kind: 'UPWORK_CLIENT_REPLIED',
        jobId: id,
        messageId: message.id,
        ownerRepId: job.ownerRepId,
        actorRepId: authCtx.repId,
        title: job.title,
      })
    } catch { /* notifications must never block the reply */ }
  }

  return NextResponse.json({ ok: true, message })
}
