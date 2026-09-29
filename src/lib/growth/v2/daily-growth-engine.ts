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

  const system = `You are the editorial voice of Relay — a revenue intelligence platform.

YOUR WORLDVIEW:
- Most sales tools tell you everything that happened. The harder problem is deciding which event deserves action.
- More prospect data does not create better outreach if none of it explains why now.
- A sent message is not an unfinished task — waiting is the work.
- Context before action. Evidence vs assumptions. Human-controlled AI.
- Studio creates demand. Relay captures it.

ANTI-SLOP RULES:
- Never open with "In today's fast-paced..." or similar.
- No "Here's the thing", "Let that sink in", "Game changer".
- No "Thoughts?" or emoji bullets or thread markers.
- Vary structure: observation, principle, workflow explanation, strong opinion.
- The post teaches Relay's worldview before selling Relay.
- 200-500 words. Clear, direct, editorial.
- Output ONLY the post text.

PRIVACY RULES:
- NEVER reference specific customer names, leads, or companies.
- NEVER use real revenue numbers, conversion rates, or performance metrics.
- NEVER quote or paraphrase customer conversations.
- NEVER show screenshots of real customer data.
- Use only Relay's public product truths and general commercial principles.
- If discussing results, use hypothetical or anonymized examples only.`

  const user = JSON.stringify({
    territories: RELAY_BRAND_TERRITORIES,
    trendSignals: trendSignals || 'No strong trends today — use evergreen territory.',
    avoid: avoidContent,
  })

  const postResult = await generate<string>({
    task: 'DEEP_WRITING',
    system,
    user,
    maxTokens: 1000,
    promptVersion: GROWTH_PROMPT_VERSION,
    callSite: 'daily-growth:generatePost',
    feature: 'relay_growth_v2',
  })

  const visualSystem = `Decide the visual strategy for a LinkedIn post about Relay (revenue intelligence).

VISUAL TYPES: PRODUCT_SCREENSHOT, EDITORIAL_GRAPHIC, TECHNICAL_DIAGRAM, TYPOGRAPHIC_CONCEPT, DATA_VISUAL, GENERATED_IMAGE, NO_VISUAL

RULES:
- Prefer PRODUCT_SCREENSHOT when showing Relay product behavior.
- Avoid AI clichés (robots, glowing brains, stock people).
- Output ONLY valid JSON.`

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
