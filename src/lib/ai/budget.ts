/**
 * Simple in-memory daily budget tracking for AI costs.
 *
 * For production deployments, replace with Redis or DB-backed counters.
 * This implementation resets on process restart (serverless-friendly).
 */

interface BudgetState {
  date: string
  totalUsd: number
  gptUsd: number
  calls: number
  cacheHits: number
  cacheMisses: number
  escalations: number
  byFeature: Record<string, { calls: number; tokens: number; costUsd: number }>
}

let state: BudgetState | null = null

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function getBudgetState(): BudgetState {
  if (!state || state.date !== today()) {
    state = {
      date: today(),
      totalUsd: 0,
      gptUsd: 0,
      calls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      escalations: 0,
      byFeature: {},
    }
  }
  return state
}

export function aiDailyBudgetUsd(): number {
  return Number(process.env.AI_DAILY_BUDGET ?? '50')
}

export function aiGptDailyBudgetUsd(): number {
  return Number(process.env.AI_GPT_DAILY_BUDGET ?? '10')
}

export interface CostRecord {
  feature: string
  operation: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  cacheHit: boolean
  retryCount: number
  fallback: boolean
  escalationReason?: string
  estimatedCostUsd: number
  costTier: string
}

export function isBudgetExceeded(): boolean {
  const s = getBudgetState()
  return s.totalUsd >= aiDailyBudgetUsd()
}

export function isGptBudgetExceeded(): boolean {
  const s = getBudgetState()
  return s.gptUsd >= aiGptDailyBudgetUsd()
}

export function recordCost(record: CostRecord): void {
  const s = getBudgetState()
  s.calls += 1
  s.totalUsd += record.estimatedCostUsd

  if (record.costTier === 'tier4' || record.provider === 'openai') {
    s.gptUsd += record.estimatedCostUsd
  }

  if (record.cacheHit) {
    s.cacheHits += 1
  } else {
    s.cacheMisses += 1
  }

  if (record.escalationReason) {
    s.escalations += 1
  }

  if (!s.byFeature[record.feature]) {
    s.byFeature[record.feature] = { calls: 0, tokens: 0, costUsd: 0 }
  }
  const feat = s.byFeature[record.feature]
  feat.calls += 1
  feat.tokens += record.inputTokens + record.outputTokens
  feat.costUsd += record.estimatedCostUsd
}

export function getUsageSummary(): {
  date: string
  totalUsd: number
  gptUsd: number
  calls: number
  cacheHitRate: number
  escalationRate: number
  byFeature: BudgetState['byFeature']
  budgetUsedPercent: number
  gptBudgetUsedPercent: number
} {
  const s = getBudgetState()
  const totalCache = s.cacheHits + s.cacheMisses
  return {
    date: s.date,
    totalUsd: Math.round(s.totalUsd * 10000) / 10000,
    gptUsd: Math.round(s.gptUsd * 10000) / 10000,
    calls: s.calls,
    cacheHitRate: totalCache > 0 ? Math.round((s.cacheHits / totalCache) * 100) : 0,
    escalationRate: s.calls > 0 ? Math.round((s.escalations / s.calls) * 100) : 0,
    byFeature: s.byFeature,
    budgetUsedPercent: Math.round((s.totalUsd / aiDailyBudgetUsd()) * 100),
    gptBudgetUsedPercent: Math.round((s.gptUsd / aiGptDailyBudgetUsd()) * 100),
  }
}
