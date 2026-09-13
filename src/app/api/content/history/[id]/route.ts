import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/content/history/[id] — tag a past post with a real outcome
 * (a DM, an inquiry, a follow-up conversation), or clear that tag.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body.ledToRealOutcome !== 'boolean') {
    return NextResponse.json({ error: 'ledToRealOutcome (boolean) is required' }, { status: 400 })
  }

  const store = await createScoutStore()

  const entry = await store.getContentHistoryEntry(id)
  if (!entry) return NextResponse.json({ error: 'History entry not found' }, { status: 404 })

  const persona = await store.getContentPersona(entry.personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const updated = await store.markContentHistoryOutcome(id, body.ledToRealOutcome as boolean)
  return NextResponse.json({ entry: updated })
}
