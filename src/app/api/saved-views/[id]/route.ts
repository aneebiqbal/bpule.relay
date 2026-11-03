import { NextResponse } from 'next/server'
import { getDatabaseCapabilities, notAvailableBody } from '@/lib/operations/capabilities'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { SavedViewError, deleteSavedView } from '@/lib/operations/saved-views'

export const dynamic = 'force-dynamic'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const client = (await createScoutStore()).getSupabaseClient()
    if (!(await getDatabaseCapabilities(client)).savedViews) {
      return NextResponse.json(notAvailableBody('savedViews'), { status: 503 })
    }
    await deleteSavedView(client, auth, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof SavedViewError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('saved view delete failed:', err)
    return NextResponse.json({ error: 'Could not delete view.' }, { status: 500 })
  }
}
