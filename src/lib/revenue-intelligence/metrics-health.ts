export type MetricHealth = 'TRUSTED' | 'PARTIAL' | 'SUSPICIOUS' | 'UNAVAILABLE'

export interface MetricStatus<T> {
  value: T
  health: MetricHealth
  sampleSize: number
  reason?: string
  coverage?: number
}

export function metricStatus<T>(
  value: T,
  health: MetricHealth,
  sampleSize: number,
  reason?: string,
  coverage?: number,
): MetricStatus<T> {
  return { value, health, sampleSize, ...(reason && { reason }), ...(coverage !== undefined && { coverage }) }
}

export function validateLatencyConsistency(
  avg: number,
  p50: number,
  p95: number,
  sampleSize: number,
): MetricHealth {
  if (sampleSize === 0) return 'UNAVAILABLE'
  if (avg > 0 && p50 === 0 && p95 === 0) return 'SUSPICIOUS'
  if (avg > 0 && p50 === 0 && p95 > 0) return 'SUSPICIOUS'
  return 'TRUSTED'
}

export function validateFunnelOrdering(
  contacted: number,
  extracted: number,
  qualified: number,
  replied: number,
): Array<{ stage: string; health: MetricHealth; reason?: string }> {
  const issues: Array<{ stage: string; health: MetricHealth; reason?: string }> = []
  if (contacted > extracted) {
    issues.push({
      stage: 'contacted > extracted',
      health: 'PARTIAL',
      reason: 'Contacted exceeds extracted; imported/inbound leads may explain this',
    })
  }
  if (replied > contacted) {
    issues.push({
      stage: 'replied > contacted',
      health: 'PARTIAL',
      reason: 'Replies exceed contacted; inbound leads may explain this',
    })
  }
  // Qualified=0 while Contacted>0 is a semantic conflict requiring investigation
  if (qualified === 0 && contacted > 0) {
    issues.push({
      stage: 'qualified = 0, contacted > 0',
      health: 'SUSPICIOUS',
      reason: 'Contacted prospects with no Qualified stage. Verify LEAD_QUALIFIED event emission or whether qualification is optional.',
    })
  }
  return issues
}

export function computeCostCoverage(
  tracesWithCost: number,
  totalBillableCalls: number,
): MetricHealth {
  if (totalBillableCalls === 0) return 'UNAVAILABLE'
  const ratio = tracesWithCost / totalBillableCalls
  if (ratio >= 0.95) return 'TRUSTED'
  if (ratio >= 0.5) return 'PARTIAL'
  return 'SUSPICIOUS'
}

export function overallFunnelHealth(
  issues: Array<{ health: MetricHealth }>,
): MetricHealth {
  if (issues.some((i) => i.health === 'SUSPICIOUS')) return 'SUSPICIOUS'
  if (issues.some((i) => i.health === 'PARTIAL')) return 'PARTIAL'
  return 'TRUSTED'
}

export type FallbackReason = 'DEMO_MODE' | 'NO_CREDENTIALS' | 'PROVIDER_TIMEOUT' | 'RATE_LIMIT' | 'PROVIDER_ERROR' | 'INVALID_RESPONSE' | 'CIRCUIT_BREAKER' | 'REPAIR_FAILURE' | 'UNKNOWN'

export interface FallbackBreakdown {
  demoMode: number
  productionFailures: number
  byReason: Record<FallbackReason, number>
}

export function classifyFallback(reasons: Array<{ reason: string; count: number }>): FallbackBreakdown {
  const breakdown: FallbackBreakdown = {
    demoMode: 0,
    productionFailures: 0,
    byReason: {
      DEMO_MODE: 0,
      NO_CREDENTIALS: 0,
      PROVIDER_TIMEOUT: 0,
      RATE_LIMIT: 0,
      PROVIDER_ERROR: 0,
      INVALID_RESPONSE: 0,
      CIRCUIT_BREAKER: 0,
      REPAIR_FAILURE: 0,
      UNKNOWN: 0,
    },
  }
  for (const { reason, count } of reasons) {
    const r = reason as FallbackReason
    if (r === 'DEMO_MODE') {
      breakdown.demoMode += count
    } else {
      breakdown.productionFailures += count
    }
    if (r in breakdown.byReason) {
      breakdown.byReason[r] += count
    } else {
      breakdown.byReason.UNKNOWN += count
    }
  }
  return breakdown
}
