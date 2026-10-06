import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import type { TrendRelevanceProfile } from '@/lib/trends/types'
import { rankTrendsForPersona } from '@/lib/trends/engine'
import { generate } from '@/lib/ai/runtime'
import type { ContentPersona, ContentProfile, DailyContentIdea, VisualType } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
  const personaId = body.personaId as string
  const excludeIdeas = (body.excludeIdeas ?? []) as Array<{ title: string; territory: string; angle: string }>
  if (!personaId) return NextResponse.json({ error: 'personaId required' }, { status: 400 })

  const store = await createScoutStore()
  const persona = await store.getContentPersona(personaId)
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })
  if (persona.repId !== user.rep.id && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const profile: ContentProfile | null = persona.contentProfileId
    ? await store.getContentProfile(persona.contentProfileId)
    : null

  const trendInterest: TrendRelevanceProfile = persona.trendInterestProfile
    ? {
        primaryTerritories: persona.trendInterestProfile.primaryTerritories,
        secondaryTerritories: persona.trendInterestProfile.secondaryTerritories,
        technologies: persona.trendInterestProfile.technologies,
        industries: persona.trendInterestProfile.industries,
        excludedTerritories: persona.trendInterestProfile.excludedTerritories,
      }
    : inferTrendInterestFromProfile(profile)

  const trendItems = await store.listTrendItems({ limit: 50 })
  const trendCandidates = rankTrendsForPersona(trendItems, trendInterest, {
    recentlyCoveredTopics: excludeIdeas.map(i => i.title.toLowerCase()),
    recentlyUsedAngles: excludeIdeas.map(i => i.angle),
  })

  const excludeTitles = excludeIdeas.map(i => i.title).join('\n')

  try {
    const idea = await generateSingleIdea(persona, profile, trendCandidates, excludeTitles)

    const latestBrief = await store.getLatestDailyContentBrief(personaId)
    const briefId = latestBrief?.id ?? ''

    const ideaRecord = await store.createDailyContentIdea({
      briefId,
      organizationId: persona.organizationId,
      personaId: persona.id,
      ideaType: 'alternate',
      title: idea.title,
      angle: idea.angle,
      whyNow: idea.whyNow,
      territory: idea.territory,
      trendGrounded: idea.trendGrounded,
      formatSuggestion: idea.formatSuggestion,
      noveltyScore: idea.novelty,
      relevanceScore: idea.relevance,
      credibilityScore: idea.credibility,
      insightScore: idea.insight,
      visualType: idea.visualType,
      visualConcept: idea.visualConcept,
      visualPrompt: idea.visualPrompt,
      visualReason: idea.visualReason,
    })

    return NextResponse.json({ idea: ideaRecord })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to generate idea', message: err instanceof Error ? err.message : 'Unknown' },
      { status: 503 },
    )
  }
}

async function generateSingleIdea(
  persona: ContentPersona,
  profile: ContentProfile | null,
  trendCandidates: import('@/lib/trends/types').TrendCandidate[],
  excludeTitles: string,
) {
  const role = profile?.role ?? persona.personaRole ?? 'your role'
  const territories = profile?.territories ?? []
  const expertise = (profile?.expertise ?? []).map(e => e.area).filter(Boolean)
  const opinions = (profile?.opinions ?? []).filter(o => o.strength === 'strong').map(o => o.belief)
  const trendSignals = trendCandidates.slice(0, 5).map(c => `- ${c.item.title} (${c.whyNow})`).join('\n')

  const system = `You are an editorial strategist. Generate ONE specific, non-generic LinkedIn post idea for a ${role}.

RULES:
- Must be specific, not generic. Avoid "A lesson from X", "A thought on X", "Why X matters".
- Prefer: specific observation, strong opinion, counterintuitive insight, first-hand lesson, trend interpretation.
- Mix: 60% evergreen expertise, 40% trend-grounded.
- Do NOT repeat or closely resemble any excluded ideas listed below.
- Output ONLY JSON: {"title": "short specific title", "angle": "1-2 sentence insight", "whyNow": "reason", "territory": "topic area", "trendGrounded": true/false, "formatSuggestion": "observation|opinion|lesson|prediction|case_study", "novelty": 0-1, "relevance": 0-1, "credibility": 0-1, "insight": 0-1}

AVOID THESE (do not repeat):
${excludeTitles || 'No exclusions'}

VISUAL: Also include: {"visualType": "PRODUCT_SCREENSHOT|EDITORIAL_GRAPHIC|TECHNICAL_DIAGRAM|TYPOGRAPHIC_CONCEPT|DATA_VISUAL|GENERATED_IMAGE|NO_VISUAL", "visualConcept": "one sentence", "visualPrompt": "specific prompt, 1.91:1, no text, no faces, no logos", "visualReason": "why this fits"}

Combine into one JSON: {...idea fields..., ...visual fields...}

AVOID in visual: robots, glowing brains, stock photos, 3D spheres, floating code, generic AI art.`

  const user = JSON.stringify({
    role,
    territories: territories.slice(0, 5),
    expertise: expertise.slice(0, 5),
    opinions: opinions.slice(0, 3),
    trendSignals: trendSignals || 'No strong trends — use evergreen territory',
  })

  const result = await generate<{
    title: string
    angle: string
    whyNow: string
    territory: string
    trendGrounded: boolean
    formatSuggestion: string
    novelty: number
    relevance: number
    credibility: number
    insight: number
    visualType: VisualType
    visualConcept: string
    visualPrompt: string
    visualReason: string
  }>({
    task: 'FAST_STRUCTURED',
    system,
    user,
    promptVersion: 'studio-new-idea-v1',
    callSite: 'studio:newIdea',
    feature: 'studio_v2',
  })

  return {
    title: result.data.title,
    angle: result.data.angle,
    whyNow: result.data.whyNow,
    territory: result.data.territory,
    trendGrounded: result.data.trendGrounded,
    formatSuggestion: result.data.formatSuggestion,
    novelty: result.data.novelty ?? 0.8,
    relevance: result.data.relevance ?? 0.85,
    credibility: result.data.credibility ?? 0.75,
    insight: result.data.insight ?? 0.8,
    visualType: result.data.visualType,
    visualConcept: result.data.visualConcept,
    visualPrompt: result.data.visualPrompt,
    visualReason: result.data.visualReason,
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
