import type { DailyGrowthBrief, VisualType } from '@/lib/domain/types'
import type { ScoutStore } from '@/lib/store/types'
import type { TrendCandidate } from '@/lib/trends/types'
import { generate } from '@/lib/ai/runtime'

const RELAY_BRAND_TERRITORIES = [
  'knowing what to do next',
  'commercial signal overload',
  'context before action',
  'YOUR MOVE vs THEIR MOVE',
  'follow-up timing',
  'human-controlled AI',
  'better prospect qualification',
  'evidence vs assumptions',
  'good outreach',
  'conversation intelligence',
  'team visibility',
  'Studio creates demand / Relay captures it',
  'practical founder sales operations',
  'building a revenue operating system',
]

const GROWTH_PROMPT_VERSION = 'daily-growth-v2'

export interface GrowthBriefInput {
  trendCandidates: TrendCandidate[]
  recentTopics: string[]
  recentHooks: string[]
  recentAngles: string[]
  localDate: string
}

export async function generateDailyGrowthBrief(
  store: ScoutStore,
  orgId: string,
  input: GrowthBriefInput,
): Promise<DailyGrowthBrief> {
  const trendSignals = input.trendCandidates
    .slice(0, 5)
    .map(c => `- ${c.item.title} (${c.whyNow})`)
    .join('\n')

  const avoidContent = [...input.recentTopics, ...input.recentHooks, ...input.recentAngles]
    .slice(0, 15)
    .map(t => `- ${t}`)
    .join('\n')

  const system = `You write viral LinkedIn posts for Relay (revenue intelligence platform). The post must stop the scroll and teach Relay's worldview.

YOUR WORLDVIEW:
- Most sales tools tell you everything that happened. The harder problem is deciding which event deserves action.
- More prospect data does not create better outreach if none of it explains why now.
- A sent message is not an unfinished task. Waiting is the work.
- Context before action. Evidence vs assumptions. Human-controlled AI.
- Studio creates demand. Relay captures it.

FORMAT RULES (NON-NEGOTIABLE):
- Line 1 is the HOOK. Bold claim, surprising number, or contrarian take. This is all LinkedIn shows before "see more".
- Max 200 words total. Short paragraphs: 1-2 sentences each. White space between paragraphs.
- NO em dashes. Use commas or periods instead.
- NO listicles. No numbered lists. No "here are X tips".
- NO generic openers: "In today's fast-paced...", "As X continues to evolve...".
- NO filler: "Here's the thing", "Let that sink in", "Game changer".
- NO fake stories, fake metrics, or named customers.
- NO "Thoughts?", "Agree?", "What do you think?" at the end.
- Max 2 hashtags. Zero exclamation marks. Zero emojis.
- Teach Relay's worldworldview without being promotional. Show the problem, hint at the approach.

STRUCTURE:
1. Hook (1 line, bold claim or surprising insight)
2. Context (2-3 short paragraphs max)
3. Specific insight or contrarian take
4. End with a question that invites replies

TONE: Direct, confident, specific. Like a founder sharing a real lesson.

Output ONLY the post text. No intro, no sign-off.

PRIVACY: No customer names, real revenue numbers, or private data. Only Relay's public truths.`

  const user = JSON.stringify({
    territories: RELAY_BRAND_TERRITORIES,
    trendSignals: trendSignals || 'No strong trends today — use evergreen territory.',
    avoid: avoidContent,
  })

  const postResult = await generate<string>({
    task: 'DEEP_WRITING',
    system,
    user,
    maxTokens: 500,
    promptVersion: GROWTH_PROMPT_VERSION + '-v2',
    callSite: 'daily-growth:generatePost',
    feature: 'relay_growth_v2',
  })

  const visualSystem = `Design a visual for a LinkedIn post about Relay (revenue intelligence).

VISUAL TYPES: PRODUCT_SCREENSHOT, EDITORIAL_GRAPHIC, TECHNICAL_DIAGRAM, TYPOGRAPHIC_CONCEPT, DATA_VISUAL, GENERATED_IMAGE, NO_VISUAL

RULES:
- Default to GENERATED_IMAGE. Only use NO_VISUAL if purely conversational.
- Use PRODUCT_SCREENSHOT only when showing Relay product UI.
- Avoid AI clichés: no robots, no glowing brains, no stock people, no 3D spheres.
- The image supports the hook, not illustrates it literally.
- Output ONLY: {"type": "VISUAL_TYPE", "concept": "one sentence", "prompt": "detailed image generation prompt, 1.91:1 ratio, no text, no logos", "reason": "why this fits"}

IMAGE STYLE: Minimal, editorial, professional. Abstract compositions, diagrams, or scenes. No text in image. No faces. No logos.`

  const visualResult = await generate<{
    type: VisualType
    concept: string
    prompt?: string
    reason: string
  }>({
    task: 'FAST_STRUCTURED',
    system: visualSystem,
    user: JSON.stringify({ postExcerpt: postResult.data.slice(0, 200) }),
    promptVersion: GROWTH_PROMPT_VERSION + '-visual',
    callSite: 'daily-growth:generateVisual',
    feature: 'relay_growth_v2',
  })

  const altSystem = `Generate 3 alternate LinkedIn post ideas for Relay. Each: title, 1-sentence angle, why now. Output JSON array.`
  const altResult = await generate<Array<{ title: string; angle: string; whyNow: string }>>({
    task: 'FAST_STRUCTURED',
    system: altSystem,
    user: JSON.stringify({ territories: RELAY_BRAND_TERRITORIES.slice(0, 7) }),
    promptVersion: GROWTH_PROMPT_VERSION + '-alternates',
    callSite: 'daily-growth:generateAlternates',
    feature: 'relay_growth_v2',
  })

  const brief = await store.createDailyGrowthBrief({
    organizationId: orgId,
    localDate: input.localDate,
    promptVersion: GROWTH_PROMPT_VERSION,
    postCaption: postResult.data,
    visualType: visualResult.data.type,
    visualConcept: visualResult.data.concept,
    visualPrompt: visualResult.data.prompt,
    visualReason: visualResult.data.reason,
    alternateIdeas: altResult.data ?? [],
  })

  return brief
}
