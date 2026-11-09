import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import {
  filterAssignedProfilesByChannel,
  listAssignedProfiles,
  listAssignedProfilesForRep,
} from '@/lib/profiles/assigned-profiles'
import { hasUnfilledValues, UNFILLED_VALUES_MESSAGE } from '@/lib/relay/unfilled-values'

// A job scoring below this is not recommended for a Connect spend — see
// src/lib/score/upwork-rubric.ts's verdictFor() (6-10 apply, 3-5
// apply_if_connects, 0-2 skip). The client already disables "Mark as
// applied" below this score (see upwork-job-actions.tsx), but a disabled
// button is not a security/business-logic boundary — this route is the real
// enforcement point and must reject independently of what the client sent.
const MIN_SCORE_TO_APPLY = 6

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: pathJobId } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  // jobId in the body is accepted for backward compatibility with existing
  // callers, but the route's own [id] segment is the source of truth.
  const jobId = pathJobId || (typeof body.jobId === 'string' ? body.jobId : '')
  const sentText = typeof body.sentText === 'string' ? body.sentText.trim() : ''
  const type = typeof body.type === 'string' ? body.type : 'cover'
  if (!jobId || !sentText) {
    return NextResponse.json(
      { error: 'jobId and sentText are required.' },
      { status: 400 },
    )
  }
  // A proposal with a stripped number or placeholder is never sendable.
  if (hasUnfilledValues(sentText)) {
    return NextResponse.json({ error: UNFILLED_VALUES_MESSAGE }, { status: 400 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  // Admin/owner on-behalf: the acting rep must belong to the caller's org.
  const requestedRepId = typeof body.repId === 'string' ? body.repId : null
  const isAdmin = Boolean(authCtx.isAdmin || authCtx.isOwner)
  let actingRepId = authCtx.repId
  if (requestedRepId && requestedRepId !== authCtx.repId) {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Not authorized to apply for another rep.' }, { status: 403 })
    }
    const { data: repRow } = await store
      .getSupabaseClient()
      .from('reps')
      .select('id')
      .eq('id', requestedRepId)
      .eq('organization_id', authCtx.orgId)
      .maybeSingle()
    if (!repRow) {
      return NextResponse.json({ error: 'That rep is not in your organization.' }, { status: 403 })
    }
    actingRepId = repRow.id as string
  }

  // Server-side score gate — reuses the score computed and stored at
  // job-creation time (computeUpworkScore), never recomputed here. The job and
  // its gate are checked before any profile work: a missing job or a score too
  // low to spend a Connect on must not read profiles at all.
  const job = await store.getUpworkJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }
  if (job.score === null || job.score < MIN_SCORE_TO_APPLY) {
    return NextResponse.json(
      {
        error: `Score below ${MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.`,
      },
      { status: 400 },
    )
  }

  // The applied proposal must carry the same sender the rep selected, generated
  // with and saved under. A client-supplied id is reauthorized against the
  // acting rep's eligible Upwork profiles before it is persisted.
  const assigned = actingRepId === authCtx.repId
    ? await listAssignedProfiles()
    : await listAssignedProfilesForRep(authCtx.orgId, actingRepId)
  const upworkProfiles = filterAssignedProfilesByChannel(assigned, 'upwork')
  const requestedProfileId = typeof body.profileId === 'string' ? body.profileId : null
  const senderProfile = requestedProfileId
    ? upworkProfiles.find((a) => a.profile.id === requestedProfileId) ?? null
    : upworkProfiles[0] ?? null

  if (requestedProfileId && !senderProfile) {
    return NextResponse.json(
      { error: 'That profile is not assigned to you for Upwork. Select an eligible profile.' },
      { status: 403 },
    )
  }

  // A proposal with no sender cannot be attributed. Never mark a job applied
  // without the profile it was sent from.
  if (!senderProfile) {
    return NextResponse.json(
      { error: 'Select an eligible Upwork profile before marking this job applied.' },
      { status: 400 },
    )
  }

  await store.markUpworkApplied(
    jobId,
    sentText,
    type as 'cover' | 'followup' | 'reply',
    senderProfile?.profile.id ?? null,
    actingRepId,
  )
  return NextResponse.json({ ok: true, profileId: senderProfile?.profile.id ?? null })
}
