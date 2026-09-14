import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioToday } from '@/components/studio-today'
import { StudioQuickCapture } from '@/components/studio-quick-capture'
import { generateDailyIdeas } from '@/lib/content/daily-ideas'
import { QuickCaptureAngle } from '@/lib/domain/types'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function StudioTodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return null

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

  const handleAngleSelect = (angle: QuickCaptureAngle) => {
    redirect(`/content/${id}?action=write&title=${encodeURIComponent(angle.title)}&angle=${encodeURIComponent(angle.angle)}`)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
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
  )
}
