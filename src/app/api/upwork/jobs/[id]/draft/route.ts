import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import {
  filterAssignedProfilesByChannel,
  listAssignedProfiles,
  listAssignedProfilesForRep,
} from '@/lib/profiles/assigned-profiles'
import type { UpworkScreeningAnswer } from '@/lib/domain/types'

/**
 * POST /api/upwork/jobs/[id]/draft
 * Body: { proposalText, screeningAnswers?, modelTier?, promptVersion?,
 *         proofRefs?, profileId?, repId? }
 *
 * Saves a proposal version. Screening answers persist with it, so a generated
 * draft survives a reload. A draft is never an application.
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

  const screeningAnswers: UpworkScreeningAnswer[] = Array.isArray(body.screeningAnswers)
    ? (body.screeningAnswers as unknown[]).filter(
        (a): a is UpworkScreeningAnswer =>
          typeof a === 'object' && a !== null && typeof (a as { question?: unknown }).question === 'string',
      )
    : []

  const store = await createScoutStore()
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const requestedRepId = typeof body.repId === 'string' ? body.repId : null
  const isAdmin = Boolean(authCtx.isAdmin || authCtx.isOwner)
  let actingRepId = authCtx.repId
  if (requestedRepId && requestedRepId !== authCtx.repId) {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Not authorized to save for another rep.' }, { status: 403 })
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
  if (job.ownerRepId !== actingRepId && !isAdmin) {
    return NextResponse.json({ error: 'You do not own this job.' }, { status: 403 })
  }

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
    return NextResponse.json({ error: 'No Upwork profile is assigned to you.' }, { status: 400 })
  }

  const version = await store.createUpworkProposalVersion({
    jobId,
    repId: actingRepId,
    profileId: sender.profile.id,
    revenueIdentityId: sender.assignedIdentityIds[0] ?? null,
    proposalText,
    modelTier: typeof body.modelTier === 'string' ? body.modelTier : null,
    promptVersion: typeof body.promptVersion === 'string' ? body.promptVersion : null,
    proofRefs: Array.isArray(body.proofRefs) ? (body.proofRefs as unknown[]) : [],
    screeningAnswers,
  })

  // Generated ≠ applied: the proposal event is observability, never an application.
  try {
    const { emitAction } = await import('@/lib/action-ledger')
    await emitAction({
      orgId: authCtx.orgId,
      actionType: 'UPWORK_PROPOSAL_PREPARED',
      actorType: 'rep',
      actorId: actingRepId,
      jobId,
      senderProfileId: sender.profile.id,
      executionStatus: 'generated',
      channel: 'upwork',
      idempotencyKey: `upwork_proposal:${version.id}`,
    })
  } catch {
    // Ledger must never break domain operations.
  }

  return NextResponse.json({ version, profileId: sender.profile.id })
}
