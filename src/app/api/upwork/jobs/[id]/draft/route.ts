import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { filterAssignedProfilesByChannel, listAssignedProfiles } from '@/lib/profiles/assigned-profiles'

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

  // The profile is attribution, not a trust boundary — but a client-supplied id
  // must still resolve to an Upwork-capable profile assigned to this rep.
  const requestedProfileId = typeof body.profileId === 'string' ? body.profileId : null
  let senderProfileId: string | null = null
  if (requestedProfileId) {
    const upworkProfiles = filterAssignedProfilesByChannel(await listAssignedProfiles(), 'upwork')
    if (upworkProfiles.some((a) => a.profile.id === requestedProfileId)) senderProfileId = requestedProfileId
  }

  const msg = await store.saveUpworkDraft({
    jobId,
    type: type as 'cover' | 'followup' | 'reply',
    draftText,
    modelUsed,
    senderProfileId,
  })
  return NextResponse.json({ message: msg })
}
