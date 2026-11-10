import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { FOLLOWUP_POLICY } from '@/lib/upwork/lifecycle'
import { createAssignedTask, completeAssignedTask } from '@/lib/tasks/assigned-tasks'
import { emitAction } from '@/lib/action-ledger'

/**
 * POST /api/upwork/jobs/[id]/followup
 * Body: { text: string, repId? }
 *
 * Logs an Upwork follow-up in the canonical communication history, completes
 * the pending follow-up task and schedules the next step. If the client has
 * already replied, no further follow-up is created.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { text?: string; repId?: string }
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

  const requestedRepId = typeof body.repId === 'string' ? body.repId : null
  const isAdmin = Boolean(authCtx.isAdmin || authCtx.isOwner)
  const actingRepId = requestedRepId && isAdmin ? requestedRepId : authCtx.repId

  // Admin on-behalf: the acting rep must belong to the caller's organization.
  if (requestedRepId && isAdmin && requestedRepId !== authCtx.repId) {
    const { data: actingRep } = await store
      .getSupabaseClient()
      .from('reps').select('id').eq('id', requestedRepId).eq('organization_id', authCtx.orgId).maybeSingle()
    if (!actingRep) return NextResponse.json({ error: 'That rep is not in your organization.' }, { status: 404 })
  }

  const job = await store.getUpworkJob(id)
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  if (job.organizationId !== authCtx.orgId) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }
  if (job.ownerRepId !== actingRepId && !isAdmin) {
    return NextResponse.json({ error: 'You do not own this job.' }, { status: 403 })
  }
  if (job.status === 'CLIENT_REPLIED' || job.status === 'INTERVIEW' || job.status === 'WON' || job.status === 'LOST') {
    return NextResponse.json({ error: 'The client already replied — no further follow-up is needed.' }, { status: 400 })
  }
  if (job.status !== 'APPLIED') {
    return NextResponse.json({ error: 'Only an applied job can be followed up.' }, { status: 400 })
  }

  const application = await store.getUpworkApplication(id)
  if (!application) {
    return NextResponse.json({ error: 'No application exists for this job.' }, { status: 400 })
  }

  const followUps = (job.messages ?? []).filter((m) => m.type === 'followup' && m.direction !== 'inbound')
  const nextIndex = followUps.length + 1
  if (nextIndex > 2) {
    return NextResponse.json({ error: 'Two follow-ups have already been sent.' }, { status: 400 })
  }

  const message = await store.logUpworkMessage({
    jobId: id,
    repId: actingRepId,
    type: 'followup',
    direction: 'outbound',
    body: text,
    senderProfileId: application.personProfileId,
  })

  const client = store.getSupabaseClient()

  // Complete the pending follow-up task for this job.
  const { data: openTasks } = await client
    .from('assigned_tasks')
    .select('id, assignee_rep_id')
    .eq('job_id', id)
    .eq('kind', 'FOLLOW_UP')
    .in('status', ['OPEN', 'IN_PROGRESS'])
  for (const task of openTasks ?? []) {
    try {
      if (task.assignee_rep_id === authCtx.repId || isAdmin) {
        await completeAssignedTask(client, authCtx, task.id as string)
      }
    } catch { /* a completed task must not block the follow-up */ }
  }

  // Schedule the next follow-up, or the archive review after the second.
  let nextDueAt: string | null = null
  if (nextIndex < 2) {
    nextDueAt = new Date(Date.now() + FOLLOWUP_POLICY.secondFollowUpDays * 86_400_000).toISOString()
    try {
      await createAssignedTask(client, authCtx, {
        assigneeRepId: actingRepId,
        kind: 'FOLLOW_UP',
        title: `Follow up on ${job.title} (2 of 2)`,
        description: `Second follow-up. If there is no reply, the job becomes an archive candidate ${FOLLOWUP_POLICY.archiveReviewDays} days later.`,
        dueAt: nextDueAt,
        jobId: id,
        profileId: application.personProfileId,
        revenueIdentityId: application.revenueIdentityId,
      })
    } catch { /* a missing reminder must never fail a logged follow-up */ }
  }

  try {
    await emitAction({
      orgId: authCtx.orgId,
      actionType: 'UPWORK_FOLLOWUP_SENT',
      actorType: 'rep',
      actorId: actingRepId,
      jobId: id,
      senderProfileId: application.personProfileId,
      channel: 'upwork',
      idempotencyKey: `upwork_followup:${id}:${message.id}`,
    })
  } catch { /* ledger must never break domain operations */ }

  return NextResponse.json({ ok: true, followUpNumber: nextIndex, nextDueAt })
}
