import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { deleteJobFilter, listJobFilters, saveJobFilter } from '@/lib/job-discovery/service'

export const dynamic = 'force-dynamic'

export async function GET() {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const filters = await listJobFilters(store.getSupabaseClient(), auth.orgId, auth.repId)
  return NextResponse.json({ filters })
}

export async function POST(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { name?: string; filters?: Record<string, unknown> }
  if (!body.name?.trim() || !body.filters) {
    return NextResponse.json({ error: 'name and filters are required.' }, { status: 400 })
  }
  const id = await saveJobFilter(store.getSupabaseClient(), auth.orgId, auth.repId, body.name.trim(), body.filters)
  return NextResponse.json({ id }, { status: 201 })
}

export async function DELETE(request: Request) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })
  await deleteJobFilter(store.getSupabaseClient(), auth.orgId, auth.repId, id)
  return NextResponse.json({ ok: true })
}
