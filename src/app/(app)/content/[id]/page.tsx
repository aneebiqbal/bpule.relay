import { notFound } from 'next/navigation'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { PersonaWorkspace } from '@/components/persona-workspace'
import { buildDailyDecision } from '@/lib/content/daily-decision'

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

  const topicClusters = await store.listTopicClusters(id)
  const drafts = await store.listContentDrafts(id)
  const history = await store.listContentHistory(id, 10)
  const findings = await store.listResearchFindings(id, { unusedOnly: true, limit: 10 })
  const feedback = await store.listContentDraftFeedback(id, 100)
  const generatedToday = await store.countContentDraftsToday(id)
  const initialDecision = buildDailyDecision({ persona, clusters: topicClusters, findings, feedback, generatedToday })

  return (
    <PersonaWorkspace
      persona={persona}
      topicClusters={topicClusters}
      drafts={drafts}
      history={history}
      feedback={feedback}
      initialDecision={initialDecision}
    />
  )
}
