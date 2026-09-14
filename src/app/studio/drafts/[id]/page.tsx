import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { PostWorkspace } from '@/components/post-workspace'
import { redirect } from 'next/navigation'

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

  // Load persona for layout
  const persona = await store.getContentPersona(draft.personaId)
  if (!persona) redirect('/content')

  return <PostWorkspace />
}
