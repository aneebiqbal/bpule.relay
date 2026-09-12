import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { PersonaWorkspace } from '@/components/persona-workspace'

export const dynamic = 'force-dynamic'

export default async function PersonaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) notFound()

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) notFound()

  // Verify ownership
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') notFound()

  const pillars = await store.listContentPillars(id)
  const drafts = await store.listContentDrafts(id)
  const history = await store.listContentHistory(id, 10)

  return (
    <PersonaWorkspace
      persona={persona}
      pillars={pillars}
      drafts={drafts}
      history={history}
    />
  )
}
