import type { TrendItem } from '@/lib/domain/types'
import type { TrendCandidate, TrendPhase } from '@/lib/trends/types'

/**
 * Trend Velocity + Saturation Analysis
 *
 * Distinguishes emerging vs already-overposted topics.
 * Prevents Studio from jumping onto stale crowded trends.
 *
 * Classification:
 * - BREAKING: <6h old, high velocity, low saturation
 * - RISING: <24h, accelerating engagement, moderate saturation
 * - ESTABLISHED: 24-72h, stable engagement, moderate saturation
 * - SATURATED: >72h or very high coverage, declining velocity
 */

export interface VelocityAnalysis {
  phase: TrendPhase
  velocityScore: number    // -1 (declining) to +1 (accelerating)
  saturationScore: number  // 0 (nobody posted) to 1 (everyone posted)
  freshnessSla: 'breaking' | 'fast' | 'industry' | 'evergreen'
  confidence: number       // how confident we are in the classification
  whyNow: string
}

/**
 * Analyze trend velocity and saturation.
 *
 * `history` is a list of previous metric snapshots for the same item
 * (collected across ingestion cycles). If no history, we infer from
 * current metrics and age alone.
 *
 * `coverageCount` = how many personas have already posted about this topic.
 * `totalPersonas` = total active personas in the system.
 */
export function analyzeTrendVelocity(
  item: TrendItem,
  history: Array<{ metrics: Record<string, number>; fetchedAt: string }> = [],
  coverageCount = 0,
  totalPersonas = 1,
): VelocityAnalysis {
  const hoursOld = item.publishedAt
    ? (Date.now() - new Date(item.publishedAt).getTime()) / 3600000
    : 0

  const velocityScore = computeVelocity(item, history)
  const saturationScore = computeSaturation(coverageCount, totalPersonas, hoursOld)
  const phase = classifyPhase(hoursOld, velocityScore, saturationScore)
  const freshnessSla = classifyFreshnessSla(phase, item)
  const whyNow = buildWhyNow(phase, velocityScore, hoursOld)

  // Confidence based on data quality
  const confidence = history.length >= 3 ? 0.9
    : history.length >= 1 ? 0.6
    : hoursOld < 24 ? 0.4 : 0.2

  return { phase, velocityScore, saturationScore, freshnessSla, confidence, whyNow }
}

/**
 * Apply velocity + saturation to adjust trend candidate scores.
 *
 * - BREAKING trends get a strong bonus
 * - RISING trends get a moderate bonus
 * - ESTABLISHED trends are scored normally
 * - SATURATED trends get penalized
 *
 * The saturation penalty prevents every AI engineer from posting about
 * the same OpenAI announcement on the same day.
 */
export function applyVelocityScoring(
  candidate: TrendCandidate,
  velocity: VelocityAnalysis,
): TrendCandidate {
  let scoreAdjustment = 0
  let whyNowAddition = ''

  switch (velocity.phase) {
    case 'breaking':
      scoreAdjustment = 0.15
      whyNowAddition = ' [BREAKING — emerging signal]'
      break
    case 'rising':
      scoreAdjustment = 0.08
      whyNowAddition = ' [RISING — accelerating]'
      break
    case 'established':
      scoreAdjustment = 0.0
      break
    case 'saturated':
      scoreAdjustment = -0.12
      whyNowAddition = ' [SATURATED — widely covered]'
      break
  }

  // Additional saturation penalty: if >50% of personas already posted, penalize more
  if (velocity.saturationScore > 0.5) {
    scoreAdjustment -= (velocity.saturationScore - 0.5) * 0.2
  }

  return {
    ...candidate,
    overallScore: Math.max(0, candidate.overallScore + scoreAdjustment),
    velocityScore: velocity.velocityScore,
    saturationScore: velocity.saturationScore,
    trendPhase: velocity.phase,
    whyNow: candidate.whyNow + whyNowAddition,
  }
}

/**
 * Freshness SLA enforcement.
 *
 * Returns the maximum acceptable age for a trend to be considered
 * for a given content type.
 */
export function getMaxAgeForPhase(phase: TrendPhase): number {
  switch (phase) {
    case 'breaking': return 6    // hours
    case 'rising': return 24
    case 'established': return 72
    case 'saturated': return 168  // effectively excluded
  }
}

/**
 * Determine if a trend pool is too weak for trend-led content.
 * Returns true when the best trending candidate is saturated or
 * the trend pool is empty/stale.
 */
export function isTrendPoolWeak(candidates: TrendCandidate[]): boolean {
  if (candidates.length === 0) return true

  const topCandidates = candidates.slice(0, 3)
  const allSaturated = topCandidates.every(c => c.trendPhase === 'saturated')
  const allLowVelocity = topCandidates.every(c => (c.velocityScore ?? 0) < -0.2)

  return allSaturated || allLowVelocity
}


function computeVelocity(
  item: TrendItem,
  history: Array<{ metrics: Record<string, number>; fetchedAt: string }>,
): number {
  if (history.length < 1) {
    // No history — infer from current metrics only
    const metrics = item.metrics
    const score = typeof metrics.score === 'number' ? metrics.score : 0
    const comments = typeof metrics.comments === 'number' ? metrics.comments : 0

    if (score > 200 || comments > 50) return 0.6
    if (score > 100 || comments > 20) return 0.4
    if (score > 50 || comments > 5) return 0.2
    return 0.1
  }

  const sorted = [...history].sort((a, b) =>
    new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime(),
  )

  const earliest = sorted[0]
  const latest = sorted[sorted.length - 1]

  const timeDiffHours = Math.max(0.1,
    (new Date(latest.fetchedAt).getTime() - new Date(earliest.fetchedAt).getTime()) / 3600000,
  )

  const scoreDelta = getEngagementTotal(latest.metrics) - getEngagementTotal(earliest.metrics)
  const velocityPerHour = scoreDelta / timeDiffHours

  // Typical: 0-50 engagement/hour = moderate, 50+ = fast, negative = declining
  return Math.max(-1, Math.min(1, velocityPerHour / 50))
}

function getEngagementTotal(metrics: Record<string, number>): number {
  return (metrics.score ?? 0) + (metrics.stars ?? 0) + (metrics.comments ?? 0) * 2
}

function computeSaturation(coverageCount: number, totalPersonas: number, hoursOld: number): number {
  if (totalPersonas <= 1) return 0

  // Coverage ratio: what fraction of personas have posted about this
  const coverageRatio = coverageCount / totalPersonas

  // Time factor: older topics have had more time to saturate
  const timeFactor = Math.min(1, hoursOld / 72)

  return Math.min(1, coverageRatio * 0.7 + timeFactor * 0.3)
}

function classifyPhase(
  hoursOld: number,
  velocity: number,
  saturation: number,
): TrendPhase {
  if (hoursOld < 6 && velocity > 0.3 && saturation < 0.2) return 'breaking'
  if (hoursOld < 24 && velocity > 0.1 && saturation < 0.4) return 'rising'
  if (saturation > 0.6 || velocity < -0.3 || hoursOld > 168) return 'saturated'
  if (hoursOld >= 24) return 'established'
  return 'rising'
}

function classifyFreshnessSla(phase: TrendPhase, item: TrendItem): 'breaking' | 'fast' | 'industry' | 'evergreen' {
  const hoursOld = item.publishedAt
    ? (Date.now() - new Date(item.publishedAt).getTime()) / 3600000
    : 0

  if (phase === 'breaking' || hoursOld < 6) return 'breaking'
  if (phase === 'rising' || hoursOld < 24) return 'fast'
  if (phase === 'established' || hoursOld < 72) return 'industry'
  return 'evergreen'
}

function buildWhyNow(phase: TrendPhase, velocity: number, hoursOld: number): string {
  switch (phase) {
    case 'breaking': return hoursOld < 2 ? 'Just announced' : 'Emerging fast'
    case 'rising': return velocity > 0.5 ? 'Accelerating momentum' : 'Growing attention'
    case 'established': return 'Active discussion in your field'
    case 'saturated': return 'Widely covered — find a unique angle'
  }
}
