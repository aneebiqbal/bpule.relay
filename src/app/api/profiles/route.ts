import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext, can } from '@/lib/auth/organization'
import {
  filterAssignedProfilesByChannel,
  listAssignedProfiles,
} from '@/lib/profiles/assigned-profiles'
import type { RevenueIdentityChannel } from '@/lib/domain/types'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const admin = url.searchParams.get('admin') === '1'
  const assigned = url.searchParams.get('assigned') === '1'

  const authCtx = await getAuthContext()
  if (!authCtx) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
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

  if (admin) {
    // Reading every rep's profiles is open to any authenticated rep (same
    const profiles = await store.listAllProfiles()
    return NextResponse.json({ profiles })
  }

  if (assigned) {
    const channelParam = url.searchParams.get('channel')
    const channel = channelParam === 'linkedin' || channelParam === 'upwork' || channelParam === 'email'
      ? channelParam
      : null
    const profiles = channel
      ? filterAssignedProfilesByChannel(await listAssignedProfiles(), channel as RevenueIdentityChannel)
      : await listAssignedProfiles()
    return NextResponse.json({ profiles: profiles.map((a) => a.profile) })
  }

  const profiles = await store.listProfiles()
  return NextResponse.json({ profiles })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const platform = body.platform
  if (platform !== 'linkedin' && platform !== 'upwork') {
    return NextResponse.json(
      { error: 'platform must be linkedin or upwork.' },
      { status: 400 },
    )
  }

  const authCtx = await getAuthContext()
  if (!authCtx) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // Profile creation/editing is an admin-only action — reps select from
  // profiles an admin has already created, they do not self-register one.
  // Enforced here server-side, independent of the RLS policy on `profiles`.
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized. Ask an admin to create or edit this profile.' }, { status: 403 })
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

  const targetRepId = typeof body.repId === 'string' ? body.repId : authCtx.repId

  const profile = await store.upsertProfileAdmin({
    id: typeof body.id === 'string' ? body.id : undefined,
    repId: targetRepId,
    platform,
    label: typeof body.label === 'string' ? body.label : null,
    profileUrl: typeof body.profileUrl === 'string' ? body.profileUrl : null,
    headline: typeof body.headline === 'string' ? body.headline : null,
    cvPath: typeof body.cvPath === 'string' ? body.cvPath : null,
  })
  return NextResponse.json({ profile })
}