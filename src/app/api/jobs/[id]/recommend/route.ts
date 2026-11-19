import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { recommendProfilesForJob } from '@/lib/job-discovery/service'

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
  const profiles = await store.listProfiles()
  const recommendations = await recommendProfilesForJob(
    store.getSupabaseClient(),
    auth.orgId,
    id,
    5,
    profiles.map((profile) => profile.id),
  )
  return NextResponse.json({ recommendations })
}
