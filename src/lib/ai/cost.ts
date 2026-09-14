/**
 * Per-tier cost estimation, in USD per token. These are estimates for the
 * cost-by-tier report, not billing-grade figures — each provider's invoice
 * remains the source of truth.
 *
 * v2.2: DeepSeek rates kept for reference but unused when disabled.
 */
import { isDeepseekPeakHour } from '@/lib/ai/config'

export type CostTier = 'tier1' | 'tier2' | 'tier3' | 'tier4'

interface TokenRate {
  inputPerMillion: number
  outputPerMillion: number
}

/** Groq gpt-oss pricing (now tier1 in extraction chain). */
const TIER1_RATE: TokenRate = { inputPerMillion: 0.1, outputPerMillion: 0.5 }
/** DeepSeek Flash — kept for reference when re-enabled. */
const TIER2_OFF_PEAK: TokenRate = { inputPerMillion: 0.22, outputPerMillion: 0.66 }
const TIER2_PEAK: TokenRate = { inputPerMillion: 0.44, outputPerMillion: 1.32 }
/** DeepSeek Pro — kept for reference when re-enabled. */
const TIER3_OFF_PEAK: TokenRate = { inputPerMillion: 0.66, outputPerMillion: 1.98 }
const TIER3_PEAK: TokenRate = { inputPerMillion: 1.32, outputPerMillion: 3.96 }
/** OpenAI gpt-4o-mini. */
const TIER4_RATE: TokenRate = { inputPerMillion: 0.15, outputPerMillion: 0.6 }

function rateFor(tier: CostTier, at: Date): TokenRate {
  const peak = isDeepseekPeakHour(at)
  switch (tier) {
    case 'tier1':
      return TIER1_RATE
    case 'tier2':
      return peak ? TIER2_PEAK : TIER2_OFF_PEAK
    case 'tier3':
      return peak ? TIER3_PEAK : TIER3_OFF_PEAK
    case 'tier4':
      return TIER4_RATE
  }
}

/** Estimated cost in USD for one call. Token counts are approximate (character/4) when the provider doesn't return usage. */
export function estimateCostUsd(
  tier: CostTier,
  inputTokens: number,
  outputTokens: number,
  at: Date = new Date(),
): number {
  const rate = rateFor(tier, at)
  return (
    (inputTokens / 1_000_000) * rate.inputPerMillion +
    (outputTokens / 1_000_000) * rate.outputPerMillion
  )
}

/** Rough token estimate from character count when a provider response has no usage field. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
