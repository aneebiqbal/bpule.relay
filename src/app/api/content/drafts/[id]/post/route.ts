import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/drafts/[id]/post
 * Mark draft as posted, update memory/taste
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const caption = body?.caption as string | undefined

  const store = await createScoutStore()

  // Get draft
  const draft = await store.getContentDraft(id)
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  const persona = await store.getContentPersona(draft.personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (draft.status === 'posted') {
    return NextResponse.json({ success: true, alreadyPosted: true })
  }

  const edited = typeof caption === 'string' && caption !== draft.caption
  const finalCaption = typeof caption === 'string' ? caption : draft.caption

  // Update caption if provided
  if (edited) {
    await store.updateContentDraft({ draftId: id, caption: finalCaption })
  }

  // Mark as posted
  try {
    await store.updateContentDraftStatus(id, 'posted')

    const openingLine = finalCaption.split('\n')[0]?.trim() || finalCaption.slice(0, 220)
    if (openingLine) {
      await store.logContentPosted({
        personaId: draft.personaId,
        pillarId: draft.pillarId,
        topicClusterId: draft.topicClusterId,
        platform: draft.platform,
        openingLine: openingLine.slice(0, 220),
      }).catch(() => {})
    }

    // Record memories
    const hook = finalCaption.split('\n')[0]?.slice(0, 80) ?? ''
    const topics = draft.sourceMaterial?.slice(0, 80) ?? ''

    if (topics) {
      await store.createContentMemory({
        personaId: draft.personaId,
        memoryType: 'topic_covered',
        content: topics,
        sourceDraftId: id,
      }).catch(() => {})
    }
    if (hook) {
      await store.createContentMemory({
        personaId: draft.personaId,
        memoryType: 'hook_used',
        content: hook,
        sourceDraftId: id,
      }).catch(() => {})
    }

    // Record taste signal
    await store.createContentDraftFeedback({
      personaId: draft.personaId,
      draftId: id,
      topicClusterId: draft.topicClusterId,
      sourceKind: draft.sourceKind ?? 'field_update',
      reaction: 'posting',
      edited,
      editSignals: [],
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to mark as posted' }, { status: 500 })
  }
}
