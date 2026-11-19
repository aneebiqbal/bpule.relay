import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { listApplications } from '@/lib/job-discovery/service'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const url = new URL(request.url)
  const profileId = url.searchParams.get('profileId') ?? undefined
  const applications = await listApplications(store.getSupabaseClient(), auth.orgId, profileId)
  return NextResponse.json({ applications })
}
