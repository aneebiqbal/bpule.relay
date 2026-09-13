import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { ContentDashboard } from '@/components/content-dashboard'
import type { ContentPersona, ContentPillar, ContentDraft } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'

interface PersonaWithExtras extends ContentPersona {
  pillars: ContentPillar[]
  drafts: ContentDraft[]
}

export default async function ContentPage() {
  const user = await getCurrentUser()
  if (!user) return null

  let personas: PersonaWithExtras[] = []

  try {
    const store = await createScoutStore()
    const base = await store.listContentPersonas(user.rep.id)
    const resolved = await Promise.all(
      base.map(async (p) => ({
        ...p,
        pillars: await store.listContentPillars(p.id),
        drafts: await store.listContentDrafts(p.id),
      })),
    )
    personas = resolved
  } catch {
    // Migration 0018 not yet applied — render empty state
  }

  return <ContentDashboard personas={personas} />
}
