import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { runJobDiscovery } from '@/lib/job-discovery/ingest'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Admin manual refresh. Bounded by the worker's own source cap and lock. */
export async function POST(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!(auth.isAdmin || auth.isOwner)) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { sourceIds?: string[] }
  const result = await runJobDiscovery({
    sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds : undefined,
    maxSources: 4,
    timeoutMs: 20_000,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 423 })
}
