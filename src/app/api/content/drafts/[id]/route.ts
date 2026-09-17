import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generateVisualConcept } from '@/lib/writing/visual'
import { normalizeDraftWorkspacePlatform } from '@/lib/content/draft-workspace'

export const dynamic = 'force-dynamic'

function buildDraftVisual(caption: string, sourceMaterial: string, platform: string): {
  visual: { idea: string; imagePrompt: string; platform: 'linkedin' | 'x' } | null
  visualError: string | null
} {
  try {
    const normalizedPlatform = normalizeDraftWorkspacePlatform(platform)
    const concept = generateVisualConcept({
      postText: caption,
      platform: normalizedPlatform,
      angle: sourceMaterial,
      topic: sourceMaterial,
      coreDetail: caption.slice(0, 140),
      tone: 'confident',
    })

    return {
      visual: {
        idea: concept.visualIdea,
        imagePrompt: concept.imagePrompt,
        platform: normalizedPlatform,
      },
      visualError: null,
    }
  } catch {
    return {
      visual: null,
      visualError: 'Visual generation failed. Refresh from post inside workspace to retry.',
    }
  }
}

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

  const { visual, visualError } = buildDraftVisual(draft.caption, draft.sourceMaterial, draft.platform)
  return NextResponse.json({ draft, visual, visualError })
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
  } catch {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
