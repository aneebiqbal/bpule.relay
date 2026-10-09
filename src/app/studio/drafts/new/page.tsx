import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { PostWorkspace } from '@/components/post-workspace'
import { redirect } from 'next/navigation'
import { generateVisualConcept } from '@/lib/writing/visual'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export default async function NewDraftPage({
  searchParams,
}: {
  searchParams: Promise<{ personaId?: string; ideaId?: string }>
}) {
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const personaId = params.personaId
  if (!personaId) redirect('/content')

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) redirect('/content')

  let initialCaption = ''
  let initialSourceMaterial = ''
  let ideaTitle = ''

  if (params.ideaId) {
    let idea = null
    try {
      idea = await store.getDailyContentIdeaById(params.ideaId)
    } catch { /* not in DB */ }

    // Fallback: read from sessionStorage (for ideas not yet persisted)
    if (!idea && typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(`studio-idea-${params.ideaId}`)
        if (stored) idea = JSON.parse(stored)
      } catch { /* sessionStorage unavailable */ }
    }

    if (idea) {
      initialCaption = idea.postCaption ?? ''
      initialSourceMaterial = idea.angle ?? idea.title
      ideaTitle = idea.title
    }
  }

  const draft = await store.createContentDraft({
    personaId: persona.id,
    sourceKind: 'idea',
    platform: 'linkedin',
    sourceMaterial: initialSourceMaterial,
    caption: initialCaption,
  })

  const concept = generateVisualConcept({
    postText: initialCaption || ideaTitle,
    platform: 'linkedin',
    angle: initialSourceMaterial,
    topic: initialSourceMaterial,
    coreDetail: initialCaption.slice(0, 100) || ideaTitle,
    tone: 'confident',
  })

  return (
    <PostWorkspace
      initialDraft={{
        id: draft.id,
        personaId: draft.personaId,
        caption: draft.caption,
        platform: draft.platform,
        status: draft.status,
        hookScore: draft.hookScore ?? 0,
        selfCheckPassed: draft.selfCheckPassed,
        sourceMaterial: draft.sourceMaterial,
      }}
      initialVisual={{ idea: concept.visualIdea, imagePrompt: concept.imagePrompt }}
    />
  )
}
