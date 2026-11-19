import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { getJob, getJobDetail } from '@/lib/job-discovery/service'

export const dynamic = 'force-dynamic'

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
  const profileId = url.searchParams.get('profileId') ?? undefined

  const [job, detail] = await Promise.all([
    getJob(store.getSupabaseClient(), auth.orgId, id, profileId),
    getJobDetail(store.getSupabaseClient(), id),
  ])
  if (!job || !detail) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  return NextResponse.json({ job, detail })
}
