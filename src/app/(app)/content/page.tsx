import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { V3EmptyState, V3PageHeader } from '@/components/v3/primitives'
import { StudioHome, type StudioIdea, type StudioPersona } from '@/components/content-v3/studio-home'
import { canViewPersona } from '@/lib/content/persona-scope'

export const dynamic = 'force-dynamic'

/** Legacy dashboard import — kept so the old Content dashboard still compiles. */
export type DailyStatus = 'asked' | 'drafted' | 'posted' | 'none'

/**
 * Content → Studio. The daily creation workspace. The persona is resolved
 * before any brief/idea/memory fan-out, so opening Studio never loads every
 * persona's datasets.
 */
export default async function ContentStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ persona?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { persona: personaParam } = await searchParams
  const store = await createScoutStore()
  const personas = await store.listContentPersonas(user.rep.id)

  if (personas.length === 0) {
    return (
      <div className="space-y-6">
        <V3PageHeader title="Studio" subtitle="Your content workspace for today." />
        <V3EmptyState
          title="No content persona yet"
          body="Create a persona to generate today's brief, recommended post and alternates."
        >
          <Link href="/content/new" className="relay-cta text-[12px]">
            Create persona
          </Link>
        </V3EmptyState>
      </div>
    )
  }

  const persona = personas.find((p) => p.id === personaParam) ?? personas[0]
  if (!canViewPersona(persona, { repId: user.rep.id, role: user.rep.role })) redirect('/content')

  const localDate = new Date().toLocaleDateString('en-CA', { timeZone: user.rep.timezone ?? 'UTC' })
  const [bundle, memories, recentPosts] = await Promise.all([
    store.getDailyContentBriefWithIdeas(persona.id, localDate).catch(() => null),
    store.listContentMemories(persona.id, { limit: 20 }).catch(() => []),
    store.listContentHistory(persona.id, 10).catch(() => []),
  ])

  const toPersona = (p: typeof persona): StudioPersona => ({
    id: p.id,
    displayName: p.displayName,
    personaRole: p.personaRole ?? null,
    platforms: p.platforms,
  })

  const ideas: StudioIdea[] = (bundle?.ideas ?? []).map((idea) => ({
    id: idea.id,
    ideaType: idea.ideaType,
    title: idea.title,
    angle: idea.angle,
    whyNow: idea.whyNow,
    territory: idea.territory,
    trendGrounded: idea.trendGrounded,
    postCaption: idea.postCaption,
    postPlatform: idea.postPlatform,
    visualType: idea.visualType,
    visualConcept: idea.visualConcept,
    visualPrompt: idea.visualPrompt,
    visualReason: idea.visualReason,
    sourceFreshness: idea.sourceFreshness,
    formatSuggestion: idea.formatSuggestion,
    copiedAt: idea.copiedAt,
    postedAt: idea.postedAt,
  }))

  return (
    <StudioHome
      persona={toPersona(persona)}
      personas={personas.map(toPersona)}
      initialIdeas={ideas}
      memories={memories.map((m) => ({ memoryType: m.memoryType, content: m.content }))}
      recentPosts={recentPosts.map((h) => ({
        id: h.id,
        postedAt: h.postedAt,
        platform: h.platform,
        caption: h.openingLine,
        topic: h.openingLine,
      }))}
    />
  )
}
