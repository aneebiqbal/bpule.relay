import type { ProviderHost } from '@/lib/ai/config'
import { cheapModel, strongModel, tier1Hosts, tier2Hosts, tier3Host, tier4Host } from '@/lib/ai/config'

export type AiTask =
  /** One-time style-card calibration from quiz answers and pasted samples. */
  | 'calibrate'
  /** Raw research paste -> structured fields. */
  | 'extract'
  /** Reply-type routing (scaffolded, not implemented). */
  | 'classify'
  /** Outreach message drafting. */
  | 'draft'
  /** Best-of-two variant drafting (parallel calls on tier 1). */
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
 * The full tier chain for a task, in try-order: DeepSeek V4 Flash across
 * every configured host, then DeepSeek V4 Pro across every configured host
 * (escalation only — callers decide whether to actually use tier 2, this
 * just says what's available if they do), then Groq, then OpenAI.
 *
 * A host only appears if it has a configured API key, so an environment with
 * just GROQ_API_KEY set still works exactly as before — the chain degrades
 * to Groq-primary automatically rather than erroring on missing DeepSeek
 * config.
 */
export function tier1Chain(): ChainStep[] {
  return tier1Hosts().map((host) => ({ costTier: 'tier1' as const, host }))
}

export function tier2Chain(): ChainStep[] {
  return tier2Hosts().map((host) => ({ costTier: 'tier2' as const, host }))
}

export function fallbackChain(kind: 'cheap' | 'strong'): ChainStep[] {
  const steps: ChainStep[] = []
  const groq = tier3Host(kind)
  if (groq) steps.push({ costTier: 'tier3', host: groq })
  const openai = tier4Host()
  if (openai) steps.push({ costTier: 'tier4', host: openai })
  return steps
}

/**
 * Full ordered chain for a structuring task (extraction, classification,
 * calibration): tier 1 hosts, then tier 3/4 fallback. Tier 2 is escalation
 * only and is fetched separately via tier2Chain() by callers that decide to
 * escalate (extract.ts, draft.ts), not tried automatically here — trying a
 * stronger, pricier tier before exhausting tier 1's own hosts would defeat
 * the point of tier 1 being multi-host in the first place.
 */
export function pickModelChain(task: 'extract' | 'classify' | 'calibrate'): ChainStep[] {
  void task
  return [...tier1Chain(), ...fallbackChain('cheap')]
}

/**
 * Full ordered chain for drafting (best-of-two runs on tier 1; escalation to
 * tier 2 is a separate explicit step in draft.ts, not part of this chain).
 */
export function pickDraftChain(): ChainStep[] {
  return [...tier1Chain(), ...fallbackChain('strong')]
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
