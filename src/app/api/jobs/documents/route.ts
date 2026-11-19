import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { listDocuments } from '@/lib/job-discovery/service'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const url = new URL(request.url)
  const profileId = url.searchParams.get('profileId')
  if (!profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  const documents = await listDocuments(store.getSupabaseClient(), auth.orgId, profileId, url.searchParams.get('jobId') ?? undefined)
  return NextResponse.json({ documents })
}
