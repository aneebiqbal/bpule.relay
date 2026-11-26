import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { getManualSyncRequest, requestManualSync } from '@/lib/job-discovery/sync-requests'

export const dynamic = 'force-dynamic'

/**
 * Manual Jobs synchronization.
 *
 * POST enqueues one durable run and returns immediately — it never crawls in
 * the request. Repeated clicks inside the cooldown return the same run.
 * GET polls a run's status/result.
 */
export async function POST(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!(auth.isAdmin || auth.isOwner)) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as { sourceIds?: string[] }
  const result = await requestManualSync(store.getSupabaseClient(), {
    organizationId: auth.orgId,
    requestedBy: auth.repId,
    sourceIds: Array.isArray(body.sourceIds) ? body.sourceIds : undefined,
  })
  return NextResponse.json({
    requestId: result.request.id,
    status: result.request.status,
    reused: result.reused,
    createdAt: result.request.created_at,
  })
}

export async function GET(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const requestId = new URL(request.url).searchParams.get('requestId')
  if (!requestId) return NextResponse.json({ error: 'requestId required.' }, { status: 400 })
  const row = await getManualSyncRequest(store.getSupabaseClient(), auth.orgId, requestId)
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json(row)
}
