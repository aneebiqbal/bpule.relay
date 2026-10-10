import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import type { TrendRelevanceProfile } from '@/lib/trends/types'
import { rankTrendsForPersona } from '@/lib/trends/engine'
import { generate } from '@/lib/ai/runtime'
import type { ContentPersona, ContentProfile, DailyContentIdea, VisualType } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'
 export const runtime = 'nodejs'
 export const maxDuration = 90

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json()
   const personaId = body.personaId as string
   const excludeIdeas = (body.excludeIdeas ?? []) as Array<{ title: string; territory: string; angle: string }>
   if (!personaId) return NextResponse.json({ error: 'personaId required' }, { status: 400 })
   const platform = (body.platform === 'x' ? 'x' : 'linkedin') as 'linkedin' | 'x'

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

     const personaContext = buildPersonaContextString(persona, profile)
     const trendSignals = trendCandidates.slice(0, 5).map(c => `- ${c.item.title} (${c.whyNow})`).join('\n')

     let postCaption: string | null = null
     try {
       postCaption = await generateFinishedPost({
         title: idea.title,
         angle: idea.angle,
         territory: idea.territory,
         format: idea.formatSuggestion,
         personaContext,
         trendSignals: trendSignals || 'No strong trends — draw from expertise',
         platform,
       })
     } catch {
       // AI generation failed — use angle as fallback caption
       postCaption = idea.angle || idea.title
     }

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
     const message = err instanceof Error ? err.message : (err && typeof err === 'object' ? JSON.stringify(err) : String(err))
     const stack = err instanceof Error ? err.stack : 'no stack'
     console.error('[daily-brief/idea] Failed:', message, '\nStack:', stack)
     return NextResponse.json(
       { error: 'Failed to generate idea', message },
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
   platform: 'linkedin' | 'x'
 }): Promise<string> {
   const system = input.platform === 'x'
     ? `You write sharp, quotable posts for X (Twitter) by senior tech practitioners.

WRITING RULES:
- One post. No threads unless the idea genuinely requires 2-3 posts to land.
- Lead with the opinion, the number, or the contrarian take. No throat-clearing.
- Compress. Every word must earn its place.
- Sound like a smart person talking — not a brand, not a newsletter.
- Timeliness matters. If a trend is referenced, make it clear why it matters now.
- End with a punchline, a question, or nothing. Never "Thoughts?" or "Agree?".

HARD RULES:
- NO em dashes. Use commas or periods.
- NO filler: "In today's fast-paced...", "Here's the thing", "Let that sink in".
- NO listicles, no numbered tips, no "here are X things".
- NO hashtags, NO emojis, NO exclamation marks.
- Max 280 characters for single posts.
- Never fabricate numbers, metrics, or named examples.

TONE: Confident. Specific. Human. Senior engineer sharing a real insight.

Output ONLY the post text. No JSON, no intro.`
     : `You are a LinkedIn ghostwriter for senior tech practitioners. Write a post that STOPS the scroll.

FORMATTING (NON-NEGOTIABLE):
Output EXACTLY this structure, where each [paragraph] is 1-2 short sentences separated by a blank line:

[HOOK: One line. Bold claim, surprising number, or short story. This is all people see before "see more".]

[Context: 1-2 sentences. Set the scene with a specific detail — a number, tool, mistake, or timeline.]

[Insight: 1-2 sentences. The counterintuitive take or lesson. Why this matters.]

[Action: 1-2 sentences. What you did about it or what the reader should consider.]

[Question: One line. Genuine question that invites comments. NOT "Thoughts?" or "Agree?".]

EXAMPLE OUTPUT FORMAT:
We deleted half our Kubernetes cluster on a Tuesday. Costs dropped 40% that week.

It started when I noticed we were running 3 nodes for a service that peaked at 200 requests per minute. Nobody had reviewed the autoscaling config in 8 months.

The counterintuitive part: adding more nodes was making it worse. Each new node added latency from cross-zone networking. We were paying more to go slower.

I set a rule now: every service gets a monthly cost-to-traffic review. If the ratio drifts, we scale down before scaling up.

When did you last check if your infrastructure matches your actual traffic?

RULES:
- NO em dashes. Use commas or periods only.
- NO listicles, no numbered lists, no "here are X tips".
- NO filler phrases: "Here's the thing", "Let that sink in", "Game changer".
- 120-180 words total.
- Specific details only. Real tools, real numbers, real situations.
- NO hashtags, NO emojis, NO exclamation marks.

TONE: Like a senior engineer explaining something to a peer over coffee. Direct, specific, no corporate speak.`

   const user = JSON.stringify({
     persona: input.personaContext,
     idea: { title: input.title, angle: input.angle, territory: input.territory, format: input.format },
     sources: input.trendSignals,
   })

   const result = await generate<string>({
     task: 'DEEP_WRITING',
     system,
     user,
     maxTokens: input.platform === 'x' ? 300 : 500,
     promptVersion: input.platform === 'x' ? 'studio-idea-x-v1' : 'studio-idea-post-v1',
     callSite: 'studio:generatePost',
     feature: input.platform === 'x' ? 'studio_v2_x' : 'studio_v2',
   })

   return input.platform === 'x' ? cleanXPost(result.data) : cleanPost(result.data)
 }

 function cleanXPost(raw: string): string {
   let text = raw.trim()
   text = text.replace(/[\u2014\u2013\u2015\uFE58\uFF0D\u2500\u2212\u2E3A\u2E3B]/g, ' ')
   text = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
   text = text.replace(/[\u{1F600}-\u{1F64F}]/gu, '')
   text = text.replace(/[\u{2600}-\u{26FF}]/gu, '')
   text = text.replace(/#[a-zA-Z][a-zA-Z0-9]*/g, '')
   text = text.replace(/\s*(Thoughts\?|Agree\?|Let that sink in\.?)\s*$/i, '')
   text = text.replace(/\s{2,}/g, ' ').trim()
   if (text.length > 280) {
     const lastPeriod = text.lastIndexOf('.', 277)
     text = lastPeriod > 200 ? text.slice(0, lastPeriod + 1) : text.slice(0, 277) + '...'
   }
   return text.trim()
 }

function cleanPost(raw: string): string {
  let text = raw.trim()

  text = text.replace(/[\u2014\u2013\u2015\uFE58\uFF0D\u2500\u2212\u2E3A\u2E3B]/g, ' ')
  text = text.replace(/\s{2,}/g, ' ')

  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/\r\n/g, '\n')

  // Fix broken sentences within paragraphs
  text = text.replace(/\.\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`)

  const paragraphs = text.split('\n\n').map(p => p.trim()).filter(Boolean)

  if (paragraphs.length < 2) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
    const chunks: string[] = []
    let current = ''
    for (const s of sentences) {
      if (current.split(/[.!?]+/).length > 2 && current.trim()) {
        chunks.push(current.trim())
        current = s.trim()
      } else {
        current = current ? `${current} ${s.trim()}` : s.trim()
      }
    }
    if (current.trim()) chunks.push(current.trim())
    if (chunks.length > 1) return chunks.join('\n\n')
  }

  const fullText = paragraphs.join('\n\n')
  const words = fullText.split(/\s+/)
  if (words.length > 200) {
    let trimmed = words.slice(0, 200).join(' ')
    const lastPeriod = trimmed.lastIndexOf('.')
    if (lastPeriod > trimmed.length * 0.7) trimmed = trimmed.slice(0, lastPeriod + 1)
    return trimmed
  }

  return fullText.replace(/\s*(Thoughts\?|Agree\?|What do you think\?|Let that sink in\.?)\s*$/i, '').trim()
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
