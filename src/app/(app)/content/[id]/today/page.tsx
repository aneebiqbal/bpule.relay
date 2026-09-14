import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioToday } from '@/components/studio-today'
import { StudioQuickCapture } from '@/components/studio-quick-capture'
import { StudioLayout } from '@/components/studio-layout'
import { generateDailyIdeas } from '@/lib/content/daily-ideas'
import type { QuickCaptureAngle } from '@/lib/domain/types'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function StudioTodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const store = await createScoutStore()
  const persona = await store.getContentPersona(id)
  if (!persona) redirect('/content')
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    redirect('/content')
  }

  const profile = persona.contentProfileId ? await store.getContentProfile(persona.contentProfileId) : null
  const clusters = await store.listTopicClusters(id)
  const history = await store.listContentHistory(id, 30)
  const memories = await store.listContentMemories(id, { limit: 50 })
  const journey = await store.listContentJourney?.(id, 30) ?? []

  const ideas = generateDailyIdeas({
    profile,
    clusters,
    history,
    memories,
    journey,
    contentGoals: profile?.contentGoals ?? [],
    audiences: profile?.audiences ?? [],
    territories: profile?.territories ?? [],
  })

  const pick = ideas[0] ?? null
  const alternatives = ideas.slice(1, 4)

  const handleAngleSelect = (_angle: QuickCaptureAngle) => {
    // Client-side navigation handled in StudioQuickCapture component
  }

  return (
    <StudioLayout persona={persona}>
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <StudioToday
          persona={persona}
          initialPick={pick}
          initialAlternatives={alternatives}
        />

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-graphite">
            Quick Capture
          </h2>
          <StudioQuickCapture
            personaId={id}
            onSelectAngle={handleAngleSelect}
          />
        </section>
      </div>
    </StudioLayout>
  )
}
