import type { ProviderHost } from '@/lib/ai/config'
import { cheapModel, strongModel, longcatHost, tier0Host, tier1Hosts, tier2Hosts, tier4Host } from '@/lib/ai/config'

// Re-export the host builders that drafting needs for its specialized chains.
export { longcatHost, tier0Host, tier4Host } from '@/lib/ai/config'

/**
 * Build the LongCat-2.0 drafting chain with Groq fallback.
 * LongCat is the primary; if it fails, Groq's strong tier takes over.
 */
export function buildLongcatDraftChain(): ChainStep[] {
  const lc = longcatHost()
  const groq = tier0Host('strong')
  const chain: ChainStep[] = []
  if (lc) chain.push({ costTier: 'tier1', host: lc })
  if (groq) chain.push({ costTier: 'tier1', host: groq })
  return chain
}

/**
 * Build the OpenAI drafting chain with Groq fallback.
 * OpenAI is the primary; if it fails, Groq's strong tier takes over.
 */
export function buildOpenaiDraftChain(): ChainStep[] {
  const oai = tier4Host()
  const groq = tier0Host('strong')
  const chain: ChainStep[] = []
  if (oai) chain.push({ costTier: 'tier4', host: oai })
  if (groq) chain.push({ costTier: 'tier1', host: groq })
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
 * The full tier chain for a task, in try-order: Groq's free tier (tier 0,
 * primary — no card required, generous rate limits, verified against
 * published limits) first, then DeepSeek V4 Flash across every configured
 * host (tier 1, first paid escalation), then DeepSeek V4 Pro across every
 * configured host (tier 2, escalation only — callers decide whether to
 * actually use it, this just says what's available if they do), then OpenAI
 * (tier 4, final safety net).
 *
 * Cost-tier labels ('tier1'..'tier4') are historical from the prior
 * architecture pass and kept as-is (matches the extraction_runs cost_tier
 * check constraint, migration 0016) rather than renumbered — Groq's step
 * below is logged as 'tier1' since it's now the first tier tried, DeepSeek
 * Flash as 'tier2', DeepSeek Pro escalation as 'tier3', OpenAI stays 'tier4'.
 * The Team page's tier labels are updated to match (Groq/free, DeepSeek
 * Flash, DeepSeek Pro, OpenAI) so the numbers on screen describe what's
 * actually running, not the old ordering.
 *
 * A host only appears if it has a configured API key, so an environment with
 * only GROQ_API_KEY set still works exactly as it always has — Groq-only is
 * the default, working state, not a degraded one.
 */
export function tier0Chain(kind: 'cheap' | 'strong'): ChainStep[] {
  const groq = tier0Host(kind)
  return groq ? [{ costTier: 'tier1', host: groq }] : []
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
 * Full ordered chain for a structuring task (extraction, classification,
 * calibration): Groq free tier, then DeepSeek tier 1 hosts, then OpenAI.
 * DeepSeek Pro (tier2Chain()) is escalation only and fetched separately by
 * callers that decide to escalate (extract.ts, draft.ts) on the existing
 * confidence-gate/self-check triggers — not tried automatically here.
 */
export function pickModelChain(task: 'extract' | 'classify' | 'calibrate'): ChainStep[] {
  void task
  return [...tier0Chain('cheap'), ...tier1Chain(), ...fallbackChain()]
}

/**
 * Full ordered chain for drafting: Groq free tier runs the best-of-two pass;
 * escalation to DeepSeek Pro is a separate explicit step in draft.ts, not
 * part of this chain.
 */
export function pickDraftChain(): ChainStep[] {
  return [...tier0Chain('strong'), ...tier1Chain(), ...fallbackChain()]
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
