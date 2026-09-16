import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/content/drafts/[id]
 * Returns draft + visual data
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const store = await createScoutStore()

  const draft = await store.getContentDraft(id)
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  if (draft.personaId) {
    const persona = await store.getContentPersona(draft.personaId)
    if (persona && persona.repId !== user.rep.id && user.rep.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
  }

  return NextResponse.json({ draft })
}

/**
 * PATCH /api/content/drafts/[id]
 * Update caption (autosave)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const caption = body?.caption as string | undefined

  if (typeof caption !== 'string') return NextResponse.json({ error: 'caption must be a string' }, { status: 400 })

  const store = await createScoutStore()

  const existing = await store.getContentDraft(id)
  if (!existing) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  if (existing.personaId) {
    const persona = await store.getContentPersona(existing.personaId)
    if (persona && persona.repId !== user.rep.id && user.rep.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
  }

  try {
    const draft = await store.updateContentDraft({ draftId: id, caption })
    return NextResponse.json({ draft })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
