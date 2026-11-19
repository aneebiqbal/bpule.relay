import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { setSavedJob } from '@/lib/job-discovery/service'

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
  const body = (await request.json().catch(() => ({}))) as { profileId?: string; saved?: boolean; notes?: string }
  if (!body.profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  await setSavedJob(
    store.getSupabaseClient(),
    auth.orgId,
    id,
    body.profileId,
    auth.repId,
    body.saved !== false,
    body.notes,
  )
  return NextResponse.json({ ok: true })
}
