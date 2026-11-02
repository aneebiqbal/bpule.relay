import { NextResponse } from 'next/server'
import { getDatabaseCapabilities, notAvailableBody } from '@/lib/operations/capabilities'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import {
  SavedViewError,
  createSavedView,
  isSavedViewSurface,
  listSavedViews,
  normalizeViewName,
  sanitizeViewQuery,
} from '@/lib/operations/saved-views'

export const dynamic = 'force-dynamic'

function fail(err: unknown) {
  if (err instanceof SavedViewError) return NextResponse.json({ error: err.message }, { status: err.status })
  console.error('saved views route failed:', err)
  return NextResponse.json({ error: 'Saved views failed.' }, { status: 500 })
}

export async function GET(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const surface = new URL(request.url).searchParams.get('surface')
  if (!isSavedViewSurface(surface)) return NextResponse.json({ error: 'Unknown surface' }, { status: 400 })
  try {
    const client = (await createScoutStore()).getSupabaseClient()
    if (!(await getDatabaseCapabilities(client)).savedViews) {
      return NextResponse.json({ views: [], available: false })
    }
    const views = await listSavedViews(client, auth, surface)
    return NextResponse.json({ views: views ?? [], available: views !== null })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { surface?: unknown; name?: unknown; query?: unknown }
  if (!isSavedViewSurface(body.surface)) return NextResponse.json({ error: 'Unknown surface' }, { status: 400 })
  try {
    const client = (await createScoutStore()).getSupabaseClient()
    if (!(await getDatabaseCapabilities(client)).savedViews) {
      return NextResponse.json(notAvailableBody('savedViews'), { status: 503 })
    }
    const view = await createSavedView(client, auth, {
      surface: body.surface,
      name: normalizeViewName(body.name),
      query: sanitizeViewQuery(body.query),
    })
    return NextResponse.json({ view }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
