import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { createServiceSupabase } from '@/lib/supabase/service'
import { listSources, updateSource } from '@/lib/job-discovery/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!(auth.isAdmin || auth.isOwner)) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  const sources = await listSources(store.getSupabaseClient())
  return NextResponse.json({ sources })
}

export async function POST(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!(auth.isAdmin || auth.isOwner)) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { id?: string; enabled?: boolean; config?: Record<string, unknown>; intervalSecs?: number }
  if (!body.id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  await updateSource(createServiceSupabase(), body.id, {
    enabled: body.enabled,
    config: body.config,
    intervalSecs: body.intervalSecs,
  })
  return NextResponse.json({ ok: true })
}
