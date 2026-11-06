import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import {
  filterAssignedProfilesByChannel,
  listAssignedProfiles,
  listAssignedProfilesForRep,
} from '@/lib/profiles/assigned-profiles'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const jobId = typeof body.jobId === 'string' ? body.jobId : ''
  const draftText = typeof body.draftText === 'string' ? body.draftText.trim() : ''
  const type = typeof body.type === 'string' ? body.type : 'cover'
  const modelUsed = typeof body.modelUsed === 'string' ? body.modelUsed : ''
  if (!jobId || !draftText) {
    return NextResponse.json(
      { error: 'jobId and draftText are required.' },
      { status: 400 },
    )
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

  // The persisted sender is attribution, not a trust boundary — but a client-
  // supplied id must still resolve to an Upwork-capable profile assigned to the
  // acting rep. An ineligible id is rejected rather than silently dropped: a
  // silently dropped id would save the draft with no sender and lose the
  // profile the proposal was actually written in.
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
  if (!senderProfile) {
    return NextResponse.json({ error: 'No Upwork profile is assigned to you.' }, { status: 400 })
  }

  const msg = await store.saveUpworkDraft({
    jobId,
    type: type as 'cover' | 'followup' | 'reply',
    draftText,
    modelUsed,
    senderProfileId: senderProfile.profile.id,
  })
  return NextResponse.json({ message: msg, profileId: senderProfile.profile.id })
}
