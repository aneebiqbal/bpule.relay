import { describe, it, expect } from 'vitest'
import { validateFunnelOrdering, validateLatencyConsistency, computeCostCoverage } from '@/lib/revenue-intelligence/metrics-health'
import { generateInsights } from '@/lib/revenue-intelligence/insights'

describe('Metric health validation', () => {
  it('flags contradictory latency', () => {
    expect(validateLatencyConsistency(14425, 0, 0, 100)).toBe('SUSPICIOUS')
  })

  it('accepts consistent latency', () => {
    expect(validateLatencyConsistency(500, 450, 800, 100)).toBe('TRUSTED')
  })

  it('flags contacted > extracted', () => {
    const issues = validateFunnelOrdering(3, 6, 0, 0)
    expect(issues.length).toBe(0)
  })

  it('flags replied > contacted', () => {
    const issues = validateFunnelOrdering(3, 6, 3, 5)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].stage).toContain('replied > contacted')
  })

  it('computeCostCoverage returns UNAVAILABLE when no calls', () => {
    expect(computeCostCoverage(0, 0)).toBe('UNAVAILABLE')
  })

  it('computeCostCoverage returns PARTIAL when 60% coverage', () => {
    expect(computeCostCoverage(6, 10)).toBe('PARTIAL')
  })
})

describe('Deterministic insights', () => {
  const baseParams = {
    funnel: { extracted: 6, qualified: 0, contacted: 3, replied: 0, qualifiedConversations: 0, calls: 0, proposals: 0, won: 0, lost: 0 },
    extractionTotal: 214,
    extractionSuccessful: 214,
    fallbackCount: 30,
    aiCount: 184,
    avgLatency: 14425,
    p50Latency: 0,
    p95Latency: 0,
    avgLatencySampleSize: 184,
    aiCost: 0,
    costCoverage: 0,
    messageCount: 0,
    unchangedCount: 0,
    heavyEditCount: 0,
    rejectedCount: 0,
    funnelIssues: [],
  }

  it('generates fallback insight when fallback > 0', () => {
    const insights = generateInsights(baseParams)
    const fb = insights.find((i) => i.id === 'fallback-rate')
    expect(fb).toBeDefined()
    expect(fb?.title).toContain('14%')
  })

  it('generates latency inconsistency insight', () => {
    const insights = generateInsights(baseParams)
    const lat = insights.find((i) => i.id === 'latency-inconsistency')
    expect(lat).toBeDefined()
    expect(lat?.severity).toBe('SUSPICIOUS')
  })

  it('generates no-replies insight when contacted > 0 and replied = 0', () => {
    const insights = generateInsights(baseParams)
    const nr = insights.find((i) => i.id === 'no-replies-yet')
    expect(nr).toBeDefined()
    expect(nr?.severity).toBe('INFO')
  })

  it('generates qualified-zero-contacted-nonzero insight', () => {
    const insights = generateInsights(baseParams)
    const qz = insights.find((i) => i.id === 'qualified-zero-contacted-nonzero')
    expect(qz).toBeDefined()
    expect(qz?.severity).toBe('WATCH')
  })

  it('does not generate cost insight when costCoverage = 0 and aiCount = 0', () => {
    const insights = generateInsights({ ...baseParams, aiCount: 0, costCoverage: 0 })
    const cost = insights.find((i) => i.id === 'cost-coverage')
    expect(cost).toBeUndefined()
  })

  it('generates cost insight when coverage < 95%', () => {
    const insights = generateInsights({ ...baseParams, aiCount: 184, costCoverage: 0.42 })
    const cost = insights.find((i) => i.id === 'cost-coverage')
    expect(cost).toBeDefined()
    expect(cost?.severity).toBe('SUSPICIOUS')
  })

  it('does not generate funnel issue insights when funnel is clean', () => {
    const insights = generateInsights({
      ...baseParams,
      funnel: { extracted: 100, qualified: 62, contacted: 48, replied: 11, qualifiedConversations: 7, calls: 4, proposals: 2, won: 1, lost: 0 },
    })
    const funnelIssues = insights.filter((i) => i.type === 'FUNNEL' || i.id.startsWith('funnel-'))
    expect(funnelIssues.length).toBe(0)
  })

  it('limits insights to 6 maximum', () => {
    const params = {
      ...baseParams,
      funnelIssues: [
        { stage: 'a', health: 'SUSPICIOUS' },
        { stage: 'b', health: 'SUSPICIOUS' },
        { stage: 'c', health: 'SUSPICIOUS' },
      ],
      messageCount: 100,
      unchangedCount: 64,
      heavyEditCount: 20,
      rejectedCount: 16,
    }
    const insights = generateInsights(params)
    expect(insights.length).toBeLessThanOrEqual(6)
  })

  it('does not generate message disposition insight when sample < 10', () => {
    const insights = generateInsights({ ...baseParams, messageCount: 5, unchangedCount: 3 })
    const disp = insights.find((i) => i.id === 'message-dispositions')
    expect(disp).toBeUndefined()
  })
})
