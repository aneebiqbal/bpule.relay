/**
 * AI Runtime V3 — Intelligence Tier Router
 *
 * Three OpenAI intelligence tiers. Centralized, configurable, no feature
 * hardcodes its own model.
 *
 *   luna  (FAST)    → classification, extraction, summarization, labeling
 *   terra (BALANCED)→ copilot, replies, outreach, studio writing, proposals
 *   sol   (DEEP)    → ambiguous/high-value reasoning, escalation only
 *
 * Sol is never the default. Escalation rules live in the call sites.
 */

import type { TaskClass, ReasoningLevel } from './types'

export type IntelligenceTier = 'luna' | 'terra' | 'sol'

export interface TierConfig {
  tier: IntelligenceTier
  /** OpenAI model id — env-overridable so spend stays a deployment decision */
  modelId: string
  reasoningLevel: ReasoningLevel
  costPerInputToken: number
  costPerOutputToken: number
  maxContextTokens: number
  /** Per-task budget class for cost governance */
  budgetClass: 'cheap' | 'normal' | 'expensive'
}

// ── Tier Registry ─────────────────────────────────────────────────────────────

// Intelligence tier -> real OpenAI model mapping.
// Tier names (luna/terra/sol) are internal routing labels; the actual model
// IDs point to real, available OpenAI models and are env-overridable.
//
//   luna  = fast/cheap      -> gpt-4o-mini   (classification, extraction, JSON)
//   terra = balanced        -> gpt-4o        (copilot, replies, writing)
//   sol   = deep/reasoning  -> gpt-4.1       (ambiguous, high-value reasoning)
//
// Verified against live API with account key. o1/o1-pro require responses API
// and max_completion_tokens (incompatible with chat completions adapter).
// Override with SCOUT_AI_LUNA_MODEL / SCOUT_AI_TERRA_MODEL / SCOUT_AI_SOL_MODEL.

export const TIER_REGISTRY: Record<IntelligenceTier, TierConfig> = {
  luna: {
    tier: 'luna',
    modelId: process.env.SCOUT_AI_LUNA_MODEL || 'gpt-4o-mini',
    reasoningLevel: 'NONE',
    costPerInputToken: 0.15,
    costPerOutputToken: 0.60,
    maxContextTokens: 128_000,
    budgetClass: 'cheap',
  },
  terra: {
    tier: 'terra',
    modelId: process.env.SCOUT_AI_TERRA_MODEL || 'gpt-4o',
    reasoningLevel: 'MEDIUM',
    costPerInputToken: 2.50,
    costPerOutputToken: 10.00,
    maxContextTokens: 128_000,
    budgetClass: 'normal',
  },
  sol: {
    tier: 'sol',
    modelId: process.env.SCOUT_AI_SOL_MODEL || 'gpt-4.1',
    reasoningLevel: 'HIGH',
    costPerInputToken: 2.0,
    costPerOutputToken: 8.0,
    maxContextTokens: 128_000,
    budgetClass: 'expensive',
  },
}

// ── Task → Tier Mapping ────────────────────────────────────────────────────────

export function defaultTierForTask(taskClass: TaskClass): IntelligenceTier {
  switch (taskClass) {
    case 'FAST_STRUCTURED':
      return 'luna'
    case 'INTERACTIVE_WRITING':
      return 'terra'
    case 'DEEP_WRITING':
      return 'terra' // sol only via escalation
    case 'BACKGROUND_INTELLIGENCE':
      return 'terra'
  }
}

export function resolveTier(tier: IntelligenceTier | undefined, taskClass: TaskClass): IntelligenceTier {
  return tier || defaultTierForTask(taskClass)
}

export function getTierConfig(tier: IntelligenceTier): TierConfig {
  return TIER_REGISTRY[tier]
}

// ── Escalation Rules ──────────────────────────────────────────────────────────
// Terra → Sol only when genuinely warranted. Never automatic for every failure.

export interface EscalationContext {
  taskClass: TaskClass
  primaryTier: IntelligenceTier
  attemptCount: number
  malformedOutput: boolean
  isHighValue: boolean
  qualityFailed: boolean
}

export function shouldEscalateTier(ctx: EscalationContext): { escalate: boolean; toTier: IntelligenceTier; reason: string } {
  const { primaryTier, attemptCount, malformedOutput, isHighValue, qualityFailed } = ctx

  // Sol never escalates further
  if (primaryTier === 'sol') {
    return { escalate: false, toTier: 'sol', reason: '' }
  }

  // Luna → Terra on persistent failure
  if (primaryTier === 'luna' && (malformedOutput || qualityFailed) && attemptCount >= 2) {
    return { escalate: true, toTier: 'terra', reason: 'luna_persistent_failure' }
  }

  // Terra → Sol only for high-value tasks with genuine quality failure
  if (primaryTier === 'terra' && isHighValue && qualityFailed && attemptCount >= 2) {
    return { escalate: true, toTier: 'sol', reason: 'high_value_quality_failure' }
  }

  // Terra → Sol on exhausted attempts for high-value
  if (primaryTier === 'terra' && isHighValue && attemptCount >= 3) {
    return { escalate: true, toTier: 'sol', reason: 'high_value_attempts_exhausted' }
  }

  return { escalate: false, toTier: primaryTier, reason: '' }
}

// ── Deterministic Guard ───────────────────────────────────────────────────────
// Before calling AI, ask: can deterministic code answer this?

export function deterministicCanAnswer(taskClass: TaskClass, hasSchema: boolean): boolean {
  // Structured extraction always benefits from AI interpretation of ambiguity
  if (taskClass === 'FAST_STRUCTURED' && hasSchema) return false
  // Writing tasks always need AI
  if (taskClass === 'INTERACTIVE_WRITING' || taskClass === 'DEEP_WRITING') return false
  // Background intelligence may be deterministic in some call sites
  return false
}
