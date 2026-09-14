import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { PostWorkspace } from '@/components/post-workspace'
import { redirect } from 'next/navigation'
import { generateVisualConcept } from '@/lib/writing/visual'

export const dynamic = 'force-dynamic'

export default async function DraftWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const draft = await store.getContentDraft(id)

  if (!draft) redirect('/content')

  const persona = await store.getContentPersona(draft.personaId)
  if (!persona) redirect('/content')

  const concept = generateVisualConcept({
    postText: draft.caption,
    platform: draft.platform as 'linkedin' | 'x',
    angle: draft.sourceMaterial,
    topic: draft.sourceMaterial,
    coreDetail: draft.caption.slice(0, 100),
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
