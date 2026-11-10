import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import {
  filterAssignedProfilesByChannel,
  listAssignedProfiles,
  listAssignedProfilesForRep,
} from '@/lib/profiles/assigned-profiles'
import { hasUnfilledValues, UNFILLED_VALUES_MESSAGE } from '@/lib/relay/unfilled-values'
import { FOLLOWUP_POLICY } from '@/lib/upwork/lifecycle'
import { createAssignedTask } from '@/lib/tasks/assigned-tasks'
import type { UpworkScreeningAnswer } from '@/lib/domain/types'

// A job scoring below this is not recommended for a Connect spend — see
// verdictFor() in upwork-rubric.ts. The client disables the button, but this
// route is the real enforcement point.
const MIN_SCORE_TO_APPLY = 6

/**
 * POST /api/upwork/jobs/[id]/apply
 * Body: { proposalText, screeningAnswers?, connectsSpent?, boostConnects?,
 *         modelTier?, promptVersion?, proofRefs?, proposalVersionId?, repId? }
 *
 * One explicit confirmation creates exactly one application. The proposal
 * version, application row and job status commit together in the database.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const proposalText = typeof body.proposalText === 'string' ? body.proposalText.trim() : ''
  if (!proposalText) {
    return NextResponse.json({ error: 'proposalText is required.' }, { status: 400 })
  }
  if (hasUnfilledValues(proposalText)) {
    return NextResponse.json({ error: UNFILLED_VALUES_MESSAGE }, { status: 400 })
  }

  const screeningAnswers: UpworkScreeningAnswer[] = Array.isArray(body.screeningAnswers)
    ? (body.screeningAnswers as unknown[]).filter(
        (a): a is UpworkScreeningAnswer =>
          typeof a === 'object' && a !== null && typeof (a as { question?: unknown }).question === 'string',
      )
    : []
  const connectsSpent = typeof body.connectsSpent === 'number' && Number.isFinite(body.connectsSpent)
    ? Math.round(body.connectsSpent)
    : null
  const boostConnects = typeof body.boostConnects === 'number' && Number.isFinite(body.boostConnects)
    ? Math.round(body.boostConnects)
    : 0
  const modelTier = typeof body.modelTier === 'string' ? body.modelTier : null
  const promptVersion = typeof body.promptVersion === 'string' ? body.promptVersion : null
  const proofRefs = Array.isArray(body.proofRefs) ? (body.proofRefs as unknown[]) : []

  const store = await createScoutStore()
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

  const job = await store.getUpworkJob(jobId)
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  if (job.organizationId !== authCtx.orgId) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }
  // Only the owning rep, or an admin/owner, may apply.
  if (job.ownerRepId !== actingRepId && !isAdmin) {
    return NextResponse.json({ error: 'You do not own this job.' }, { status: 403 })
  }
  if (job.score === null || job.score < MIN_SCORE_TO_APPLY) {
    return NextResponse.json(
      { error: `Score below ${MIN_SCORE_TO_APPLY} — Relay does not recommend spending a Connect here.` },
      { status: 400 },
    )
  }

  // The applied proposal must carry the sender the rep selected. A client-
  // supplied id is reauthorized against the acting rep's eligible profiles.
  const assigned = actingRepId === authCtx.repId
    ? await listAssignedProfiles()
    : await listAssignedProfilesForRep(authCtx.orgId, actingRepId)
  const upworkProfiles = filterAssignedProfilesByChannel(assigned, 'upwork')
  const requestedProfileId = typeof body.profileId === 'string' ? body.profileId : null
  const sender = requestedProfileId
    ? upworkProfiles.find((a) => a.profile.id === requestedProfileId) ?? null
    : upworkProfiles[0] ?? null

  if (requestedProfileId && !sender) {
    return NextResponse.json(
      { error: 'That profile is not assigned to you for Upwork. Select an eligible profile.' },
      { status: 403 },
    )
  }
  if (!sender) {
    return NextResponse.json(
      { error: 'Select an eligible Upwork profile before marking this job applied.' },
      { status: 400 },
    )
  }

  const revenueIdentityId = sender.assignedIdentityIds[0] ?? null

  try {
    const application = await store.submitUpworkApplication({
      jobId,
      repId: actingRepId,
      revenueIdentityId,
      profileId: sender.profile.id,
      proposalText,
      modelTier,
      promptVersion,
      proofRefs,
      screeningAnswers,
      connectsSpent,
      boostConnects,
    })

    // The first follow-up enters the canonical task engine — no second scheduler.
    try {
      const dueAt = new Date(Date.now() + FOLLOWUP_POLICY.firstFollowUpDays * 86_400_000).toISOString()
      await createAssignedTask(store.getSupabaseClient(), authCtx, {
        assigneeRepId: actingRepId,
        kind: 'FOLLOW_UP',
        title: `Follow up on ${job.title}`,
        description: `Application submitted. First follow-up due ${FOLLOWUP_POLICY.firstFollowUpDays} days after submission.`,
        dueAt,
        jobId,
        profileId: sender.profile.id,
        revenueIdentityId,
      })
    } catch {
      // A missing reminder must never fail a submitted application.
    }

    return NextResponse.json({ ok: true, application, profileId: sender.profile.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit the application.' },
      { status: 500 },
    )
  }
}
