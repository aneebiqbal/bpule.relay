import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { ensureJobMatches, getJob } from '@/lib/job-discovery/service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { profileId?: string }
  if (!body.profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })

  await ensureJobMatches(store.getSupabaseClient(), auth.orgId, body.profileId, [id])
  const job = await getJob(store.getSupabaseClient(), auth.orgId, id, body.profileId)
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  return NextResponse.json({ job })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await params
  const url = new URL(request.url)
  const profileId = url.searchParams.get('profileId')
  if (!profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  const job = await getJob(store.getSupabaseClient(), auth.orgId, id, profileId)
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  return NextResponse.json({ match: job.match, eligibility: job.eligibility })
}
