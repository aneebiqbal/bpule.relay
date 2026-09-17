import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { StudioToday } from '@/components/studio-today'
import { StudioLayout } from '@/components/studio-layout'
import { generateDailyIdeas } from '@/lib/content/daily-ideas'
import type { ContentHistoryEntry } from '@/lib/domain/types'
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
  const [clusters, history, memories, journey, drafts, captures] = await Promise.all([
    store.listTopicClusters(id),
    store.listContentHistory(id, 60),
    store.listContentMemories(id, { limit: 50 }),
    store.listContentJourney?.(id, 50) ?? Promise.resolve([]),
    store.listContentDrafts(id),
    store.listContentQuickCaptures(id, 50),
  ])

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

  const knownFor = [
    ...(profile?.expertise.map((item) => item.area) ?? []),
    ...(profile?.technologies.map((item) => item.name) ?? []),
  ].filter(Boolean).slice(0, 4)
  const territories = (profile?.territories ?? []).slice(0, 5)
  const audience = (profile?.audiences ?? (profile?.audience ? [profile.audience] : [])).slice(0, 4)

  const recentlyUsed = history[0]
    ? `${inferTerritory(history[0], territories)} · ${daysAgo(history[0].postedAt)} day${daysAgo(history[0].postedAt) === 1 ? '' : 's'} ago`
    : 'Nothing posted recently'

  const underused = inferUnderusedTerritory(territories, history)

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const thisWeekHistory = history.filter((entry) => now - new Date(entry.postedAt).getTime() <= sevenDaysMs)
  const thisWeekDrafts = drafts.filter((draft) => now - new Date(draft.createdAt).getTime() <= sevenDaysMs)
  const thisWeekCaptures = captures.filter((capture) => now - new Date(capture.createdAt).getTime() <= sevenDaysMs)

  const territoryCounts = new Map<string, number>()
  for (const territory of territories) {
    territoryCounts.set(territory, 0)
  }
  for (const entry of thisWeekHistory) {
    const matched = inferTerritory(entry, territories)
    territoryCounts.set(matched, (territoryCounts.get(matched) ?? 0) + 1)
  }

  const territoryTotal = Array.from(territoryCounts.values()).reduce((sum, count) => sum + count, 0)
  const territoryBalance = Array.from(territoryCounts.entries())
    .slice(0, 3)
    .map(([name, count]) => ({
      name,
      weight: territoryTotal > 0 ? Math.max(8, Math.round((count / territoryTotal) * 100)) : 8,
    }))

  const topTerritory = [...territoryBalance].sort((a, b) => b.weight - a.weight)[0]
  const weeklyInsight = topTerritory && topTerritory.weight >= 55
    ? `You have leaned into ${topTerritory.name} lately. Studio will explore a fresher territory tomorrow.`
    : 'Your territory mix looks balanced. Studio will keep introducing new directions.'

  const latestJourney = journey[0] ?? null
  const journeySuggestion = latestJourney
    ? {
        title: `This week: ${latestJourney.title}`,
        detail: 'Relay suggests this could become a post about how the work changed your perspective.',
      }
    : null

  // Sanitize persona for Client Components (ensure serializable)
  const safePersona = JSON.parse(JSON.stringify(persona)) as typeof persona

  return (
    <StudioLayout persona={safePersona}>
      <div className="mx-auto max-w-5xl space-y-8 px-1 py-1">
        <StudioToday
          key={`${id}:${pick?.id ?? 'none'}:${alternatives.map((idea) => idea.id).join(',')}`}
          persona={safePersona}
          initialPick={pick}
          initialAlternatives={alternatives}
          identitySummary={{
            knownFor,
            territories,
            audience,
            recentlyUsed,
            underused,
          }}
          journeySuggestion={journeySuggestion}
          weeklyMomentum={{
            ideasExplored: Math.max(ideas.length, thisWeekCaptures.length + 1),
            draftsCreated: thisWeekDrafts.length,
            published: thisWeekHistory.length,
            territoryBalance,
            insight: weeklyInsight,
          }}
        />
      </div>
    </StudioLayout>
  )
}

function inferTerritory(entry: ContentHistoryEntry, territories: string[]): string {
  const source = entry.openingLine.toLowerCase()
  const match = territories.find((territory) => source.includes(territory.toLowerCase()))
  return match ?? territories[0] ?? 'General insight'
}

function inferUnderusedTerritory(territories: string[], history: ContentHistoryEntry[]): string {
  if (territories.length === 0) return 'No mapped territories yet'

  let winner = territories[0]
  let maxDays = -1

  for (const territory of territories) {
    const lastMatch = history.find((entry) => entry.openingLine.toLowerCase().includes(territory.toLowerCase()))
    const age = lastMatch ? daysAgo(lastMatch.postedAt) : 30
    if (age > maxDays) {
      winner = territory
      maxDays = age
    }
  }

  return `${winner} · ${maxDays} day${maxDays === 1 ? '' : 's'}`
}

function daysAgo(isoDate: string): number {
  const diff = Date.now() - new Date(isoDate).getTime()
  return Math.max(0, Math.round(diff / (24 * 60 * 60 * 1000)))
}
