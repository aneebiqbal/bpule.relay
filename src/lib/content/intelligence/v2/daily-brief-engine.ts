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
    const trendSignals = buildTrendSignals(input.trendCandidates.slice(0, 8))
    const recentContent = buildRecentContentSummary(input.memories, input.recentIdeas)
    const personaContext = buildPersonaContext(input.persona, input.profile, input.tasteProfile)

    const { ideas: rawIdeas, cost: ideaCost } = await generateIdeaCandidates({
      personaContext,
      trendSignals,
      recentContent,
      costTracking,
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

    const selectedIdeas = selectDiverseSet(scoredIdeas, 5)
    const recommended = selectedIdeas[0]
    const alternates = selectedIdeas.slice(1)

    let recommendedIdea: DailyContentIdea | null = null

    for (const idea of selectedIdeas) {
      let postCaption: string | null = null
      if (idea === recommended) {
        const gateResult = await generatePostWithQualityGate({
          idea,
          personaContext,
          trendSignals,
          costTracking,
        })
        postCaption = gateResult.caption
      }

      const visualDirection = idea === recommended
        ? await generateVisualDirection(idea, input.persona, costTracking)
        : null

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
        visualComposition: visualDirection?.composition ?? undefined,
        visualFocalPoint: visualDirection?.focalPoint ?? undefined,
        visualAllowedText: visualDirection?.allowedText ?? undefined,
        visualScreenshotTarget: visualDirection?.screenshotTarget ?? undefined,
        visualReason: visualDirection?.reason ?? undefined,
      })

      if (idea === recommended) recommendedIdea = ideaRecord
    }

    if (recommendedIdea) {
      await store.updateDailyContentBriefRecommended(brief.id, recommendedIdea.id)
    }

    await store.updateDailyContentBriefStatus(brief.id, 'ready', costTracking.total)

    // Record content memories for anti-repetition
    for (const idea of selectedIdeas) {
      await store.createContentMemory({
        personaId: input.persona.id,
        memoryType: 'topic_covered',
        content: idea.title,
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
}): Promise<{ ideas: IdeaCandidate[]; cost: number }> {
  const system = `You are an editorial strategist for a personal content desk. Generate 8 distinct post ideas for today.

RULES:
- Each idea must contain an actual insight, not a generic observation.
- Daily mix: MAX 2 trend-grounded (from signals), MIN 3 evergreen (expertise/opinion/practical lesson/wildcard).
- Do not restate news headlines — add persona-specific interpretation.
- Reject ideas too similar to recent content.
- Timely ideas must reference real trend signals provided.
- Evergreen ideas must NOT reference trends — draw from persona expertise, experience, opinions.
- Output ONLY a JSON array of objects: [{"title": "...", "angle": "...", "trendGrounded": true/false, "territory": "...", "formatSuggestion": "...", "whyNow": "..."}]
- The "angle" field is a 1-2 sentence explanation of the insight.
- The "trendGrounded" field must be true only if the idea references a specific current trend from the signals above.`

  const user = JSON.stringify({
    persona: input.personaContext,
    trends: input.trendSignals,
    avoid: input.recentContent,
    count: 8,
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
}): Promise<string> {
  const system = `You write viral LinkedIn posts for a B2B practitioner. The post must stop the scroll.

FORMAT RULES (NON-NEGOTIABLE):
- Line 1 is the HOOK. It must be a bold claim, surprising number, or contrarian take. This is all LinkedIn shows before "see more".
- Max 250 words total. Short paragraphs: 1-2 sentences each. White space between paragraphs.
- NO em dashes. Use commas or periods instead.
- NO listicles. No numbered lists. No "here are X tips".
- NO generic openers: "In today's fast-paced...", "As X continues to evolve...", "The future is...".
- NO filler phrases: "Here's the thing", "Let that sink in", "Game changer", "It goes without saying".
- NO fake stories or fabricated metrics. Write from the persona's real expertise only.
- NO "Thoughts?", "Agree?", "What do you think?" at the end.
- Max 2 hashtags. Zero exclamation marks. Zero emojis.

STRUCTURE:
1. Hook (1 line, bold claim or surprising insight)
2. Context (2-3 short paragraphs max)
3. Specific insight or contrarian take
4. End with a question that invites replies

TONE: Direct, confident, specific. Like a founder sharing a real lesson, not a journalist writing an article.

Output ONLY the post text. No intro, no sign-off, no meta-commentary.`

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

export function cleanPost(raw: string): string {
  let text = raw.trim()

  // Remove em dashes
  text = text.replace(/\u2014|\u2013/g, ',').replace(/—|–/g, ',')

  // Fix broken sentences: "word. word" -> "word. Word" (but not "e. g.")
  text = text.replace(/\.\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`)

  // Remove sentences that end mid-word (trailing fragment)
  const sentences = text.split(/\.\s+/).filter(s => {
    const words = s.trim().split(/\s+/)
    // Remove if last word is clearly a fragment (1-2 chars, no verb)
    if (words.length <= 2 && /^(in|the|for|to|of|and|but|or|with|on|at|by)$/i.test(words[0])) return false
    return true
  })
  text = sentences.join('. ')

  // Trim to 250 words max
  const words = text.split(/\s+/)
  if (words.length > 250) {
    text = words.slice(0, 250).join(' ')
    // End at last complete sentence
    const lastPeriod = text.lastIndexOf('.')
    if (lastPeriod > text.length * 0.7) {
      text = text.slice(0, lastPeriod + 1)
    }
  }

  // Remove trailing filler phrases
  text = text.replace(/\s*(Thoughts\?|Agree\?|What do you think\?|Let that sink in\.?)\s*$/i, '')

  return text.trim()
}

async function generatePostWithQualityGate(input: {
  idea: IdeaCandidate
  personaContext: string
  trendSignals: string
  costTracking: { total: number }
}): Promise<{ caption: string; gateResult: PostQualityResult }> {
  let attempt = 0
  const maxAttempts = 2
  let lastCaption = ''
  let lastGate: PostQualityResult | null = null

  while (attempt < maxAttempts) {
    attempt++
    const caption = await generateFinishedPost({
      idea: input.idea,
      personaContext: input.personaContext,
      trendSignals: input.trendSignals,
      costTracking: input.costTracking,
      repairHint: lastGate ? buildRepairHint(lastGate) : undefined,
    })

    const gate = evaluatePostQuality(caption)
    lastCaption = caption
    lastGate = gate

    if (gate.passed) {
      return { caption, gateResult: gate }
    }

    if (attempt >= maxAttempts) {
      console.warn('[daily-brief] Post quality gate failed after max attempts', {
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
  if (/\u2014|\u2013/.test(caption) || caption.includes('—') || caption.includes('–')) {
    failures.push('EM_DASH')
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
  const system = `Design a visual for a LinkedIn post. Default to GENERATED_IMAGE unless text is clearly stronger.

VISUAL TYPES: PRODUCT_SCREENSHOT, EDITORIAL_GRAPHIC, TECHNICAL_DIAGRAM, TYPOGRAPHIC_CONCEPT, DATA_VISUAL, GENERATED_IMAGE, NO_VISUAL

RULES:
- Use GENERATED_IMAGE for most posts. Only use NO_VISUAL if the post is purely conversational.
- Use PRODUCT_SCREENSHOT only for Relay/Studio product posts.
- Avoid AI clichés: no robots, no glowing brains, no 3D spheres, no stock people, no floating code.
- The image should support the hook, not illustrate it literally.
- Output ONLY this JSON: {"type": "VISUAL_TYPE", "concept": "one sentence describing the image", "prompt": "detailed image generation prompt, 2-3 sentences, specific style and composition", "reason": "why this visual fits"}

IMAGE PROMPT STYLE:
- Concrete, not random. The image must relate to the post topic.
- For sales/data topics: signal paths, before/after comparisons, funnel diagrams, clean dashboards.
- For leadership topics: minimal scenes, single objects, metaphorical compositions.
- Specify 1.91:1 aspect ratio. No text. No logos. No faces.
- Use a muted, professional color palette. One accent color max.`

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
    promptVersion: DAILY_BRIEF_PROMPT_VERSION + '-visual',
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
  composition?: string
  focalPoint?: string
  allowedText?: string
  screenshotTarget?: string
  reason: string
}
