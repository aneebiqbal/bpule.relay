import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import type { TrendRelevanceProfile } from '@/lib/trends/types'
import { rankTrendsForPersona } from '@/lib/trends/engine'
import { generate } from '@/lib/ai/runtime'
import type { ContentPersona, ContentProfile, DailyContentIdea, VisualType } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

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

    // Generate full post caption for the new idea
    const personaContext = buildPersonaContextString(persona, profile)
    const trendSignals = trendCandidates.slice(0, 5).map(c => `- ${c.item.title} (${c.whyNow})`).join('\n')

    const postCaption = await generateFinishedPost({
      title: idea.title,
      angle: idea.angle,
      territory: idea.territory,
      format: idea.formatSuggestion,
      personaContext,
      trendSignals: trendSignals || 'No strong trends — draw from expertise',
    })

    const latestBrief = await store.getLatestDailyContentBrief(personaId)

    const ideaRecord = await store.createDailyContentIdea({
      briefId: latestBrief?.id ?? '00000000-0000-0000-0000-000000000000',
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
      postCaption: postCaption,
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
    promptVersion: 'studio-new-idea-v2',
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

async function generateFinishedPost(input: {
  title: string
  angle: string
  territory?: string
  format?: string
  personaContext: string
  trendSignals: string
}): Promise<string> {
  const system = `You write LinkedIn posts for a practitioner. The post must look and read like a real LinkedIn post — NOT a blog article.

CRITICAL FORMATTING:
- Use DOUBLE NEWLINES between paragraphs. Each paragraph is 1-2 short sentences MAX.
- Short paragraphs create white space. Walls of text get scrolled past.
- Output MUST have 3-5 paragraphs separated by blank lines.

THE HOOK (first line):
- One short sentence. Bold claim, surprising number, or provocative question.
- GOOD: "We deleted half our K8s cluster. Costs dropped 40%." / "I reviewed 50 postmortems. 43 had the same root cause."
- BAD: "I've been thinking about..." / "Here's why X matters"

BODY:
- 150-200 words total. 3-5 short paragraphs.
- Lead with specifics: a number, a tool name, a mistake, a timeline.
- End with a genuine question that invites replies (not "Thoughts?").

AVOID: No em dashes, no listicles, no filler phrases, no fabricated metrics.
TONE: Senior engineer explaining to a peer. Direct, specific, confident.

Output ONLY the post text with double newlines between paragraphs.`

  const user = JSON.stringify({
    persona: input.personaContext,
    idea: { title: input.title, angle: input.angle, territory: input.territory, format: input.format },
    sources: input.trendSignals,
  })

  const result = await generate<string>({
    task: 'DEEP_WRITING',
    system,
    user,
    maxTokens: 500,
    promptVersion: 'studio-idea-post-v1',
    callSite: 'studio:generatePost',
    feature: 'studio_v2',
  })

  return cleanPost(result.data)
}

function cleanPost(raw: string): string {
  let text = raw.trim()
  text = text.replace(/—|–/g, '-')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/\.\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`)
  text = text.split('\n\n').map(p => p.trim()).filter(Boolean).join('\n\n')
  const words = text.split(/\s+/)
  if (words.length > 250) {
    text = words.slice(0, 250).join(' ')
    const lastPeriod = text.lastIndexOf('.')
    if (lastPeriod > text.length * 0.7) text = text.slice(0, lastPeriod + 1)
  }
  text = text.replace(/\s*(Thoughts\?|Agree\?|What do you think\?|Let that sink in\.?)\s*$/i, '')
  return text.trim()
}

function buildPersonaContextString(persona: ContentPersona, profile: ContentProfile | null): string {
  const parts: string[] = []
  if (profile?.role) parts.push(`Role: ${profile.role}`)
  if (profile?.seniority) parts.push(`Seniority: ${profile.seniority}`)
  if (profile?.industries?.length) parts.push(`Industries: ${profile.industries.join(', ')}`)
  if (profile?.audience) parts.push(`Audience: ${profile.audience}`)
  if (profile?.expertise?.length) {
    const top = profile.expertise.sort((a, b) => (b.level === 'expert' ? 1 : 0) - (a.level === 'expert' ? 1 : 0)).slice(0, 5).map(e => e.area)
    parts.push(`Expertise: ${top.join(', ')}`)
  }
  if (profile?.opinions?.length) {
    const strong = profile.opinions.filter(o => o.strength === 'strong').slice(0, 3).map(o => o.belief)
    if (strong.length) parts.push(`Strong opinions: ${strong.join('; ')}`)
  }
  return parts.join('\n')
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
