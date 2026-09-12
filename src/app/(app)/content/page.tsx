import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { ContentDashboard } from '@/components/content-dashboard'

export const dynamic = 'force-dynamic'

export default async function ContentPage() {
  const user = await getCurrentUser()
  if (!user) return null

  const store = await createScoutStore()
  const personas = await store.listContentPersonas(user.rep.id)

  const personasWithPillars = await Promise.all(
    personas.map(async (p) => ({
      ...p,
      pillars: await store.listContentPillars(p.id),
      drafts: await store.listContentDrafts(p.id),
    })),
  )

  return <ContentDashboard personas={personasWithPillars} />
}
