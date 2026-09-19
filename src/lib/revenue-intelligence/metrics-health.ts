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
