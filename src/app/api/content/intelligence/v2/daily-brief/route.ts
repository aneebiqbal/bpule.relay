import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import type { TrendRelevanceProfile } from '@/lib/trends/types'
import { rankTrendsForPersona } from '@/lib/trends/engine'
import { generateDailyBrief } from '@/lib/content/intelligence/v2/daily-brief-engine'
import type { ContentPersona, ContentProfile, DailyContentIdea } from '@/lib/domain/types'
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
  if (existing && existing.ideas.length > 0) {
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

    try {
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

      // If AI produced 0 ideas, treat as failure to trigger fallback
      if (!result.ideas || result.ideas.length === 0) {
        throw new Error('AI returned 0 ideas')
      }

      return NextResponse.json({ brief: result.brief, ideas: result.ideas, cost: result.cost })
    } catch (aiErr) {
      console.error('[daily-brief] AI generation failed:', aiErr instanceof Error ? aiErr.message : String(aiErr))
      // AI providers failed — fall back to deterministic brief from trends + profile
      try {
        const fallbackIdeas = generateFallbackIdeas(profile, trendCandidates, persona)
        const brief = await store.createDailyContentBrief({
          organizationId: persona.organizationId,
          personaId: persona.id,
          localDate,
          promptVersion: 'fallback-v1',
          trendSnapshot: { source: 'fallback', count: fallbackIdeas.length },
        })

        const ideaRecords: DailyContentIdea[] = []
        for (let i = 0; i < fallbackIdeas.length; i++) {
          const idea = fallbackIdeas[i]
          try {
            const record = await store.createDailyContentIdea({
              briefId: brief.id,
              organizationId: persona.organizationId,
              personaId: persona.id,
              ideaType: i === 0 ? 'recommended' : 'alternate',
              title: idea.title,
              angle: idea.angle,
              whyNow: idea.whyNow,
              territory: idea.territory,
              trendGrounded: idea.trendGrounded,
              formatSuggestion: idea.formatSuggestion,
            })
            ideaRecords.push(record)
          } catch (ideaErr) {
            console.error('[daily-brief] Failed to create fallback idea:', ideaErr instanceof Error ? ideaErr.message : String(ideaErr))
          }
        }

        if (ideaRecords.length === 0) {
          throw new Error('All fallback ideas failed to save')
        }

        if (ideaRecords[0]) {
          await store.updateDailyContentBriefRecommended(brief.id, ideaRecords[0].id)
        }
        await store.updateDailyContentBriefStatus(brief.id, 'ready')

        return NextResponse.json({ brief, ideas: ideaRecords, fromFallback: true })
      } catch (fallbackErr) {
        console.error('[daily-brief] Fallback also failed:', fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr))
        // Last resort: return ideas directly without persisting
        const emergencyIdeas = generateFallbackIdeas(profile, trendCandidates, persona).map((idea, i) => ({
          id: `emergency-${Date.now()}-${i}`,
          briefId: 'emergency',
          organizationId: persona.organizationId,
          personaId: persona.id,
          ideaType: i === 0 ? 'recommended' : 'alternate',
          title: idea.title,
          angle: idea.angle,
          whyNow: idea.whyNow,
          territory: idea.territory,
          trendGrounded: idea.trendGrounded,
          formatSuggestion: idea.formatSuggestion,
          postCaption: idea.angle,
          createdAt: new Date().toISOString(),
        }))
        return NextResponse.json({ brief: { id: 'emergency', status: 'ready', localDate }, ideas: emergencyIdeas, fromFallback: true })
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Generation failed', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

interface FallbackIdea {
  title: string
  angle: string
  whyNow: string
  territory?: string
  trendGrounded: boolean
  formatSuggestion?: string
}

function generateFallbackIdeas(
  profile: ContentProfile | null,
  trendCandidates: import('@/lib/trends/types').TrendCandidate[],
  persona: ContentPersona,
): FallbackIdea[] {
  const ideas: FallbackIdea[] = []
  const territories = profile?.territories ?? []
  const expertise = (profile?.expertise ?? []).map(e => e.area).filter(Boolean)

  // 1. Top trend-grounded ideas (max 2)
  for (const candidate of trendCandidates.slice(0, 2)) {
    ideas.push({
      title: `What "${candidate.item.title}" means for ${expertise[0] ?? 'your work'}`,
      angle: `A current development relevant to ${persona.personaRole ?? 'your role'}. Consider what this means for your audience.`,
      whyNow: candidate.whyNow,
      territory: territories[0],
      trendGrounded: true,
      formatSuggestion: 'observation',
    })
  }

  // 2. Expertise-based ideas
  for (const area of expertise.slice(0, 2)) {
    ideas.push({
      title: `A lesson from ${area}`,
      angle: `Share a specific insight or lesson from your experience in ${area}. What would you tell someone starting out?`,
      whyNow: 'Evergreen expertise',
      territory: area,
      trendGrounded: false,
      formatSuggestion: 'practical_lesson',
    })
  }

  // 3. Territory wildcards
  for (const territory of territories.slice(0, 2)) {
    if (ideas.length >= 5) break
    ideas.push({
      title: `Why ${territory} matters more than people think`,
      angle: `An opinion or contrarian take on ${territory} that challenges common assumptions.`,
      whyNow: 'Evergreen territory',
      territory,
      trendGrounded: false,
      formatSuggestion: 'opinion',
    })
  }

  // Ensure at least 3 ideas
  if (ideas.length === 0) {
    ideas.push(
      { title: `A thought on ${expertise[0] ?? 'your work'}`, angle: 'Share a specific insight from your experience today.', whyNow: 'Evergreen', trendGrounded: false, formatSuggestion: 'observation' },
      { title: `What's changing in ${territories[0] ?? 'your field'}`, angle: 'An observation about a current development.', whyNow: 'Evergreen', trendGrounded: false, formatSuggestion: 'observation' },
      { title: `A lesson worth sharing`, angle: 'Share a practical lesson from your work.', whyNow: 'Evergreen', trendGrounded: false, formatSuggestion: 'practical_lesson' },
    )
  }

  return ideas.slice(0, 5)
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
