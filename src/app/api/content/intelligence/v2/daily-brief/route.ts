import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import type { TrendRelevanceProfile } from '@/lib/trends/types'
import { rankTrendsForPersona } from '@/lib/trends/engine'
import { generateDailyBrief } from '@/lib/content/intelligence/v2/daily-brief-engine'
import type { ContentPersona, ContentProfile } from '@/lib/domain/types'
import type { ScoutStore } from '@/lib/store/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getLocalDate(timezone: string): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const url = new URL(request.url)
  const personaId = url.searchParams.get('personaId')
  if (!personaId) return NextResponse.json({ error: 'personaId required' }, { status: 400 })

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const localDate = getLocalDate(user.rep.timezone ?? 'UTC')

  const existing = await store.getDailyContentBriefWithIdeas(personaId, localDate)
  if (existing && existing.brief.status === 'ready') {
    return NextResponse.json({ brief: existing.brief, ideas: existing.ideas, fromCache: true })
  }

  return generateAndRespond(store, persona, localDate, user.rep.timezone ?? 'UTC')
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const personaId = body.personaId as string
  if (!personaId) return NextResponse.json({ error: 'personaId required' }, { status: 400 })

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const localDate = getLocalDate(user.rep.timezone ?? 'UTC')
  return generateAndRespond(store, persona, localDate, user.rep.timezone ?? 'UTC')
}

async function generateAndRespond(
  store: ScoutStore,
  persona: ContentPersona,
  localDate: string,
  timezone: string,
) {
  try {
    const profile: ContentProfile | null = persona.contentProfileId
      ? await store.getContentProfile(persona.contentProfileId)
      : null

    const memories = await store.listContentMemories(persona.id, { limit: 30 })
    const tasteProfile = await store.getTasteProfile(persona.id)

    const trendInterest: TrendRelevanceProfile = persona.trendInterestProfile
      ? {
          primaryTerritories: persona.trendInterestProfile.primaryTerritories,
          secondaryTerritories: persona.trendInterestProfile.secondaryTerritories,
          technologies: persona.trendInterestProfile.technologies,
          industries: persona.trendInterestProfile.industries,
          excludedTerritories: persona.trendInterestProfile.excludedTerritories,
        }
      : inferTrendInterestFromProfile(profile)

    const trendItems = await store.listTrendItems({ limit: 100 })
    const recentIdeas = await getRecentIdeas(store, persona.id)
    const trendCandidates = rankTrendsForPersona(trendItems, trendInterest, {
      recentlyCoveredTopics: extractRecentTopics(memories),
      recentlyUsedAngles: recentIdeas.map(i => i.angle),
      explorationRatio: 0.25,
    })

    const result = await generateDailyBrief(store, {
      persona,
      profile: profile ?? {
        id: '',
        organizationId: persona.organizationId,
        personaId: persona.id,
        confidence: 0,
      } as ContentProfile,
      tasteProfile,
      memories,
      trendCandidates,
      recentIdeas,
      localDate,
      timezone,
    })

    return NextResponse.json({ brief: result.brief, ideas: result.ideas, cost: result.cost })
  } catch (err) {
    return NextResponse.json(
      { error: 'Generation failed', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

function inferTrendInterestFromProfile(profile: ContentProfile | null): TrendRelevanceProfile {
  return {
    primaryTerritories: profile?.territories?.slice(0, 5) ?? [],
    secondaryTerritories: profile?.audiences ?? [],
    technologies: (profile?.technologies ?? []).map(t => (typeof t === 'object' && 'name' in t ? t.name : String(t))).slice(0, 10),
    industries: profile?.industries ?? [],
    excludedTerritories: (profile?.topicsAvoided ?? []).map(t => (typeof t === 'object' && 'topic' in t ? t.topic : String(t))).slice(0, 5),
  }
}

function extractRecentTopics(memories: { memoryType: string; content: string }[]): string[] {
  return memories
    .filter(m => m.memoryType === 'topic_covered')
    .slice(0, 15)
    .map(m => m.content.toLowerCase())
}

async function getRecentIdeas(
  store: ScoutStore,
  personaId: string,
): Promise<Array<{ title: string; territory: string; angle: string }>> {
  const latestBrief = await store.getLatestDailyContentBrief(personaId)
  if (!latestBrief) return []
  const ideas = await store.listDailyContentIdeas(latestBrief.id)
  return ideas.map(i => ({ title: i.title, territory: i.territory ?? '', angle: i.angle ?? '' }))
}
