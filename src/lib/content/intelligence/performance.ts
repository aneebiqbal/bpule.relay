import type { ContentHistoryEntry } from '@/lib/domain/types'

/**
 * Performance Learning service.
 *
 * Derives content performance patterns from logged metrics.
 *
 * Design principles:
 * - Never claim statistical certainty from tiny samples
 * - Separate CONTENT QUALITY from AUDIENCE RESPONSE
 * - Require minimum sample thresholds before surfacing patterns
 * - Never optimize for engagement at the expense of authenticity
 */

export interface PerformancePattern {
  dimension: string
  value: string
  signal: 'strong' | 'moderate' | 'weak' | 'insufficient'
  sampleSize: number
  metric: string
  score: number
  description: string
}

export interface PerformanceInsights {
  patterns: PerformancePattern[]
  summary: string
  hasEnoughData: boolean
}

const MIN_SAMPLES_FOR_PATTERN = 5
const MIN_SAMPLES_FOR_MODERATE = 8
const MIN_SAMPLES_FOR_STRONG = 12

/**
 * Analyze content history for performance patterns.
 *
 * Only derives patterns when enough evidence exists.
 */
export function analyzePerformance(history: ContentHistoryEntry[]): PerformanceInsights {
  const withMetrics = history.filter((h) => h.metricsLoggedAt !== null)

  if (withMetrics.length < MIN_SAMPLES_FOR_PATTERN) {
    return {
      patterns: [],
      summary: `Need at least ${MIN_SAMPLES_FOR_PATTERN} posts with logged metrics. Currently have ${withMetrics.length}.`,
      hasEnoughData: false,
    }
  }

  const patterns: PerformancePattern[] = []

  // Analyze by topic cluster
  const byCluster = new Map<string, ContentHistoryEntry[]>()
  for (const entry of withMetrics) {
    const key = entry.topicClusterId ?? 'unknown'
    const existing = byCluster.get(key) ?? []
    existing.push(entry)
    byCluster.set(key, existing)
  }

  for (const [clusterId, entries] of byCluster) {
    if (entries.length < 3) continue
    const avgEngagement = averageEngagement(entries)
    const signal = entries.length >= MIN_SAMPLES_FOR_STRONG ? 'strong'
      : entries.length >= MIN_SAMPLES_FOR_MODERATE ? 'moderate'
      : 'weak'

    patterns.push({
      dimension: 'topic',
      value: clusterId,
      signal,
      sampleSize: entries.length,
      metric: 'avg_engagement',
      score: avgEngagement,
      description: `${entries.length} posts about this topic with ${formatEngagement(avgEngagement)} average engagement.`,
    })
  }

  // Analyze by platform
  const byPlatform = new Map<string, ContentHistoryEntry[]>()
  for (const entry of withMetrics) {
    const existing = byPlatform.get(entry.platform) ?? []
    existing.push(entry)
    byPlatform.set(entry.platform, existing)
  }

  for (const [platform, entries] of byPlatform) {
    if (entries.length < 3) continue
    const avgEngagement = averageEngagement(entries)
    patterns.push({
      dimension: 'platform',
      value: platform,
      signal: entries.length >= MIN_SAMPLES_FOR_MODERATE ? 'moderate' : 'weak',
      sampleSize: entries.length,
      metric: 'avg_engagement',
      score: avgEngagement,
      description: `${entries.length} posts on ${platform} with ${formatEngagement(avgEngagement)} average engagement.`,
    })
  }

  // Analyze by post length
  const shortPosts = withMetrics.filter((h) => h.openingLine.length < 100)
  const longPosts = withMetrics.filter((h) => h.openingLine.length >= 100)

  if (shortPosts.length >= 3 && longPosts.length >= 3) {
    const shortAvg = averageEngagement(shortPosts)
    const longAvg = averageEngagement(longPosts)
    const diff = shortAvg - longAvg
    if (Math.abs(diff) > 0.1) {
      patterns.push({
        dimension: 'length',
        value: diff > 0 ? 'shorter' : 'longer',
        signal: (shortPosts.length + longPosts.length) >= MIN_SAMPLES_FOR_MODERATE ? 'moderate' : 'weak',
        sampleSize: shortPosts.length + longPosts.length,
        metric: 'engagement_diff',
        score: Math.abs(diff),
        description: diff > 0
          ? `Shorter posts tend to perform better (${shortPosts.length} vs ${longPosts.length} samples).`
          : `Longer posts tend to perform better (${longPosts.length} vs ${shortPosts.length} samples).`,
      })
    }
  }

  // Analyze saves/shares ratio (content quality indicator)
  const withSaves = withMetrics.filter((h) => h.saves !== null && h.saves > 0)
  if (withSaves.length >= 3) {
    const avgSaves = withSaves.reduce((sum, h) => sum + (h.saves ?? 0), 0) / withSaves.length
    patterns.push({
      dimension: 'quality_signal',
      value: 'high_save_rate',
      signal: withSaves.length >= MIN_SAMPLES_FOR_MODERATE ? 'moderate' : 'weak',
      sampleSize: withSaves.length,
      metric: 'avg_saves',
      score: Math.min(avgSaves / 50, 1),
      description: `Average ${avgSaves.toFixed(1)} saves per post (${withSaves.length} posts).`,
    })
  }

  // Sort by signal strength and sample size
  patterns.sort((a, b) => {
    const signalOrder = { strong: 0, moderate: 1, weak: 2, insufficient: 3 }
    const signalDiff = signalOrder[a.signal] - signalOrder[b.signal]
    if (signalDiff !== 0) return signalDiff
    return b.sampleSize - a.sampleSize
  })

  const summary = patterns.length > 0
    ? `Found ${patterns.length} pattern${patterns.length === 1 ? '' : 's'} from ${withMetrics.length} posts with metrics.`
    : `Not enough variation in ${withMetrics.length} posts to identify patterns yet.`

  return { patterns, summary, hasEnoughData: true }
}

/**
 * Build a prompt block for generation based on performance insights.
 */
export function buildPerformancePromptBlock(insights: PerformanceInsights): string {
  if (!insights.hasEnoughData || insights.patterns.length === 0) return ''

  const strongPatterns = insights.patterns.filter((p) => p.signal === 'strong' || p.signal === 'moderate')
  if (strongPatterns.length === 0) return ''

  const sections = strongPatterns.slice(0, 3).map((p) => `- ${p.description}`)

  if (sections.length === 0) return ''
  return `PERFORMANCE PATTERNS (weak signals, not rules):\n${sections.join('\n')}`
}

/**
 * Score an opportunity based on learned performance patterns.
 *
 * Returns a small adjustment (-0.1 to +0.1) to the base confidence.
 * Never overrides the base qualification.
 */
export function adjustOpportunityConfidence(
  baseConfidence: number,
  opportunityType: string,
  insights: PerformanceInsights,
): number {
  if (!insights.hasEnoughData) return baseConfidence

  // Find relevant patterns
  const relevantPatterns = insights.patterns.filter(
    (p) => p.signal === 'strong' || p.signal === 'moderate',
  )

  if (relevantPatterns.length === 0) return baseConfidence

  // Small boost for patterns that align with this opportunity type
  let adjustment = 0
  for (const pattern of relevantPatterns) {
    if (pattern.dimension === 'topic' && pattern.score > 0.5) {
      adjustment += 0.02 * (pattern.signal === 'strong' ? 2 : 1)
    }
  }

  // Cap the adjustment
  adjustment = Math.min(0.1, Math.max(-0.1, adjustment))

  return Math.min(1, Math.max(0, baseConfidence + adjustment))
}

function averageEngagement(entries: ContentHistoryEntry[]): number {
  if (entries.length === 0) return 0
  let totalScore = 0
  let count = 0
  for (const entry of entries) {
    const engagement = computeEngagementScore(entry)
    if (engagement > 0) {
      totalScore += engagement
      count++
    }
  }
  return count > 0 ? totalScore / count : 0
}

/**
 * Compute a normalized engagement score from a history entry.
 *
 * Normalizes reach to avoid raw numbers dominating.
 * Separates saves (quality signal) from raw reactions.
 */
function computeEngagementScore(entry: ContentHistoryEntry): number {
  let score = 0
  let signals = 0

  // Reactions/likes (normalized per 1000 reach)
  if (entry.likes !== null && entry.reach !== null && entry.reach > 0) {
    score += Math.min((entry.likes / entry.reach) * 10, 1)
    signals++
  } else if (entry.likes !== null) {
    score += Math.min(entry.likes / 100, 1)
    signals++
  }

  // Comments (higher weight = more meaningful)
  if (entry.comments !== null && entry.reach !== null && entry.reach > 0) {
    score += Math.min((entry.comments / entry.reach) * 50, 1)
    signals++
  } else if (entry.comments !== null) {
    score += Math.min(entry.comments / 20, 1)
    signals++
  }

  // Saves (quality indicator)
  if (entry.saves !== null) {
    score += Math.min(entry.saves / 30, 1) * 1.2
    signals++
  }

  // Reposts
  if (entry.reposts !== null) {
    score += Math.min(entry.reposts / 15, 1)
    signals++
  }

  return signals > 0 ? score / signals : 0
}

function formatEngagement(score: number): string {
  if (score >= 0.7) return 'high'
  if (score >= 0.4) return 'moderate'
  if (score > 0) return 'low'
  return 'no measurable'
}
