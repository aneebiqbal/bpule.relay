import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'

/**
 * POST /api/upwork/jobs/[id]/archive
 * Body: { repId? }
 *
 * Archive preserves the job, application, proposal, screening answers,
 * connects, follow-ups, messages, tasks and events. It only leaves the active
 * queue. Applied jobs can archive; they can never be deleted.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { repId?: string }
  try {
    body = await request.json().catch(() => ({}))
  } catch {
    body = {}
  }

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
  if (job.status === 'ARCHIVED') {
    return NextResponse.json({ ok: true, alreadyArchived: true })
  }

  await store.archiveUpworkJob(id, actingRepId)
  return NextResponse.json({ ok: true })
}
