import type {
  ContentPersona,
  ContentProfile,
  ContentMemory,
  DailyContentBrief,
  DailyContentIdea,
  TrendInterestProfile,
  PersonaIntelligenceProfile,
  VisualType,
  SourceFreshness,
} from '@/lib/domain/types'
import type { ScoutStore } from '@/lib/store/types'
import type { TrendCandidate } from '@/lib/trends/types'
import { generate } from '@/lib/ai/runtime'
import type { ShapeSchema } from '@/lib/ai/runtime/schemas'
import { checkContentQuality, repairPost } from '../quality/content-quality-engine'
import { embedContentMemory, checkForDuplicatesCombined } from '../memory'
import { hasEmbeddingProvider } from '@/lib/ai/config'
import { buildPerformanceProfile, derivePerformanceSignals, type PerformanceSignal } from '../performance'
import { analyzeTrendVelocity, applyVelocityScoring, isTrendPoolWeak, type VelocityAnalysis } from '@/lib/trends/velocity'
import { scoreReachPotential, applyReachScoring } from '../reach'
import { buildSourceProvenance, buildSourcePromptBlock, groundIdeaAgainstSources } from '../sources'
import { getPersonaAngleProfile, generateDiversifiedAngle, buildDiversificationPromptBlock } from '../diversification'

// ── AI Output Schemas ──

const IDEA_CANDIDATES_SCHEMA: ShapeSchema = {
  ideas: { type: 'array', required: true },
}
// Per-idea shape (validated manually after parse)
const IDEA_ITEM_SCHEMA: ShapeSchema = {
  title: { type: 'string', required: true },
  angle: { type: 'string', required: true },
  whyNow: { type: 'string', required: false },
  territory: { type: 'string', required: false },
  formatSuggestion: { type: 'string', required: false },
  trendGrounded: { type: 'boolean', required: true },
}

const VISUAL_DIRECTION_SCHEMA: ShapeSchema = {
  type: { type: 'string', required: true },
  concept: { type: 'string', required: true },
  reason: { type: 'string', required: true },
}

// ── Anti-Slop Detection ──

const BANNED_PHRASES = [
  "In today's fast-paced",
  "In today's rapidly changing",
  "Here's the thing",
  "Let that sink in",
  "Game changer",
  "The future is here",
  "The future is now",
  "Thoughts?",
  "Agree?",
  "Let that marinate",
  "Here's why",
  "Here's the kicker",
  "It's not rocket science",
  "At the end of the day",
  "In a world where",
  "Picture this",
  "Imagine this",
  "What if I told you",
  "Buckle up",
  "Let's dive in",
  "Let's unpack",
  "The bottom line",
  "The hard truth",
  "The uncomfortable truth",
  "I'm going to be honest",
  "Hot take:",
  "Unpopular opinion:",
]

const BANNED_HOOK_PATTERNS = [
  /^Have you ever/i,
  /^Did you know/i,
  /^Think about it/i,
  /^Consider this/i,
  /^Why do so many/i,
  /^Most people don't/i,
  /^The real reason/i,
  /^Here's what/i,
]

const FARED_EXPERIENCE_PATTERNS = [
  /I (recently|just) (tried|built|launched|tested)/i,
  /my team (just|recently)/i,
  /I ran an? (experiment|test)/i,
  /last week I/i,
  /yesterday I/i,
  /I've been using/i,
]

export type PostPlatform = 'linkedin' | 'x'

export interface DailyBriefInput {
  persona: ContentPersona
  profile: ContentProfile
  tasteProfile: {
    preferences: {
      opinionVsEducational: number
      timelyVsEvergreen: number
      shortVsDeep: number
    }
    territoryAffinity: Record<string, number>
  } | null
  memories: ContentMemory[]
  trendCandidates: TrendCandidate[]
  recentIdeas: Array<{ title: string; territory: string; angle: string }>
  localDate: string
  timezone: string
  platform: PostPlatform
}

export interface DailyBriefResult {
  brief: DailyContentBrief
  ideas: DailyContentIdea[]
  cost: number
}

const DAILY_BRIEF_PROMPT_VERSION = 'daily-brief-v2'

export async function generateDailyBrief(
  store: ScoutStore,
  input: DailyBriefInput,
): Promise<DailyBriefResult> {
  const costTracking = { total: 0 }

  const brief = await store.createDailyContentBrief({
    organizationId: input.persona.organizationId,
    personaId: input.persona.id,
    localDate: input.localDate,
    promptVersion: DAILY_BRIEF_PROMPT_VERSION,
  })

  try {
    const recentContent = buildRecentContentSummary(input.memories, input.recentIdeas)
    const personaContext = buildPersonaContext(input.persona, input.profile, input.tasteProfile)

    // ── Phase 3: Trend velocity + saturation analysis ──
    const velocityAnalyses = new Map<string, VelocityAnalysis>()
    const candidatesWithVelocity = input.trendCandidates.map(tc => {
      const vel = analyzeTrendVelocity(tc.item)
      velocityAnalyses.set(tc.item.id, vel)
      return applyVelocityScoring(tc, vel)
    })
    const trendSignals = buildTrendSignals(candidatesWithVelocity.slice(0, 8))

    // ── Phase 3: Evergreen fallback detection ──
    const trendPoolWeak = isTrendPoolWeak(candidatesWithVelocity.slice(0, 5))
    const contentStrategy = trendPoolWeak ? 'evergreen' : 'trend-led'

    if (trendPoolWeak) {
      console.info('[daily-brief] Trend pool weak — favoring evergreen content', {
        personaId: input.persona.id,
        localDate: input.localDate,
        topCandidatePhase: candidatesWithVelocity[0]?.trendPhase ?? 'none',
      })
    }

    // ── Performance signals — what has actually worked ──
    const performanceProfile = await buildPerformanceProfile(store, input.persona.id)
    const performanceSignals = derivePerformanceSignals(performanceProfile)

    // ── Phase 3: Trend diversification angle ──
    const personaAngle = getPersonaAngleProfile(
      input.persona.personaRole ?? input.profile.role ?? '',
      input.profile.seniority,
    )

    const { ideas: rawIdeas, cost: ideaCost } = await generateIdeaCandidates({
      personaContext,
      trendSignals,
      recentContent,
      costTracking,
      performanceSignals,
      personaAngle,
      contentStrategy,
      platform: input.platform,
    })
    costTracking.total += ideaCost

    let scoredIdeas = scoreIdeas(rawIdeas, input)

    // Fallback: if AI returned 0 ideas, generate from profile + trends
    if (scoredIdeas.length === 0) {
      console.warn('[daily-brief] AI returned 0 ideas — using deterministic fallback', {
        personaId: input.persona.id,
        localDate: input.localDate,
        trendCount: input.trendCandidates.length,
        expertiseCount: (input.profile?.expertise ?? []).length,
      })
      scoredIdeas = generateDeterministicIdeas(input)
    }

    // ── Phase 2: Semantic novelty penalty (embedding-based dedup) ──
    if (hasEmbeddingProvider() && scoredIdeas.length > 1) {
      scoredIdeas = await applySemanticNoveltyPenalty(scoredIdeas, store, input.persona.id)
    }

    // ── Phase 3: Reach scoring — "why this could perform" ──
    scoredIdeas = scoredIdeas.map(idea => {
      const trendCandidate = candidatesWithVelocity.find(tc =>
        idea.trendGrounded && tc.item.title.toLowerCase().includes(idea.title.toLowerCase().slice(0, 20)),
      )
      const reachScore = scoreReachPotential({
        ideaTitle: idea.title,
        ideaAngle: idea.angle,
        territory: idea.territory,
        trendCandidate,
        persona: input.persona,
        profile: input.profile,
        platform: input.platform,
        isTrendGrounded: idea.trendGrounded,
      })
      const adjustedScore = applyReachScoring(idea.relevance ?? 0.5, reachScore)
      return { ...idea, relevance: adjustedScore, reachScore: reachScore.overall }
    })

    // ── Phase 3: Platform-specific ranking adjustment ──
    scoredIdeas = applyPlatformSpecificRanking(scoredIdeas, input.platform)

    // ── Phase 3: Evergreen boost when trend pool is weak ──
    if (trendPoolWeak) {
      scoredIdeas = scoredIdeas.map(idea => ({
        ...idea,
        relevance: (idea.relevance ?? 0.5) * (idea.trendGrounded ? 0.8 : 1.2),
      }))
    }

    const selectedIdeas = selectDiverseSet(scoredIdeas, 5)
    const recommended = selectedIdeas[0]
    const alternates = selectedIdeas.slice(1)

    let recommendedIdea: DailyContentIdea | null = null

    for (const idea of selectedIdeas) {
      // Phase 3: Source grounding for trend-led posts
      const sourceProvenance = idea.trendGrounded
        ? buildSourceProvenance(
            candidatesWithVelocity.find(tc => tc.item.title.toLowerCase().includes(idea.title.toLowerCase().slice(0, 20)))?.item ?? input.trendCandidates[0]?.item,
            input.profile.territories ?? [],
          )
        : null

      const sourcePromptBlock = sourceProvenance ? buildSourcePromptBlock([sourceProvenance]) : ''

      // Phase 3: Diversified angle for this persona
      const diversifiedAngle = idea.trendGrounded
        ? generateDiversifiedAngle(personaAngle, idea.title, [idea.territory ?? ''])
        : null
      const diversificationBlock = diversifiedAngle ? buildDiversificationPromptBlock(diversifiedAngle) : ''

      let gateResult = await generatePostWithQualityGate({
        idea,
        personaContext,
        trendSignals: sourcePromptBlock + '\n\n' + trendSignals,
        costTracking,
        platform: input.platform,
        diversificationBlock,
      })
      let postCaption = gateResult.caption

      // Content Quality Engine gate
      const qualityCheck = checkContentQuality(postCaption, {
        personaRole: input.persona.personaRole,
        territories: input.profile?.territories,
        expertise: input.profile?.expertise?.map(e => e.area),
        trendGrounded: idea.trendGrounded,
      })

      if (!qualityCheck.passed && qualityCheck.score.overall < 5) {
        // Try to repair and re-check
        const repaired = repairPost(postCaption)
        const reCheck = checkContentQuality(repaired, {
          personaRole: input.persona.personaRole,
          territories: input.profile?.territories,
          expertise: input.profile?.expertise?.map(e => e.area),
          trendGrounded: idea.trendGrounded,
        })
        if (reCheck.passed) {
          postCaption = repaired
        } else if (qualityCheck.score.grammar < 5) {
          // Grammar too broken — regenerate once with repair hint
          const retry = await generateFinishedPost({
            idea,
            personaContext,
            trendSignals,
            costTracking,
            repairHint: `Fix these grammar issues: ${qualityCheck.score.failures.join(', ')}`,
          })
          postCaption = retry
        }
      }

      const visualDirection = await generateVisualDirection(idea, input.persona, costTracking)

      const ideaRecord = await store.createDailyContentIdea({
         briefId: brief.id,
         organizationId: input.persona.organizationId,
         personaId: input.persona.id,
         ideaType: idea === recommended ? 'recommended' : 'alternate',
         title: idea.title,
         angle: idea.angle,
         whyNow: idea.whyNow,
         sourceIds: idea.sourceIds,
         sourceFreshness: idea.sourceFreshness,
         formatSuggestion: idea.formatSuggestion,
         territory: idea.territory,
         noveltyScore: idea.novelty,
         relevanceScore: idea.relevance,
         credibilityScore: idea.credibility,
         insightScore: idea.insight,
         trendGrounded: idea.trendGrounded,
         postCaption: postCaption ?? undefined,
         visualType: visualDirection?.type ?? undefined,
         visualConcept: visualDirection?.concept ?? undefined,
         visualPrompt: visualDirection?.prompt ?? undefined,
         visualCommunicationGoal: visualDirection?.communicationGoal ?? undefined,
         visualSubject: visualDirection?.subject ?? undefined,
         visualScene: visualDirection?.scene ?? undefined,
         visualComposition: visualDirection?.composition ?? undefined,
         visualLighting: visualDirection?.lighting ?? undefined,
         visualPalette: visualDirection?.palette ?? undefined,
         visualMood: visualDirection?.mood ?? undefined,
         visualStyle: visualDirection?.style ?? undefined,
         visualAspectRatio: visualDirection?.aspectRatio ?? undefined,
         visualFocalPoint: visualDirection?.focalPoint ?? undefined,
         visualAllowedText: visualDirection?.allowedText ?? undefined,
         visualScreenshotTarget: visualDirection?.screenshotTarget ?? undefined,
         visualAvoid: visualDirection?.avoid?.join(', ') ?? undefined,
         visualReason: visualDirection?.reason ?? undefined,
       })

      if (idea === recommended) recommendedIdea = ideaRecord
    }

    if (recommendedIdea) {
      await store.updateDailyContentBriefRecommended(brief.id, recommendedIdea.id)
    }

    await store.updateDailyContentBriefStatus(brief.id, 'ready', costTracking.total)

    // Record content memories for anti-repetition (with semantic embeddings)
    for (const idea of selectedIdeas) {
      // Compute semantic fingerprint for combined title+angle+territory
      const embedding = await embedContentMemory({
        title: idea.title,
        angle: idea.angle,
        territory: idea.territory,
      })

      await store.createContentMemory({
        personaId: input.persona.id,
        memoryType: 'topic_covered',
        content: idea.title,
        embedding,
      })
      if (idea.territory) {
        await store.createContentMemory({
          personaId: input.persona.id,
          memoryType: 'angle_used',
          content: idea.territory,
        })
      }
    }

    const ideas = await store.listDailyContentIdeas(brief.id)
    return { brief: { ...brief, status: 'ready' }, ideas, cost: costTracking.total }
  } catch (err) {
    await store.updateDailyContentBriefStatus(brief.id, 'failed')
    throw err
  }
}

async function generateIdeaCandidates(input: {
  personaContext: string
  trendSignals: string
  recentContent: string
  costTracking: { total: number }
  performanceSignals?: PerformanceSignal
  personaAngle?: ReturnType<typeof getPersonaAngleProfile>
  contentStrategy?: 'trend-led' | 'evergreen'
  platform?: PostPlatform
}): Promise<{ ideas: IdeaCandidate[]; cost: number }> {
  const perfBlock = input.performanceSignals && input.performanceSignals.guidance.length > 0
    ? `\n\nPERFORMANCE INSIGHTS from this persona's past posts:\n${input.performanceSignals.guidance.map(g => `- ${g}`).join('\n')}`
    : ''

  const strategyBlock = input.contentStrategy === 'evergreen'
    ? '\n\nTODAY\'S STRATEGY: Trends are weak — prioritize evergreen expertise, lessons, and authoritative opinions over trend-chasing.'
    : ''

  const angleBlock = input.personaAngle
    ? `\n\nEDITORIAL LENS: As a ${input.personaAngle.type}, focus on: ${input.personaAngle.lenses.slice(0, 2).join(', ')}. Avoid: ${input.personaAngle.avoidAngles[0]}.`
    : ''

  const platformCount = input.platform === 'x' ? 6 : 8

  const system = `You are a content strategist. Generate ${platformCount} specific post ideas that this person could actually publish.

RULES:
- At least 3 ideas must reference the trend signals by name with the persona's unique take.
- At least 2 ideas must be personal lessons from the persona's real experience.
- At least 1 idea must be a hot take or counterintuitive opinion.
- Titles must be SPECIFIC. No "A lesson from X", "Thoughts on X", "Why X matters".
- GOOD titles: "We reduced pod restarts by 40% with one config change" / "I reviewed 50 postmortems. 43 had the same root cause."
- Include a "whyNow" that explains urgency — a trend, a recent event, a seasonal insight, or a mistake people are making right now.
- The "angle" must be 1-2 sentences of actual insight, not a generic observation.${perfBlock}${strategyBlock}${angleBlock}
- Output ONLY JSON array: [{"title": "...", "angle": "...", "trendGrounded": true/false, "territory": "topic", "formatSuggestion": "observation|lesson|opinion|case_study", "whyNow": "..."}]`

  const user = JSON.stringify({
    persona: input.personaContext,
    trends: input.trendSignals,
    avoid: input.recentContent,
    count: platformCount,
    favorTopics: input.performanceSignals?.favorTopics ?? [],
  })

  const result = await generate<IdeaCandidate[] | { ideas: IdeaCandidate[] }>({
    task: 'FAST_STRUCTURED',
    system,
    user,
    promptVersion: DAILY_BRIEF_PROMPT_VERSION,
    callSite: 'daily-brief:generateIdeas',
    feature: 'studio_v2_daily',
  })

  // Handle multiple response formats: array, {ideas}, {posts}, {suggestions}, {items}
  let rawIdeas: IdeaCandidate[] = []
  if (Array.isArray(result.data)) {
    rawIdeas = result.data
  } else if (result.data !== null && typeof result.data === 'object') {
    const obj = result.data as Record<string, unknown>
    const key = ['ideas', 'posts', 'suggestions', 'items', 'candidates'].find(k => Array.isArray(obj[k]))
    if (key) rawIdeas = obj[key] as IdeaCandidate[]
  }

  return { ideas: rawIdeas, cost: estimateCost(result) }
}

interface PostQualityResult {
  passed: boolean
  failures: string[]
  warnings: string[]
  wordCount: number
}

async function generateFinishedPost(input: {
  idea: IdeaCandidate
  personaContext: string
  trendSignals: string
  costTracking: { total: number }
  repairHint?: string
  diversificationBlock?: string
}): Promise<string> {
  const divBlock = input.diversificationBlock ? `\n\n${input.diversificationBlock}` : ''
  const system = `You are a LinkedIn ghostwriter for senior tech practitioners. Write a post that STOPS the scroll.${divBlock}

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
- NO filler phrases: "Here's the thing", "Let that sink in", "Game changer", "In today's fast-paced world".
- 120-180 words total.
- Specific details only. Real tools, real numbers, real situations.
- NO hashtags, NO emojis, NO exclamation marks.
- NO sign-off, no "follow for more".

TONE: Like a senior engineer explaining something to a peer over coffee. Direct, specific, no corporate speak.`

  const userObj: Record<string, unknown> = {
    persona: input.personaContext,
    idea: {
      title: input.idea.title,
      angle: input.idea.angle,
      territory: input.idea.territory,
      format: input.idea.formatSuggestion,
    },
    sources: input.trendSignals,
  }
  if (input.repairHint) {
    userObj.repair = input.repairHint
  }
  const user = JSON.stringify(userObj)

  const result = await generate<string>({
    task: 'DEEP_WRITING',
    system,
    user,
    maxTokens: 600,
    promptVersion: DAILY_BRIEF_PROMPT_VERSION + '-post-v2',
    callSite: 'daily-brief:generatePost',
    feature: 'studio_v2_daily',
  })

  return cleanPost(result.data)
}

async function generateXPost(input: {
  idea: IdeaCandidate
  personaContext: string
  trendSignals: string
  costTracking: { total: number }
  repairHint?: string
  diversificationBlock?: string
}): Promise<string> {
  const divBlock = input.diversificationBlock ? `\n\n${input.diversificationBlock}` : ''
  const system = `You write sharp, quotable posts for X (Twitter) by senior tech practitioners.${divBlock}

WRITING RULES:
- One post. No threads unless the idea genuinely requires 2-3 posts to land.
- Lead with the opinion, the number, or the contrarian take. No throat-clearing.
- Compress. Every word must earn its place. If it doesn't add information, cut it.
- Sound like a smart person talking — not a brand, not a newsletter, not a blog.
- Timeliness matters. If a trend is referenced, make it clear why it matters right now.
- End with either a punchline, a question, or nothing. Never "Thoughts?" or "Agree?".

HARD RULES:
- NO em dashes. Use commas or periods.
- NO "In today's fast-paced..." or any AI filler.
- NO listicles, no numbered tips, no "here are X things".
- NO hashtags, NO emojis, NO exclamation marks.
- NO sign-off, no "follow for more".
- Max 280 characters for single posts.
- Threads: max 3 posts, each max 280 chars. Number as "1/", "2/", "3/".
- Never fabricate numbers, metrics, or named examples.

TONE:
- Confident. Specific. Human.
- A senior engineer sharing a real insight they'd tell a peer — not presenting to an audience.
- Controversial takes are fine if the person can credibly hold the opinion.
- If the post is about a trend, the take must be the persona's own — not a summary of the article.

FORMAT:
Output ONLY the post text. No JSON, no intro, no "Here's your post:".`

  const userObj: Record<string, unknown> = {
    persona: input.personaContext,
    idea: {
      title: input.idea.title,
      angle: input.idea.angle,
      territory: input.idea.territory,
      format: input.idea.formatSuggestion,
    },
    sources: input.trendSignals,
  }
  if (input.repairHint) {
    userObj.repair = input.repairHint
  }
  const user = JSON.stringify(userObj)

  const result = await generate<string>({
    task: 'DEEP_WRITING',
    system,
    user,
    maxTokens: 300,
    promptVersion: DAILY_BRIEF_PROMPT_VERSION + '-x-v1',
    callSite: 'daily-brief:generateXPost',
    feature: 'studio_v2_daily_x',
  })

  return cleanXPost(result.data)
}

function cleanXPost(raw: string): string {
  let text = raw.trim()

  // Remove ALL em dashes and dash-like characters
  text = text.replace(/[\u2014\u2013\u2015\uFE58\uFF0D\u2500\u2212\u2E3A\u2E3B]/g, ' ')

  // Remove emojis
  text = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
  text = text.replace(/[\u{1F600}-\u{1F64F}]/gu, '')
  text = text.replace(/[\u{2600}-\u{26FF}]/gu, '')

  // Remove hashtags
  text = text.replace(/#[a-zA-Z][a-zA-Z0-9]*/g, '')

  // Remove trailing filler
  text = text.replace(/\s*(Thoughts\?|Agree\?|Let that sink in\.?)\s*$/i, '')

  // Collapse whitespace
  text = text.replace(/\s{2,}/g, ' ').trim()

  // Enforce 280 char limit for non-thread posts
  const lines = text.split('\n').filter(l => l.trim())
  const isThread = lines.some(l => /^\d+\/\s/.test(l.trim()))

  if (!isThread && text.length > 280) {
    // Try to cut at sentence boundary
    const lastPeriod = text.lastIndexOf('.', 277)
    if (lastPeriod > 200) {
      text = text.slice(0, lastPeriod + 1)
    } else {
      text = text.slice(0, 277) + '...'
    }
  }

  return text.trim()
}

function evaluateXPostQuality(caption: string): PostQualityResult {
  const failures: string[] = []
  const warnings: string[] = []

  const lines = caption.split('\n').filter(l => l.trim())
  const isThread = lines.some(l => /^\d+\/\s/.test(l.trim()))

  // Hard rule: no em dashes
  if (/[\u2014\u2013\u2015]/.test(caption) || caption.includes('—') || caption.includes('–')) {
    failures.push('EM_DASH')
  }

  // Hard rule: character limit
  if (!isThread && caption.length > 280) {
    failures.push('TOO_LONG')
  }
  if (isThread) {
    for (const line of lines) {
      const content = line.replace(/^\d+\/\s*/, '').trim()
      if (content.length > 280) failures.push('THREAD_POST_TOO_LONG')
    }
  }

  // Anti-slop: banned phrases
  for (const phrase of BANNED_PHRASES) {
    if (caption.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`BANNED: "${phrase}"`)
    }
  }

  // Formatting
  if ((caption.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length > 0) failures.push('EMOJI')
  if ((caption.match(/#[a-zA-Z]/g) || []).length > 0) failures.push('HASHTAGS')
  if (/!$/.test(caption.trim())) failures.push('EXCLAMATION')

  const wordCount = caption.split(/\s+/).length
  const passed = failures.length === 0
  return { passed, failures, warnings, wordCount }
}

export function cleanPost(raw: string): string {
  let text = raw.trim()

  // Remove ALL em dashes, en dashes, and dash-like characters
  text = text.replace(/[\u2014\u2013\u2015\uFE58\uFF0D\u2500\u2212\u2E3A\u2E3B]/g, ' ')
  text = text.replace(/\s{2,}/g, ' ')

  // Normalize paragraph breaks
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/\r\n/g, '\n')

  // Fix broken sentences within paragraphs
  text = text.replace(/\.\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`)

  // Trim each paragraph
  const paragraphs = text.split('\n\n').map(p => p.trim()).filter(Boolean)

  // If AI returned one big block, split into paragraphs by sentence groups
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

  // Trim to ~200 words
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

async function generatePostWithQualityGate(input: {
  idea: IdeaCandidate
  personaContext: string
  trendSignals: string
  costTracking: { total: number }
  platform: PostPlatform
  diversificationBlock?: string
}): Promise<{ caption: string; gateResult: PostQualityResult }> {
  const evaluateQuality = input.platform === 'x' ? evaluateXPostQuality : evaluatePostQuality
  const generatePost = input.platform === 'x' ? generateXPost : generateFinishedPost

  let attempt = 0
  const maxAttempts = 2
  let lastCaption = ''
  let lastGate: PostQualityResult | null = null

  while (attempt < maxAttempts) {
    attempt++
    const caption = await generatePost({
      idea: input.idea,
      personaContext: input.personaContext,
      trendSignals: input.trendSignals,
      costTracking: input.costTracking,
      repairHint: lastGate ? buildRepairHint(lastGate) : undefined,
      diversificationBlock: input.diversificationBlock,
    })

    const gate = evaluateQuality(caption)
    lastCaption = caption
    lastGate = gate

    if (gate.passed) {
      return { caption, gateResult: gate }
    }

    if (attempt >= maxAttempts) {
      console.warn('[daily-brief] Post quality gate failed after max attempts', {
        platform: input.platform,
        failures: gate.failures,
        warnings: gate.warnings,
        wordCount: gate.wordCount,
        attempt,
      })
      return { caption, gateResult: gate }
    }
  }

  return { caption: lastCaption, gateResult: lastGate ?? createFailGate('max attempts') }
}

function evaluatePostQuality(caption: string): PostQualityResult {
  const failures: string[] = []
  const warnings: string[] = []

  // Factual: no fabricated numbers without context
  const fakeMetrics = /\b(\d+%|\d+x|\+\d+%).*(improvement|increase|decrease|faster|better)/gi
  if (fakeMetrics.test(caption) && !caption.includes('according to') && !caption.includes('data from')) {
    warnings.push('UNVERIFIED_METRIC')
  }

  // Hard rule: no em dashes
  if (/[\u2014\u2013\u2015]/.test(caption) || caption.includes('—') || caption.includes('–')) {
    failures.push('EM_DASH')
  }

  // Hard rule: must have paragraph breaks (not a wall of text)
  const paragraphs = caption.split('\n\n').filter(p => p.trim().length > 0)
  if (paragraphs.length < 3) failures.push('NEEDS_PARAGRAPHS')

  // Hard rule: no paragraph should be longer than 3 sentences
  for (const p of paragraphs) {
    const sentences = p.split(/[.!?]+/).filter(s => s.trim().length > 5)
    if (sentences.length > 3) failures.push('PARAGRAPH_TOO_LONG')
  }

  // Hard rule: max 250 words
  const wordCount = caption.split(/\s+/).length
  if (wordCount < 50) failures.push('TOO_SHORT')
  if (wordCount > 250) failures.push('TOO_LONG')

  // Anti-slop: banned phrases
  for (const phrase of BANNED_PHRASES) {
    if (caption.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`BANNED: "${phrase}"`)
    }
  }

  // Anti-slop: banned hooks
  for (const pattern of BANNED_HOOK_PATTERNS) {
    if (pattern.test(caption)) {
      failures.push(`HOOK: ${pattern.source}`)
    }
  }

  // Anti-listicle: detect numbered "best practices" / "tips" format
  const numberedItems = caption.match(/^\d+\.\s+\*\*/gm) || []
  if (numberedItems.length >= 3) failures.push('LISTICLE')
  if (/here are (some|the|my|top|key|best)/i.test(caption)) failures.push('LISTICLE_OPENER')

  // Formatting
  if ((caption.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length > 0) failures.push('EMOJI')
  if ((caption.match(/#[a-zA-Z]/g) || []).length > 2) failures.push('HASHTAGS')
  if (/!$/.test(caption.trim())) failures.push('EXCLAMATION')

  const passed = failures.length === 0
  return { passed, failures, warnings, wordCount }
}

function buildRepairHint(gate: PostQualityResult): string {
  if (gate.failures.length === 0) return ''
  return `Your previous draft failed quality checks for:\n${gate.failures.map(f => `- ${f}`).join('\n')}\nRewrite to fix these issues.`
}

function createFailGate(reason: string): PostQualityResult {
  return { passed: false, failures: [reason], warnings: [], wordCount: 0 }
}

async function generateVisualDirection(
  idea: IdeaCandidate,
  persona: ContentPersona,
  costTracking: { total: number },
): Promise<VisualDirection | null> {
  const system = `You are a creative director for social media content visuals. Your job is not to "generate an image" — it is to decide the right visual medium and direct it like a creative director.

STEP 1: Choose the RIGHT medium for this post.
- NO_VISUAL: Opinion, rants, personal stories where text IS the content. Adding an image dilutes it.
- TYPOGRAPHIC_CONCEPT: One powerful number or quote. Big text, minimal design, high contrast.
- TECHNICAL_DIAGRAM: Architecture, flows, comparisons. Isometric or flat vector diagrams.
- DATA_VISUAL: Metrics, before/after, trends. Charts, graphs with real data feel.
- EDITORIAL_GRAPHIC: Concepts, metaphors, tradeoffs. Illustrated, metaphorical, conceptual.
- REALISTIC_PHOTOGRAPH: ONLY when a real scene adds genuine value. Must be editorial photography — not stock.
- PRODUCT_SCREENSHOT: Only when showing a real product UI.

STEP 2: If the medium is visual, produce a full creative direction.
- communication_goal: What should the viewer understand in 3 seconds?
- subject: The literal thing shown (no abstractions).
- scene: Where is this happening? What is the environment?
- composition: Layout, focal point, visual hierarchy.
- lighting: Natural, studio, cinematic, flat, ambient.
- palette: Specific colors. Muted base + ONE accent.
- mood: The feeling. Tense, calm, confident, analytical, urgent.
- style: Editorial photography, isometric diagram, flat vector, technical illustration.
- aspect_ratio: 1.91:1 for LinkedIn, 1:1 or 16:9 for X.
- avoid: List specific clichés to avoid for THIS concept.

AVOID GLOBALLY:
- No robots, no glowing brains, no 3D spheres, no stock people, no floating code.
- No generic "tech office" scenes. No motivational posters (sunrise, cliff, mountain).
- No abstract gradient blobs. No fake dashboards. No holographic UI.
- If the topic is Docker, show a real system concept. If infrastructure, make it feel infrastructural.

Output ONLY JSON:
{
  "type": "NO_VISUAL|TYPOGRAPHIC_CONCEPT|TECHNICAL_DIAGRAM|DATA_VISUAL|EDITORIAL_GRAPHIC|REALISTIC_PHOTOGRAPH|PRODUCT_SCREENSHOT",
  "concept": "One sentence. What this visual communicates.",
  "communication_goal": "What the viewer understands in 3 seconds",
  "subject": "The literal thing shown",
  "scene": "Environment/setting",
  "composition": "Layout and focal point",
  "lighting": "Type and quality of light",
  "palette": "Specific colors",
  "mood": "Feeling",
  "style": "Medium style",
  "aspect_ratio": "1.91:1",
  "prompt": "3-4 sentence generation prompt. Concrete nouns only.",
  "avoid": ["specific thing 1", "specific thing 2"],
  "reason": "Why this medium fits this idea"
}`

  const user = JSON.stringify({
    ideaTitle: idea.title,
    ideaAngle: idea.angle,
    territory: idea.territory,
    format: idea.formatSuggestion,
    personaRole: persona.personaRole,
  })

  const result = await generate<VisualDirection | { visual: VisualDirection }>({
    task: 'FAST_STRUCTURED',
    system,
    user,
    promptVersion: DAILY_BRIEF_PROMPT_VERSION + '-visual-v2',
    callSite: 'daily-brief:generateVisual',
    feature: 'studio_v2_daily',
  })

  // Handle both direct object and wrapped { visual: ... } formats
  if (result.data && typeof result.data === 'object') {
    const obj = result.data as Record<string, unknown>
    if (obj.type && obj.concept) return result.data as VisualDirection
    if (obj.visual && typeof obj.visual === 'object') return obj.visual as VisualDirection
  }

  // If visual generation failed or returned garbage, default to NO_VISUAL
  return null
}

function buildTrendSignals(candidates: TrendCandidate[]): string {
  if (candidates.length === 0) return 'No current trend signals available.'
  return candidates
    .map(c => `- [${c.item.evidenceQuality}] ${c.item.title} (${c.whyNow}) ${c.item.url ?? ''}`)
    .join('\n')
}

function buildRecentContentSummary(
  memories: ContentMemory[],
  recentIdeas: Array<{ title: string; territory: string; angle: string }>,
): string {
  const parts: string[] = []
  const recentTopics = memories
    .filter(m => m.memoryType === 'topic_covered')
    .slice(0, 10)
    .map(m => m.content)
  if (recentTopics.length > 0) {
    parts.push('Recently covered topics:\n' + recentTopics.map(t => `- ${t}`).join('\n'))
  }
  if (recentIdeas.length > 0) {
    parts.push('Recent ideas:\n' + recentIdeas.map(i => `- ${i.title} (${i.territory})`).join('\n'))
  }
  return parts.length > 0 ? parts.join('\n\n') : 'No previous content.'
}

function buildPersonaContext(
  persona: ContentPersona,
  profile: ContentProfile,
  tasteProfile: {
    preferences: {
      opinionVsEducational: number
      timelyVsEvergreen: number
      shortVsDeep: number
    }
    territoryAffinity: Record<string, number>
  } | null,
): string {
  const parts: string[] = []

  if (profile.role) parts.push(`Role: ${profile.role}`)
  if (profile.seniority) parts.push(`Seniority: ${profile.seniority}`)
  if (profile.industries?.length) parts.push(`Industries: ${profile.industries.join(', ')}`)
  if (profile.audience) parts.push(`Audience: ${profile.audience}`)

  if (profile.expertise?.length) {
    const topExpertise = profile.expertise
      .sort((a, b) => (b.level === 'expert' ? 1 : 0) - (a.level === 'expert' ? 1 : 0))
      .slice(0, 5)
      .map(e => e.area)
    parts.push(`Expertise: ${topExpertise.join(', ')}`)
  }

  if (profile.opinions?.length) {
    const strongOpinions = profile.opinions
      .filter(o => o.strength === 'strong')
      .slice(0, 3)
      .map(o => o.belief)
    if (strongOpinions.length > 0) parts.push(`Strong opinions: ${strongOpinions.join('; ')}`)
  }

  if (persona.humorStyle) parts.push(`Tone: ${persona.humorStyle}`)

  if (profile.writingCharacteristics) {
    const wc = profile.writingCharacteristics as Record<string, unknown>
    if (wc.preferredLength) parts.push(`Preferred length: ${wc.preferredLength}`)
    if (wc.sentenceRhythm) parts.push(`Rhythm: ${wc.sentenceRhythm}`)
  }

  if (tasteProfile) {
    const dims: string[] = []
    if (tasteProfile.preferences.opinionVsEducational > 0.3) dims.push('opinionated')
    else if (tasteProfile.preferences.opinionVsEducational < -0.3) dims.push('educational')
    if (tasteProfile.preferences.timelyVsEvergreen > 0.3) dims.push('timely')
    else if (tasteProfile.preferences.timelyVsEvergreen < -0.3) dims.push('evergreen')
    if (tasteProfile.preferences.shortVsDeep > 0.3) dims.push('short')
    else if (tasteProfile.preferences.shortVsDeep < -0.3) dims.push('deep-dive')
    if (dims.length > 0) parts.push(`Style preference: ${dims.join(', ')}`)
  }

  return parts.join('\n')
}

const FALLBACK_TEMPLATES = [
  (area: string) => ({
    title: `The ${area} mistake I see every team make`,
    angle: `A specific, recurring pattern you have observed. Name the mistake, explain why it happens, and what to do instead.`,
    formatSuggestion: 'practical_lesson',
  }),
  (area: string) => ({
    title: `What nobody tells you about ${area}`,
    angle: `An insider perspective that contradicts common advice or surface-level tutorials.`,
    formatSuggestion: 'opinion',
  }),
  (area: string) => ({
    title: `I changed my mind about ${area}`,
    angle: `A genuine shift in perspective. What you used to believe, what changed your mind, and what you think now.`,
    formatSuggestion: 'opinion',
  }),
  (area: string) => ({
    title: `The ${area} decision I got wrong (and what it cost)`,
    angle: `A specific mistake with concrete consequences. Vulnerable, specific, useful.`,
    formatSuggestion: 'case_study',
  }),
  (area: string) => ({
    title: `Two years of ${area} in one lesson`,
    angle: `Distill a hard-won insight into a single actionable takeaway. Specific, not abstract.`,
    formatSuggestion: 'practical_lesson',
  }),
  (area: string) => ({
    title: `${area} is not what you think it is`,
    angle: `A counterintuitive reframe. Challenge the default assumption your audience holds.`,
    formatSuggestion: 'opinion',
  }),
  (area: string) => ({
    title: `The question I wish someone asked me about ${area}`,
    angle: `Pose a specific, uncomfortable question that forces the reader to examine their own approach.`,
    formatSuggestion: 'observation',
  }),
  (area: string) => ({
    title: `What worked in ${area} last year vs what works now`,
    angle: `A concrete before/after. Tactics that stopped working and what replaced them.`,
    formatSuggestion: 'observation',
  }),
]

const FALLBACK_TERRITORY_TEMPLATES = [
  (t: string) => ({
    title: `Why most teams underestimate ${t}`,
    angle: `A contrarian take. Explain the gap between how people think about ${t} and the reality.`,
    formatSuggestion: 'opinion',
  }),
  (t: string) => ({
    title: `${t} is a symptom, not the problem`,
    angle: `Reframe a common issue. The surface-level fix everyone tries vs the root cause.`,
    formatSuggestion: 'opinion',
  }),
  (t: string) => ({
    title: `The ${t} playbook I actually use`,
    angle: `Concrete, specific steps — not generic advice. A mini case study from real work.`,
    formatSuggestion: 'practical_lesson',
  }),
]

function generateDeterministicIdeas(input: DailyBriefInput): IdeaCandidate[] {
  const ideas: IdeaCandidate[] = []
  const territories = input.profile?.territories ?? []
  const expertise = (input.profile?.expertise ?? []).map(e => e.area).filter(Boolean) as string[]
  const opinions = (input.profile?.opinions ?? []).filter(o => o.strength === 'strong').map(o => o.belief)
  const projects = (input.profile?.projects ?? []).map(p => p.name).filter(Boolean)
  const experiences = (input.profile?.experiences ?? []).filter(e => e.type === 'mistake' || e.type === 'lesson').map(e => e.description).filter(Boolean)
  const role = input.profile?.role ?? ''

  // 1. Trend-grounded ideas (max 2) — use opinion to personalize
  for (const candidate of input.trendCandidates.slice(0, 2)) {
    const opinionHook = opinions.length > 0 ? ` — and here is why it matters: ${opinions[0].slice(0, 80)}` : ''
    ideas.push({
      title: `What "${candidate.item.title}" means for ${expertise[0] ?? role}${opinionHook.slice(0, 40)}`,
      angle: `${opinions[0] ?? 'A current development with real consequences for ' + (role || 'your field')}. What this means specifically for how you work, not in general.`,
      whyNow: candidate.whyNow,
      territory: territories[0] ?? candidate.item.topics?.[0],
      trendGrounded: true,
      formatSuggestion: 'observation',
      novelty: 0.8,
      relevance: 0.9,
      credibility: 0.85,
      insight: 0.75,
    })
  }

  // 2. Expertise-based using diverse templates
  const expertiseAreas = expertise.length > 0 ? expertise : territories
  for (let i = 0; i < Math.min(expertiseAreas.length, 3); i++) {
    const area = expertiseAreas[i]
    const template = FALLBACK_TEMPLATES[i % FALLBACK_TEMPLATES.length]
    const t = template(area)
    ideas.push({
      title: t.title,
      angle: t.angle,
      whyNow: 'Evergreen',
      territory: area,
      trendGrounded: false,
      formatSuggestion: t.formatSuggestion,
      novelty: 0.65 + (i * 0.05),
      relevance: 0.85,
      credibility: 0.9,
      insight: 0.8,
    })
  }

  // 3. Experience-based (real stories from profile)
  for (const exp of experiences.slice(0, 1)) {
    if (ideas.length >= 5) break
    ideas.push({
      title: `What "${exp.slice(0, 60)}" taught me`,
      angle: `A first-person lesson from a real situation. Specific details, no abstractions.`,
      whyNow: 'Evergreen',
      territory: territories[0],
      trendGrounded: false,
      formatSuggestion: 'case_study',
      novelty: 0.85,
      relevance: 0.8,
      credibility: 0.95,
      insight: 0.85,
    })
  }

  // 4. Territory opinions
  for (let i = 0; i < Math.min(territories.length, 2); i++) {
    if (ideas.length >= 5) break
    const territory = territories[i]
    const template = FALLBACK_TERRITORY_TEMPLATES[i % FALLBACK_TERRITORY_TEMPLATES.length]
    const t = template(territory)
    ideas.push({
      title: t.title,
      angle: t.angle,
      whyNow: 'Evergreen',
      territory,
      trendGrounded: false,
      formatSuggestion: t.formatSuggestion,
      novelty: 0.7,
      relevance: 0.8,
      credibility: 0.8,
      insight: 0.75,
    })
  }

  // Ensure at least 4 diverse ideas
  let fallbackIdx = 0
  while (ideas.length < 4) {
    const area = expertiseAreas[fallbackIdx % expertiseAreas.length] ?? territories[0] ?? 'your work'
    const template = FALLBACK_TEMPLATES[(3 + fallbackIdx) % FALLBACK_TEMPLATES.length]
    const t = template(area)
    ideas.push({
      ...t,
      whyNow: 'Evergreen',
      territory: area,
      trendGrounded: false,
      novelty: 0.5 + (fallbackIdx * 0.05),
      relevance: 0.7,
      credibility: 0.8,
      insight: 0.7,
    })
    fallbackIdx++
  }

  return ideas.slice(0, 5)
}

function scoreIdeas(
  candidates: IdeaCandidate[],
  input: DailyBriefInput,
): IdeaCandidate[] {
  return candidates.map(raw => {
    // Normalize fields: AI may use 'insight' instead of 'angle'
    const idea: IdeaCandidate = {
      title: raw.title,
      angle: raw.angle ?? raw.whyNow ?? '',
      whyNow: raw.whyNow ?? '',
      territory: raw.territory,
      formatSuggestion: raw.formatSuggestion,
      trendGrounded: raw.trendGrounded ?? false,
      sourceIds: raw.sourceIds,
      sourceFreshness: raw.sourceFreshness,
    }

    let novelty = 0.5
    const recentTitles = input.recentIdeas.map(i => i.title.toLowerCase())
    if (!recentTitles.some(t => similarity(t, idea.title.toLowerCase()) > 0.6)) {
      novelty = 0.8
    }

    let relevance = 0.6
    if (idea.territory && input.profile.territories?.includes(idea.territory)) {
      relevance = 0.9
    }

    let credibility = 0.6
    if (idea.trendGrounded && input.trendCandidates.length > 0) {
      credibility = 0.85
    }

    const insight = 0.5 + (idea.angle ? 0.2 : 0) + (idea.formatSuggestion ? 0.1 : 0)

    return { ...idea, novelty, relevance, credibility, insight }
  })
}

/**
 * Apply semantic novelty penalty using embedding-based similarity.
 * Ideas that are semantically close to existing content get their novelty
 * score reduced, making them less likely to be selected as recommended.
 */
async function applySemanticNoveltyPenalty(
  ideas: IdeaCandidate[],
  store: ScoutStore,
  personaId: string,
): Promise<IdeaCandidate[]> {
  return Promise.all(
    ideas.map(async (idea) => {
      const embedding = await embedContentMemory({
        title: idea.title,
        angle: idea.angle,
        territory: idea.territory,
      })
      if (!embedding) return idea

      const similar = await store.findSimilarMemories(embedding, personaId, 0.75, 3)
      if (similar.length === 0) return idea

      const maxSim = Math.max(...similar.map(s => s.similarity))
      const penalty = maxSim * 0.4
      const newNovelty = Math.max(0.1, (idea.novelty ?? 0.5) - penalty)

      return { ...idea, novelty: newNovelty }
    }),
  )
}

/**
 * Platform-specific ranking adjustment.
 *
 * Same pool of ideas, different winner for LinkedIn vs X.
 * LinkedIn: favors depth, expertise, conversation, specificity
 * X: favors compression, immediacy, quotability, timeliness
 */
function applyPlatformSpecificRanking(ideas: IdeaCandidate[], platform: PostPlatform): IdeaCandidate[] {
  return ideas.map(idea => {
    let adjustment = 0

    if (platform === 'x') {
      // X favors: timely, opinionated, short titles, high emotional tension
      if (idea.trendGrounded) adjustment += 0.05
      if (idea.formatSuggestion === 'opinion') adjustment += 0.04
      if (idea.title.length < 60) adjustment += 0.03
      // X disfavors: long-form, educational, case studies
      if (idea.formatSuggestion === 'case_study') adjustment -= 0.03
    } else {
      // LinkedIn favors: expertise, depth, specificity, conversation
      if (idea.formatSuggestion === 'case_study') adjustment += 0.04
      if (idea.formatSuggestion === 'practical_lesson') adjustment += 0.03
      if (idea.credibility ?? 0 > 0.7) adjustment += 0.03
      // LinkedIn disfavors: overly short, purely timely without depth
      if (idea.title.length < 30) adjustment -= 0.02
    }

    return { ...idea, relevance: (idea.relevance ?? 0.5) + adjustment }
  })
}

function selectDiverseSet(candidates: IdeaCandidate[], count: number): IdeaCandidate[] {
  const selected: IdeaCandidate[] = []
  const usedTerritories = new Set<string>()

  const sorted = [...candidates].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))

  for (const candidate of sorted) {
    if (selected.length >= count) break
    const territory = candidate.territory ?? 'general'
    const territoryCount = [...usedTerritories].filter(t => t === territory).length
    if (territoryCount >= 2) continue
    selected.push(candidate)
    usedTerritories.add(territory)
  }

  while (selected.length < count && candidates.length > selected.length) {
    const remaining = candidates.find(c => !selected.includes(c))
    if (!remaining) break
    selected.push(remaining)
  }

  return selected
}

function similarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' '))
  const wordsB = new Set(b.split(' '))
  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  return overlap / Math.max(wordsA.size, 1)
}

function estimateCost(result: { trace?: { estimatedCostUsd?: number } }): number {
  return result.trace?.estimatedCostUsd ?? 0.005
}

// ─── Internal types ───

interface IdeaCandidate {
  title: string
  angle: string
  whyNow: string
  territory?: string
  formatSuggestion?: string
  sourceIds?: string[]
  sourceFreshness?: SourceFreshness
  trendGrounded: boolean
  novelty?: number
  relevance?: number
  credibility?: number
  insight?: number
}

interface VisualDirection {
  type: VisualType
  concept: string
  prompt?: string
  communicationGoal?: string
  subject?: string
  scene?: string
  composition?: string
  lighting?: string
  palette?: string
  mood?: string
  style?: string
  aspectRatio?: string
  focalPoint?: string
  allowedText?: string
  screenshotTarget?: string
  avoid?: string[]
  reason: string
}
