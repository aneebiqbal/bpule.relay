import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/drafts/[id]/feedback
 * Record user feedback (Good / Not for me)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const reason = body?.reason as string | undefined
  const reaction = body?.reaction as string | undefined

  const store = await createScoutStore()

  const draft = await store.getContentDraft(id)
  if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  try {
    await store.createContentDraftFeedback({
      personaId: draft.personaId,
      draftId: id,
      topicClusterId: draft.topicClusterId,
      sourceKind: draft.sourceKind ?? 'field_update',
      reaction: (reaction === 'posting' ? 'posting' : 'not_for_me') as 'posting' | 'not_for_me' | 'posting_after_edit',
      edited: false,
      editSignals: reason ? [reason] : [],
    })

    // Update taste profile if available
    const tasteStore = store as any
    if (tasteStore.updateTasteFromFeedback) {
      await tasteStore.updateTasteFromFeedback({
        personaId: draft.personaId,
        reaction: reaction === 'posting' ? 'posting' : 'not_for_me',
        editSignals: reason ? [reason] : [],
        territory: draft.sourceMaterial,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 })
  }
}
