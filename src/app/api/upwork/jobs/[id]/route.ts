import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { canTransition, type UpworkJobStatus } from '@/lib/upwork/lifecycle'
import { cancelAssignedTask } from '@/lib/tasks/assigned-tasks'
import { notifyForEvent } from '@/lib/notifications/deliver'
import { emitAction } from '@/lib/action-ledger'
import type { UpworkApplication } from '@/lib/domain/types'

const VALID_STATUSES: UpworkJobStatus[] = [
  'SAVED', 'DRAFT_READY', 'APPLIED', 'CLIENT_REPLIED', 'INTERVIEW', 'WON', 'LOST', 'ARCHIVED',
]

/** Statuses the PATCH route may set. APPLIED is only set by the apply route. */
const PATCHABLE_STATUSES: UpworkJobStatus[] = [
  'DRAFT_READY', 'CLIENT_REPLIED', 'INTERVIEW', 'WON', 'LOST', 'ARCHIVED', 'SAVED',
]

async function cancelPendingFollowUpTasks(
  store: Awaited<ReturnType<typeof createScoutStore>>,
  authCtx: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>,
  jobId: string,
  reason: string,
): Promise<void> {
  const client = store.getSupabaseClient()
  const { data: tasks } = await client
    .from('assigned_tasks')
    .select('id')
    .eq('job_id', jobId)
    .eq('kind', 'FOLLOW_UP')
    .in('status', ['OPEN', 'IN_PROGRESS'])
  for (const task of tasks ?? []) {
    try {
      await cancelAssignedTask(client, authCtx, task.id as string, reason)
    } catch {
      // A task that cannot be cancelled must not block the lifecycle change.
    }
  }
}

/**
 * PATCH /api/upwork/jobs/[id]
 * Body: { status?, notes?, proposedRate? }
 *
 * One canonical transition per call. Client replies, interviews and outcomes
 * persist their timestamps on the application and emit exactly one event.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { status?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (body.status && !VALID_STATUSES.includes(body.status as UpworkJobStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 },
    )
  }
  if (body.status === 'APPLIED') {
    return NextResponse.json(
      { error: 'Use the apply confirmation to submit an application.' },
      { status: 400 },
    )
  }
  if (body.status && !PATCHABLE_STATUSES.includes(body.status as UpworkJobStatus)) {
    return NextResponse.json({ error: 'That status cannot be set here.' }, { status: 400 })
  }

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

  const next = body.status as UpworkJobStatus | undefined
  if (next && !canTransition(job.status, next)) {
    return NextResponse.json(
      { error: `Cannot move from ${job.status} to ${next}.` },
      { status: 400 },
    )
  }

  const application: UpworkApplication | null = await store.getUpworkApplication(id)
  const now = new Date().toISOString()

  // Lifecycle timestamps live on the application, never on message rows.
  if (next === 'CLIENT_REPLIED' && application) {
    await store.updateUpworkApplication(application.id, {
      firstReplyAt: application.firstReplyAt ?? now,
      latestReplyAt: now,
    })
  }
  if (next === 'INTERVIEW' && application) {
    await store.updateUpworkApplication(application.id, { interviewAt: application.interviewAt ?? now })
  }
  if (next === 'WON' && application) {
    await store.updateUpworkApplication(application.id, { wonAt: application.wonAt ?? now })
  }
  if (next === 'LOST' && application) {
    await store.updateUpworkApplication(application.id, { lostAt: application.lostAt ?? now })
  }
  if (next === 'ARCHIVED' && application) {
    await store.updateUpworkApplication(application.id, { status: 'archived', archivedAt: now })
  }

  await store.updateUpworkJob(id, { status: next })

  if (next) {
    const eventFor: Partial<Record<UpworkJobStatus,
      | 'UPWORK_CLIENT_REPLIED'
      | 'UPWORK_INTERVIEW'
      | 'UPWORK_WON'
      | 'UPWORK_LOST'
      | 'UPWORK_ARCHIVED'
      | 'UPWORK_PROPOSAL_PREPARED'
      | 'UPWORK_JOB_SAVED'>> = {
      CLIENT_REPLIED: 'UPWORK_CLIENT_REPLIED',
      INTERVIEW: 'UPWORK_INTERVIEW',
      WON: 'UPWORK_WON',
      LOST: 'UPWORK_LOST',
      ARCHIVED: 'UPWORK_ARCHIVED',
      DRAFT_READY: 'UPWORK_PROPOSAL_PREPARED',
      SAVED: 'UPWORK_JOB_SAVED',
    }
    const actionType = eventFor[next]
    if (actionType) {
      try {
        await emitAction({
          orgId: authCtx.orgId,
          actionType,
          actorType: 'rep',
          actorId: authCtx.repId,
          jobId: id,
          senderProfileId: application?.personProfileId ?? null,
          channel: 'upwork',
          idempotencyKey: `upwork_${next.toLowerCase()}:${id}`,
        })
      } catch { /* ledger must never break domain operations */ }
    }

    // The client replied or the job closed: no follow-up is owed.
    if (next === 'CLIENT_REPLIED' || next === 'WON' || next === 'LOST') {
      await cancelPendingFollowUpTasks(store, authCtx, id, `Job moved to ${next}`)
    }

    try {
      if (next === 'CLIENT_REPLIED') {
        await notifyForEvent(store.getSupabaseClient(), authCtx.orgId, {
          kind: 'UPWORK_CLIENT_REPLIED',
          jobId: id,
          ownerRepId: job.ownerRepId,
          actorRepId: authCtx.repId,
          title: job.title,
        })
      } else if (next === 'INTERVIEW') {
        await notifyForEvent(store.getSupabaseClient(), authCtx.orgId, {
          kind: 'UPWORK_INTERVIEW',
          jobId: id,
          ownerRepId: job.ownerRepId,
          actorRepId: authCtx.repId,
          title: job.title,
        })
      }
    } catch { /* notifications must never block the lifecycle */ }
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/upwork/jobs/[id]
 * Safe delete only: untouched saved/draft jobs with no application, reply or
 * follow-up history. Applied jobs archive; they never delete.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
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

  try {
    await store.deleteUpworkJob(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not delete this job.' },
      { status: 400 },
    )
  }
}
