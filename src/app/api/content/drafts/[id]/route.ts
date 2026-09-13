import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { status, action, editedCaption } = body as {
    status?: string
    action?: 'posting' | 'not_for_me'
    editedCaption?: string
  }

  const store = await createScoutStore()

  try {
    const draft = await store.getContentDraft(id)
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    const persona = await store.getContentPersona(draft.personaId)
    if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
    if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (action) {
      if (!['posting', 'not_for_me'].includes(action)) {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
      }

      let nextDraft = draft
      const trimmedEdit = typeof editedCaption === 'string' ? editedCaption.trim() : ''
      const isEdited = trimmedEdit.length > 0 && trimmedEdit !== draft.caption.trim()

      if (action === 'posting') {
        if (isEdited) {
          nextDraft = await store.updateContentDraftCaption(id, trimmedEdit)
        }
        nextDraft = await store.updateContentDraftStatus(id, 'posted')
        await store.createContentDraftFeedback({
          personaId: nextDraft.personaId,
          draftId: nextDraft.id,
          topicClusterId: nextDraft.topicClusterId,
          sourceKind: nextDraft.sourceKind,
          reaction: isEdited ? 'posting_after_edit' : 'posting',
          edited: isEdited,
          editSignals: isEdited ? inferEditSignals(draft.caption, trimmedEdit) : [],
        })
      } else {
        nextDraft = await store.updateContentDraftStatus(id, 'rejected')
        await store.createContentDraftFeedback({
          personaId: nextDraft.personaId,
          draftId: nextDraft.id,
          topicClusterId: nextDraft.topicClusterId,
          sourceKind: nextDraft.sourceKind,
          reaction: 'not_for_me',
          edited: false,
          editSignals: [],
        })
      }

      return NextResponse.json({ draft: nextDraft })
    }

    if (!status || !['draft', 'ready', 'posted', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const updated = await store.updateContentDraftStatus(id, status as 'draft' | 'ready' | 'posted' | 'rejected')
    return NextResponse.json({ draft: updated })
  } catch {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
}

function inferEditSignals(original: string, edited: string): string[] {
  const signals: string[] = []
  if (edited.length < original.length * 0.85) signals.push('shorter')
  if (edited.length > original.length * 1.15) signals.push('longer')

  const originalOpening = original.split('\n').find((l) => l.trim().length > 0) ?? ''
  const editedOpening = edited.split('\n').find((l) => l.trim().length > 0) ?? ''
  if (originalOpening.trim() && editedOpening.trim() && originalOpening.trim() !== editedOpening.trim()) {
    signals.push('changed opening')
  }

  const softeners = ['maybe', 'might', 'perhaps', 'kind of', 'i think']
  const direct = ['will', 'must', 'do this', 'avoid this', 'clear']
  const softBefore = softeners.some((w) => original.toLowerCase().includes(w))
  const softAfter = softeners.some((w) => edited.toLowerCase().includes(w))
  const directBefore = direct.some((w) => original.toLowerCase().includes(w))
  const directAfter = direct.some((w) => edited.toLowerCase().includes(w))
  if (softBefore !== softAfter || directBefore !== directAfter) signals.push('tone shift')

  return signals.slice(0, 3)
}
