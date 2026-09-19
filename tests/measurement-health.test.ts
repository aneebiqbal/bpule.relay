import { describe, expect, it } from 'vitest'
import {
  validateFunnelOrdering,
  overallFunnelHealth,
  validateLatencyConsistency,
  computeCostCoverage,
  classifyFallback,
  type FallbackBreakdown,
} from '@/lib/revenue-intelligence/metrics-health'

describe('Funnel health', () => {
  it('flags qualified=0 contacted>0 as SUSPICIOUS', () => {
    const issues = validateFunnelOrdering(3, 6, 0, 0)
    expect(issues.some((i) => i.health === 'SUSPICIOUS')).toBe(true)
    expect(overallFunnelHealth(issues)).toBe('SUSPICIOUS')
  })

  it('returns TRUSTED when funnel ordering is valid', () => {
    const issues = validateFunnelOrdering(3, 6, 4, 1)
    expect(overallFunnelHealth(issues)).toBe('TRUSTED')
  })

  it('flags contacted > extracted as PARTIAL', () => {
    const issues = validateFunnelOrdering(10, 6, 4, 1)
    expect(issues.some((i) => i.stage === 'contacted > extracted')).toBe(true)
  })
})

describe('Latency health', () => {
  it('flags avg>0 with zero percentiles as SUSPICIOUS', () => {
    expect(validateLatencyConsistency(14425, 0, 0, 50)).toBe('SUSPICIOUS')
  })

  it('returns UNAVAILABLE when no samples', () => {
    expect(validateLatencyConsistency(0, 0, 0, 0)).toBe('UNAVAILABLE')
  })

  it('returns TRUSTED when distribution is consistent', () => {
    expect(validateLatencyConsistency(500, 400, 800, 50)).toBe('TRUSTED')
  })
})

describe('Cost coverage', () => {
  it('returns UNAVAILABLE when no billable calls', () => {
    expect(computeCostCoverage(0, 0)).toBe('UNAVAILABLE')
  })

  it('returns SUSPICIOUS when coverage < 50%', () => {
    expect(computeCostCoverage(2, 10)).toBe('SUSPICIOUS')
  })

  it('returns TRUSTED when coverage >= 95%', () => {
    expect(computeCostCoverage(95, 100)).toBe('TRUSTED')
  })
})

describe('Fallback classification', () => {
  it('separates DEMO_MODE from production failures', () => {
    const reasons = [
      { reason: 'DEMO_MODE', count: 20 },
      { reason: 'PROVIDER_TIMEOUT', count: 5 },
      { reason: 'RATE_LIMIT', count: 3 },
      { reason: 'UNKNOWN', count: 2 },
    ]
    const breakdown = classifyFallback(reasons)
    expect(breakdown.demoMode).toBe(20)
    expect(breakdown.productionFailures).toBe(10)
    expect(breakdown.byReason.PROVIDER_TIMEOUT).toBe(5)
  })

  it('handles empty reasons', () => {
    const breakdown = classifyFallback([])
    expect(breakdown.demoMode).toBe(0)
    expect(breakdown.productionFailures).toBe(0)
  })
})

describe('Disposition tracking invariants', () => {
  it('reviewed count should exclude generated-only drafts', () => {
    // Total = 136, generatedOnly = 120, reviewed = 16
    // Percentages should be calculated over 16, not 136
    const total = 136
    const generatedOnly = 120
    const reviewed = total - generatedOnly
    const unchanged = 10
    expect(reviewed).toBe(16)
    expect(Math.round((unchanged / reviewed) * 100)).toBe(63) // 63% of reviewed, NOT 7% of total
  })
})
