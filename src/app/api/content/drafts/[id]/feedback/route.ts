import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { applyTasteSignal } from '@/lib/content/intelligence/v2/taste'

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

  const persona = await store.getContentPersona(draft.personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

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

    // Update taste profile from explicit feedback
    try {
      const isPosting = reaction === 'posting'
      const feedbackSignalKey = `feedback:${id}:${isPosting ? 'posting' : 'not_for_me'}`
      const storedTaste = await store.getTasteProfile(draft.personaId)

      // Idempotency: skip if this exact feedback signal was already applied
      if (storedTaste?.lastSignalKey === feedbackSignalKey) {
        return NextResponse.json({ success: true })
      }

      const { createTasteProfile } = await import('@/lib/content/intelligence/v2/taste')
      const tp = storedTaste ? {
        personaId: storedTaste.personaId,
        preferences: storedTaste.preferences,
        territoryAffinity: storedTaste.territoryAffinity,
        totalInteractions: storedTaste.totalInteractions,
        lastUpdated: storedTaste.lastSignalAt ?? new Date().toISOString(),
        shortTerm: storedTaste.shortTerm,
        shortTermWeight: storedTaste.shortTermWeight,
      } : createTasteProfile(draft.personaId)

      const contentText = `${draft.sourceMaterial} ${draft.caption}`.toLowerCase()
      const territory = deriveTerritoryFromText(contentText)
      const contentType = deriveContentType(contentText)

      const updated = applyTasteSignal(tp, {
        type: isPosting ? 'posting' : 'not_for_me',
        territory,
        contentType,
        metadata: {
          wasTechnical: /\b(engineer|technical|system|architecture|code|api|database|infra|deploy|debug)\b/.test(contentText),
          wasOpinion: /\b(i think|i believe|in my opinion|honestly|unpopular opinion|hot take)\b/.test(contentText),
          wasTimely: /\b(new|launch|release|announce|update|just|today|this week)\b/.test(contentText),
          wasPersonal: /\b(i did|my team|we built|i learned|my experience|i was)\b/.test(contentText),
        },
        idempotencyKey: feedbackSignalKey,
      })

      await store.saveTasteProfile(draft.personaId, {
        preferences: updated.preferences,
        territoryAffinity: updated.territoryAffinity,
        totalInteractions: updated.totalInteractions,
        lastSignalType: isPosting ? 'posting' : 'not_for_me',
        lastSignalKey: feedbackSignalKey,
        shortTerm: updated.shortTerm,
        shortTermWeight: updated.shortTermWeight,
      })
    } catch {
      // Taste recording is best-effort; don't fail the request
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to record feedback' }, { status: 500 })
  }
}

function deriveTerritoryFromText(text: string): string | undefined {
  if (/career|promotion|senior|lead|management|hiring/.test(text)) return 'career'
  if (/team|culture|collaboration|meeting|remote|process/.test(text)) return 'engineering_culture'
  if (/ai|llm|gpt|machine learning|agent|model/.test(text)) return 'ai'
  if (/debug|mistake|lesson|learned|fixed|solved/.test(text)) return 'learning'
  if (/tool|docker|git|cursor|ide|workflow|automation/.test(text)) return 'tools'
  if (/opinion|believe|think|unpopular|take|agree/.test(text)) return 'opinions'
  return undefined
}

function deriveContentType(text: string): 'technical' | 'opinion' | 'human' | 'educational' | 'timely' | 'observation' | undefined {
  if (/tutorial|how to|guide|explain|learn|teach/.test(text)) return 'educational'
  if (/i think|i believe|in my opinion|honestly|unpopular opinion/.test(text)) return 'opinion'
  if (/new|launch|release|announce|just|today/.test(text)) return 'timely'
  if (/i did|my team|we built|i learned|story/.test(text)) return 'human'
  if (/engineer|system|architecture|code|api|database/.test(text)) return 'technical'
  if (/noticed|observ|pattern|interesting|reminds/.test(text)) return 'observation'
  return undefined
}
