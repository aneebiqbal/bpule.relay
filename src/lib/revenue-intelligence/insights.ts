export type InsightType = 'DATA_QUALITY' | 'FUNNEL' | 'TEAM' | 'OUTREACH' | 'INTELLIGENCE' | 'AI_HEALTH' | 'OPPORTUNITY'
export type InsightSeverity = 'INFO' | 'WATCH' | 'ACTION'
export type InsightConfidence = 'LOW' | 'MEDIUM' | 'HIGH'
export type MetricHealth = 'TRUSTED' | 'PARTIAL' | 'SUSPICIOUS' | 'UNAVAILABLE'

export interface RevenueInsight {
  id: string
  type: InsightType
  severity: InsightSeverity
  title: string
  explanation: string
  sampleSize?: number
  confidence: InsightConfidence
  suggestedInvestigation?: string
}

export function generateInsights(params: {
  funnel: { extracted: number; qualified: number; contacted: number; replied: number; qualifiedConversations: number; calls: number; proposals: number; won: number; lost: number }
  extractionTotal: number
  extractionSuccessful: number
  fallbackCount: number
  aiCount: number
  avgLatency: number
  p50Latency: number
  p95Latency: number
  avgLatencySampleSize: number
  aiCost: number
  costCoverage: number
  messageCount: number
  unchangedCount: number
  heavyEditCount: number
  rejectedCount: number
  funnelIssues: Array<{ stage: string; health: string; reason?: string }>
}): RevenueInsight[] {
  const insights: RevenueInsight[] = []
  const { funnel, extractionTotal, extractionSuccessful, fallbackCount, aiCount, avgLatency, p50Latency, p95Latency, avgLatencySampleSize, aiCost, costCoverage, messageCount, unchangedCount, heavyEditCount, rejectedCount, funnelIssues } = params

  if (extractionTotal > 0 && extractionSuccessful > 0 && fallbackCount > 0) {
    const fallbackRate = Math.round((fallbackCount / extractionTotal) * 100)
    insights.push({
      id: 'fallback-rate',
      type: 'AI_HEALTH',
      severity: fallbackRate > 20 ? 'WATCH' : 'INFO',
      title: `${fallbackRate}% of extractions used fallback/demo`,
      explanation: `${fallbackCount} of ${extractionTotal} extraction runs did not use a live AI provider. Determine whether these were intentional demo runs or provider degradation.`,
      sampleSize: extractionTotal,
      confidence: 'HIGH',
      suggestedInvestigation: 'Check ai_traces.fallback_reason breakdown',
    })
  }

  if (avgLatency > 0 && avgLatencySampleSize > 0) {
    const health: MetricHealth = avgLatency > 0 && p50Latency === 0 && p95Latency === 0 ? 'SUSPICIOUS' : 'TRUSTED'
    insights.push({
      id: 'latency-inconsistency',
      type: 'DATA_QUALITY',
      severity: health === 'SUSPICIOUS' ? 'WATCH' : 'INFO',
      title: health === 'SUSPICIOUS' ? 'Latency telemetry is contradictory' : 'Latency telemetry is consistent',
      explanation: health === 'SUSPICIOUS'
        ? `Average latency is ${avgLatency}ms, but P50 and P95 are both 0ms. Latency distribution is unreliable until corrected.`
        : `Average latency: ${avgLatency}ms. P50: ${p50Latency}ms. P95: ${p95Latency}ms.`,
      sampleSize: avgLatencySampleSize,
      confidence: 'HIGH',
      suggestedInvestigation: health === 'SUSPICIOUS' ? 'Verify latency field units (ms vs s) and null handling' : undefined,
    })
  }

  if (costCoverage < 0.95 && aiCount > 0) {
    const health: MetricHealth = costCoverage < 0.5 ? 'SUSPICIOUS' : 'PARTIAL'
    insights.push({
      id: 'cost-coverage',
      type: 'DATA_QUALITY',
      severity: health === 'SUSPICIOUS' ? 'ACTION' : 'WATCH',
      title: `AI cost coverage is ${Math.round(costCoverage * 100)}%`,
      explanation: `Reported cost of $${aiCost.toFixed(2)} only covers ${Math.round(costCoverage * 100)}% of billable AI calls. ${aiCount - Math.round(aiCount * costCoverage)} calls have missing cost telemetry.`,
      sampleSize: aiCount,
      confidence: 'MEDIUM',
      suggestedInvestigation: 'Verify provider pricing config and token usage capture',
    })
  }

  for (const issue of funnelIssues) {
    insights.push({
      id: `funnel-${issue.stage}`,
      type: 'DATA_QUALITY',
      severity: issue.health === 'SUSPICIOUS' ? 'ACTION' : 'WATCH',
      title: `Funnel: ${issue.stage}`,
      explanation: issue.reason ?? 'Funnel stage ordering anomaly detected.',
      confidence: 'HIGH',
      suggestedInvestigation: 'Verify stage event tracking and definition alignment',
    })
  }

  if (funnel.contacted > 0 && funnel.replied === 0) {
    insights.push({
      id: 'no-replies-yet',
      type: 'OUTREACH',
      severity: 'INFO',
      title: 'No replies recorded yet',
      explanation: `${funnel.contacted} prospects were contacted but no replies are recorded. There is not enough outcome data to evaluate outreach effectiveness.`,
      sampleSize: funnel.contacted,
      confidence: 'HIGH',
    })
  }

  if (funnel.extracted > 0 && funnel.qualified === 0 && funnel.contacted > 0) {
    insights.push({
      id: 'qualified-zero-contacted-nonzero',
      type: 'FUNNEL',
      severity: 'WATCH',
      title: 'Contacted prospects have no Qualified stage',
      explanation: `${funnel.contacted} prospects are marked contacted while Qualified remains 0. Verify whether LEAD_QUALIFIED events are being emitted or whether contacted leads bypass qualification.`,
      sampleSize: funnel.contacted,
      confidence: 'HIGH',
      suggestedInvestigation: 'Check relay_events for LEAD_QUALIFIED event emission',
    })
  }

  if (messageCount >= 10) {
    const unchangedPct = Math.round((unchangedCount / messageCount) * 100)
    const heavyEditPct = Math.round((heavyEditCount / messageCount) * 100)
    insights.push({
      id: 'message-dispositions',
      type: 'OUTREACH',
      severity: 'INFO',
      title: `Message dispositions: ${unchangedPct}% unchanged, ${heavyEditPct}% heavily edited`,
      explanation: `Across ${messageCount} generated messages, ${unchangedCount} were sent unchanged, ${heavyEditCount} required heavy edits, and ${rejectedCount} were rejected.`,
      sampleSize: messageCount,
      confidence: 'HIGH',
    })
  }

  return insights.slice(0, 6)
}
