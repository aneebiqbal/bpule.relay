import type { ProviderHost } from '@/lib/ai/config'
import { cheapModel, strongModel, longcatHost, tier0Host, tier0Hosts, tier1Hosts, tier2Hosts, tier4Host } from '@/lib/ai/config'

// Re-export the host builders that drafting needs for its specialized chains.
export { longcatHost, tier0Host, tier0Hosts, tier4Host } from '@/lib/ai/config'

/**
 * Task categories determine provider routing.
 *
 * Evidence from direct benchmarking (scripts/benchmark-fast.mjs):
 *   - Groq 120b: p50=2006ms, quality=20% on extraction
 *   - GPT-4o-mini: p50=3333ms, quality=7%, reliable
 *   - LongCat: p50=32462ms, quality=10%, EMPTY OUTPUT (reasoning model)
 *
 * FAST_STRUCTURED: extraction, classification, normalization
 *   Route: Groq 120b → GPT-4o-mini
 *   (LongCat is 15-25x slower and produces no usable structured output)
 *
 * STANDARD_GENERATION: drafts, replies, DMs, connection notes
 *   Route: LongCat → Groq 120b → GPT-4o-mini
 *   (LongCat excels at writing but needs streaming + fallback)
 *
 * DEEP_GENERATION: proposals, deep research, complex analysis
 *   Route: LongCat with extended timeout
 */
export type AiTaskCategory = 'FAST_STRUCTURED' | 'STANDARD_GENERATION' | 'DEEP_GENERATION'

/**
 * Generation mode — controls provider priority.
 * standard: OpenCode → Groq → OpenAI → LongCat (via Runtime V3)
 * premium: OpenAI first, then LongCat/Groq fallback
 */
export type GenerationMode = 'standard' | 'premium'

/**
 * Build the LongCat-2.0 drafting chain with Groq fallback.
 * LongCat is the primary writer; Groq strong is the fallback.
 *
 * Order: LongCat → Groq strong (both keys) → OpenAI escalation.
 */
export function buildLongcatDraftChain(): ChainStep[] {
  const lc = longcatHost()
  const chain: ChainStep[] = []
  if (lc) chain.push({ costTier: 'tier1', host: lc })
  // Add both Groq keys (if configured) for double quota
  chain.push(...tier0Hosts('strong').map((host) => ({ costTier: 'tier1' as const, host })))
  // OpenAI escalation only
  const oai = tier4Host()
  if (oai) chain.push({ costTier: 'tier4', host: oai })
  return chain
}

/**
 * Build the OpenAI drafting chain with LongCat fallback.
 * Used in Premium mode: GPT first, then LongCat, then Groq.
 */
export function buildOpenaiDraftChain(): ChainStep[] {
  const oai = tier4Host()
  const chain: ChainStep[] = []
  if (oai) chain.push({ costTier: 'tier4', host: oai })
  // LongCat as fallback for premium mode
  const lc = longcatHost()
  if (lc) chain.push({ costTier: 'tier1', host: lc })
  chain.push(...tier0Hosts('strong').map((host) => ({ costTier: 'tier1' as const, host })))
  return chain
}

export type AiTask =
  /** One-time style-card calibration from quiz answers and pasted samples. */
  | 'calibrate'
  /** Raw research paste -> structured fields. */
  | 'extract'
  /** Reply-type routing (scaffolded, not implemented). */
  | 'classify'
  /** Outreach message drafting. */
  | 'draft'
  /** Best-of-two variant drafting (parallel calls on tier 0). */
  | 'draft-variant'

export interface ModelChoice {
  model: string
  tier: 'cheap' | 'strong'
  reason: string
}

export type CostTierName = 'tier1' | 'tier2' | 'tier3' | 'tier4'

export interface ChainStep {
  costTier: CostTierName
  host: ProviderHost
}

/**
 * The full tier chain for a task, in try-order: Groq's free tier first
 * (no card required), then OpenAI as escalation fallback. DeepSeek is
 * excluded by default (SCOUT_DEEPSEEK_ENABLED=0).
 *
 * A host only appears if it has a configured API key, so an environment with
 * only GROQ_API_KEY set still works — Groq-only is the default, working state.
 */
export function tier0Chain(kind: 'cheap' | 'strong'): ChainStep[] {
  return tier0Hosts(kind).map((host) => ({ costTier: 'tier1', host }))
}

export function tier1Chain(): ChainStep[] {
  return tier1Hosts().map((host) => ({ costTier: 'tier2' as const, host }))
}

export function tier2Chain(): ChainStep[] {
  return tier2Hosts().map((host) => ({ costTier: 'tier3' as const, host }))
}

export function fallbackChain(): ChainStep[] {
  const openai = tier4Host()
  return openai ? [{ costTier: 'tier4', host: openai }] : []
}

/**
 * Fast structured chain for extraction/classification tasks.
 * Evidence-based: Groq 120b (2s p50) → GPT-4o-mini (3.3s p50) fallback.
 * LongCat excluded — it's 15-25x slower and produces empty structured output.
 * Only the first Groq key is used — the second key returns a different schema format.
 */
export function buildFastStructuredChain(): ChainStep[] {
  const chain: ChainStep[] = []
  // Groq 120b first — fastest structured extraction in benchmarks
  const groq = tier0Host('strong')
  if (groq) chain.push({ costTier: 'tier1', host: groq })
  // GPT-4o-mini fallback — reliable, reasonably fast
  const gpt = tier4Host()
  if (gpt) chain.push({ costTier: 'tier4', host: gpt })
  return chain
}

/**
 * Full ordered chain for a structuring task (extraction, classification,
 * calibration): Groq strong first, then GPT fallback.
 * DeepSeek excluded by default.
 */
export function pickModelChain(task: 'extract' | 'classify' | 'calibrate'): ChainStep[] {
  void task
  return buildFastStructuredChain()
}

/**
 * Full ordered chain for drafting: LongCat first (strong writer), then Groq
 * strong, then OpenAI as escalation fallback. DeepSeek excluded by default.
 */
export function pickDraftChain(): ChainStep[] {
  const lc = longcatHost()
  const chain: ChainStep[] = []
  if (lc) chain.push({ costTier: 'tier1', host: lc })
  return [...chain, ...tier0Chain('strong'), ...fallbackChain()]
}

/**
 * Centralized decision: should a result escalate to GPT (premium)?
 * Returns the escalation reason, or null if GPT should NOT be called.
 *
 * GPT runs only when:
 * - cheap/LongCat result fails deterministic quality gates, OR
 * - structured output is malformed after retries, OR
 * - a high-value generation cannot meet quality threshold.
 *
 * Never escalate merely because a cheaper model returned a valid result.
 */
export function shouldEscalateToPremium(reason: {
  primaryPassed: boolean
  primaryScore: number
  isHighValue: boolean
  malformedOutput: boolean
  attemptCount: number
}): { shouldEscalate: boolean; reason: string } {
  if (reason.malformedOutput && reason.attemptCount >= 2) {
    return { shouldEscalate: true, reason: 'malformed_output_retries_exhausted' }
  }
  if (!reason.primaryPassed && reason.isHighValue) {
    return { shouldEscalate: true, reason: 'high_value_quality_failure' }
  }
  if (!reason.primaryPassed && reason.primaryScore < 4) {
    return { shouldEscalate: true, reason: 'quality_gate_failure' }
  }
  return { shouldEscalate: false, reason: '' }
}

/**
 * @deprecated Legacy single-model picker, kept only for call sites not yet
 * migrated to pickModelChain/pickDraftChain (the calibration and role-fallback
 * classification paths, which are low-volume enough that the multi-host/
 * multi-tier chain is not worth the added complexity yet).
 */
export function pickModel(task: AiTask): ModelChoice {
  switch (task) {
    case 'calibrate':
    case 'classify':
      return {
        model: cheapModel(),
        tier: 'cheap',
        reason: `${task} is a structuring task; the cheap model is capable and the call is not on the per-lead hot path.`,
      }
    case 'extract':
      return {
        model: cheapModel(),
        tier: 'cheap',
        reason: 'Legacy path; extraction now routes through pickModelChain("extract") in extract.ts.',
      }
    case 'draft':
      return {
        model: strongModel(),
        tier: 'strong',
        reason: 'Legacy path; drafting now routes through pickDraftChain() in draft.ts.',
      }
    case 'draft-variant':
      return {
        model: cheapModel(),
        tier: 'cheap',
        reason: 'Legacy path; best-of-two now routes through pickDraftChain() in draft.ts.',
      }
  }
}
