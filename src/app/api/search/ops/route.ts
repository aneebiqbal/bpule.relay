import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { resolveOperationalScope } from '@/lib/operations/scope'
import { searchOperational } from '@/lib/operations/global-search'

export const dynamic = 'force-dynamic'

/** Grouped Cmd-K search: people, companies, leads, tasks, conversations — scoped. */
export async function GET(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(request.url).searchParams.get('q') ?? ''
  try {
    const client = (await createScoutStore()).getSupabaseClient()
    const scope = await resolveOperationalScope(client, auth)
    const groups = await searchOperational(client, auth, scope, q)
    return NextResponse.json({ groups })
  } catch (err) {
    console.error('ops search failed:', err)
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
  }
}
