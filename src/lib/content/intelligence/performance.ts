import type { ContentHistoryEntry, ContentPostMetrics } from '@/lib/domain/types'
import type { ScoutStore } from '@/lib/store/types'

/**
 * Performance Learning service.
 *
 * Two layers:
 * 1. Pattern analysis (existing) — surfaces insights for human review
 * 2. Performance signals (new) — feeds automated brief generation
 *
 * Design principles:
 * - Never claim statistical certainty from tiny samples
 * - Separate CONTENT QUALITY from AUDIENCE RESPONSE
 * - Require minimum sample thresholds before surfacing patterns
 * - Never optimize for engagement at the expense of authenticity
 * - Learn per-persona, not globally
 */

// ─── Layer 1: Pattern Analysis (insights for humans) ─────────────────────────

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
      dimension: 'topic', value: clusterId, signal,
      sampleSize: entries.length, metric: 'avg_engagement', score: avgEngagement,
      description: `${entries.length} posts about this topic with ${formatEngagement(avgEngagement)} average engagement.`,
    })
  }

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
      dimension: 'platform', value: platform,
      signal: entries.length >= MIN_SAMPLES_FOR_MODERATE ? 'moderate' : 'weak',
      sampleSize: entries.length, metric: 'avg_engagement', score: avgEngagement,
      description: `${entries.length} posts on ${platform} with ${formatEngagement(avgEngagement)} average engagement.`,
    })
  }

  const shortPosts = withMetrics.filter((h) => h.openingLine.length < 100)
  const longPosts = withMetrics.filter((h) => h.openingLine.length >= 100)
  if (shortPosts.length >= 3 && longPosts.length >= 3) {
    const shortAvg = averageEngagement(shortPosts)
    const longAvg = averageEngagement(longPosts)
    const diff = shortAvg - longAvg
    if (Math.abs(diff) > 0.1) {
      patterns.push({
        dimension: 'length', value: diff > 0 ? 'shorter' : 'longer',
        signal: (shortPosts.length + longPosts.length) >= MIN_SAMPLES_FOR_MODERATE ? 'moderate' : 'weak',
        sampleSize: shortPosts.length + longPosts.length, metric: 'engagement_diff', score: Math.abs(diff),
        description: diff > 0
          ? `Shorter posts tend to perform better (${shortPosts.length} vs ${longPosts.length} samples).`
          : `Longer posts tend to perform better (${longPosts.length} vs ${shortPosts.length} samples).`,
      })
    }
  }

  const withSaves = withMetrics.filter((h) => h.saves !== null && h.saves > 0)
  if (withSaves.length >= 3) {
    const avgSaves = withSaves.reduce((sum, h) => sum + (h.saves ?? 0), 0) / withSaves.length
    patterns.push({
      dimension: 'quality_signal', value: 'high_save_rate',
      signal: withSaves.length >= MIN_SAMPLES_FOR_MODERATE ? 'moderate' : 'weak',
      sampleSize: withSaves.length, metric: 'avg_saves', score: Math.min(avgSaves / 50, 1),
      description: `Average ${avgSaves.toFixed(1)} saves per post (${withSaves.length} posts).`,
    })
  }

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

export function buildPerformancePromptBlock(insights: PerformanceInsights): string {
  if (!insights.hasEnoughData || insights.patterns.length === 0) return ''
  const strongPatterns = insights.patterns.filter((p) => p.signal === 'strong' || p.signal === 'moderate')
  if (strongPatterns.length === 0) return ''
  const sections = strongPatterns.slice(0, 3).map((p) => `- ${p.description}`)
  if (sections.length === 0) return ''
  return `PERFORMANCE PATTERNS (weak signals, not rules):\n${sections.join('\n')}`
}

export function adjustOpportunityConfidence(
  baseConfidence: number,
  opportunityType: string,
  insights: PerformanceInsights,
): number {
  if (!insights.hasEnoughData) return baseConfidence
  const relevantPatterns = insights.patterns.filter((p) => p.signal === 'strong' || p.signal === 'moderate')
  if (relevantPatterns.length === 0) return baseConfidence
  let adjustment = 0
  for (const pattern of relevantPatterns) {
    if (pattern.dimension === 'topic' && pattern.score > 0.5) {
      adjustment += 0.02 * (pattern.signal === 'strong' ? 2 : 1)
    }
  }
  adjustment = Math.min(0.1, Math.max(-0.1, adjustment))
  return Math.min(1, Math.max(0, baseConfidence + adjustment))
}

function averageEngagement(entries: ContentHistoryEntry[]): number {
  if (entries.length === 0) return 0
  let totalScore = 0
  let count = 0
  for (const entry of entries) {
    const engagement = computeEngagementScore(entry)
    if (engagement > 0) { totalScore += engagement; count++ }
  }
  return count > 0 ? totalScore / count : 0
}

function computeEngagementScore(entry: ContentHistoryEntry): number {
  let score = 0
  let signals = 0
  if (entry.likes !== null && entry.reach !== null && entry.reach > 0) {
    score += Math.min((entry.likes / entry.reach) * 10, 1); signals++
  } else if (entry.likes !== null) { score += Math.min(entry.likes / 100, 1); signals++ }
  if (entry.comments !== null && entry.reach !== null && entry.reach > 0) {
    score += Math.min((entry.comments / entry.reach) * 50, 1); signals++
  } else if (entry.comments !== null) { score += Math.min(entry.comments / 20, 1); signals++ }
  if (entry.saves !== null) { score += Math.min(entry.saves / 30, 1) * 1.2; signals++ }
  if (entry.reposts !== null) { score += Math.min(entry.reposts / 15, 1); signals++ }
  return signals > 0 ? score / signals : 0
}

function formatEngagement(score: number): string {
  if (score >= 0.7) return 'high'
  if (score >= 0.4) return 'moderate'
  if (score > 0) return 'low'
  return 'no measurable'
}

// ─── Layer 2: Performance Signals (automated brief generation) ────────────────

export interface PerformanceProfile {
  totalPosts: number
  postsWithMetrics: number
  avgEngagementRate: number
  bestHooks: Array<{ pattern: string; avgReach: number; count: number }>
  bestTopics: Array<{ topic: string; avgReach: number; count: number }>
  optimalLength: { min: number; max: number; avg: number }
  opinionVsEducational: number
  trendVsEvergreen: number
  confidence: number
  platformBreakdown: Record<string, { count: number; avgReach: number }>
}

export interface PerformanceSignal {
  scoreMultiplier: number
  guidance: string[]
  favorTopics: string[]
  avoidTopics: string[]
}

export async function buildPerformanceProfile(
  store: ScoutStore,
  personaId: string,
): Promise<PerformanceProfile> {
  const history = await store.listContentHistory(personaId, 100)
  const withMetrics = history.filter(h => h.reach && h.reach > 0)

  if (withMetrics.length === 0) return emptyProfile(history.length)

  return {
    totalPosts: history.length,
    postsWithMetrics: withMetrics.length,
    avgEngagementRate: mean(withMetrics.map(h => computeEngagementRate(h))),
    bestHooks: analyzeHookPerformance(withMetrics).slice(0, 5),
    bestTopics: analyzeTopicPerformance(withMetrics).slice(0, 5),
    optimalLength: analyzeLengthPerformance(withMetrics),
    opinionVsEducational: analyzeOpinionBias(withMetrics),
    trendVsEvergreen: analyzeTrendBias(withMetrics),
    confidence: Math.min(1.0, withMetrics.length / 20),
    platformBreakdown: analyzePlatformBreakdown(withMetrics),
  }
}

export function derivePerformanceSignals(profile: PerformanceProfile): PerformanceSignal {
  if (profile.confidence < 0.1 || profile.postsWithMetrics < 3) {
    return { scoreMultiplier: 1.0, guidance: [], favorTopics: [], avoidTopics: [] }
  }

  const guidance: string[] = []
  const favorTopics: string[] = []

  if (profile.bestHooks.length > 0) {
    guidance.push(`Your "${profile.bestHooks[0].pattern}" style hooks average ${Math.round(profile.bestHooks[0].avgReach)} reach.`)
  }
  if (profile.optimalLength.avg > 0) {
    guidance.push(`Your best-performing posts are ~${Math.round(profile.optimalLength.avg)} words.`)
  }
  if (profile.opinionVsEducational > 0.3) {
    guidance.push('Your opinionated posts outperform educational ones. Lead with your take.')
    favorTopics.push('opinion', 'contrarian', 'hot take')
  } else if (profile.opinionVsEducational < -0.3) {
    guidance.push('Your educational posts outperform opinion pieces. Teach something specific.')
    favorTopics.push('tutorial', 'how-to', 'lesson')
  }
  if (profile.trendVsEvergreen > 0.3) {
    guidance.push('Your trending topic posts get more reach. Prioritize timely signals.')
  } else if (profile.trendVsEvergreen < -0.3) {
    guidance.push('Your evergreen content outperforms trends. Depth over timeliness.')
  }
  for (const topic of profile.bestTopics.slice(0, 3)) {
    favorTopics.push(topic.topic)
  }

  return { scoreMultiplier: 1.0, guidance, favorTopics, avoidTopics: [] }
}

function computeEngagementRate(entry: ContentHistoryEntry): number {
  const reach = entry.reach ?? 1
  const engagements = (entry.likes ?? 0) + (entry.comments ?? 0) * 2 + (entry.reposts ?? 0) * 3 + (entry.saves ?? 0) * 2
  return reach > 0 ? engagements / reach : 0
}

function analyzeHookPerformance(entries: ContentHistoryEntry[]): PerformanceProfile['bestHooks'] {
  const hookGroups = new Map<string, number[]>()
  for (const entry of entries) {
    const hook = entry.openingLine.split(/\s+/).slice(0, 10).join(' ').toLowerCase()
    if (hook.length < 5) continue
    const reaches = hookGroups.get(hook) ?? []
    reaches.push(entry.reach ?? 0)
    hookGroups.set(hook, reaches)
  }
  return Array.from(hookGroups.entries())
    .map(([pattern, reaches]) => ({ pattern: pattern.slice(0, 50), avgReach: mean(reaches), count: reaches.length }))
    .filter(h => h.count >= 2)
    .sort((a, b) => b.avgReach - a.avgReach)
}

function analyzeTopicPerformance(entries: ContentHistoryEntry[]): PerformanceProfile['bestTopics'] {
  const topicGroups = new Map<string, number[]>()
  for (const entry of entries) {
    const words = entry.openingLine.toLowerCase().split(/\s+/).filter(w => w.length > 4 && !ANALYSIS_STOP_WORDS.has(w))
    for (const word of words.slice(0, 3)) {
      const reaches = topicGroups.get(word) ?? []
      reaches.push(entry.reach ?? 0)
      topicGroups.set(word, reaches)
    }
  }
  return Array.from(topicGroups.entries())
    .map(([topic, reaches]) => ({ topic, avgReach: mean(reaches), count: reaches.length }))
    .filter(t => t.count >= 2)
    .sort((a, b) => b.avgReach - a.avgReach)
}

function analyzeLengthPerformance(entries: ContentHistoryEntry[]): { min: number; max: number; avg: number } {
  const lengths = entries.map(e => e.openingLine.split(/\s+/).length)
  if (lengths.length === 0) return { min: 0, max: 0, avg: 0 }
  const sorted = [...entries].sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
  const topQuarter = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 4)))
  const topLengths = topQuarter.map(e => e.openingLine.split(/\s+/).length)
  return { min: Math.min(...topLengths), max: Math.max(...topLengths), avg: Math.round(mean(topLengths)) }
}

function analyzeOpinionBias(entries: ContentHistoryEntry[]): number {
  const opinionWords = ['wrong', 'myth', 'truth', 'actually', 'never', 'always', 'best', 'worst', 'hate', 'love', 'should', 'must']
  let opinionReach = 0, opinionCount = 0, educationalReach = 0, educationalCount = 0
  for (const entry of entries) {
    const isOpinion = opinionWords.some(w => entry.openingLine.toLowerCase().includes(w))
    if (isOpinion) { opinionReach += entry.reach ?? 0; opinionCount++ }
    else { educationalReach += entry.reach ?? 0; educationalCount++ }
  }
  if (opinionCount === 0 || educationalCount === 0) return 0
  const maxReach = Math.max(opinionReach / opinionCount, educationalReach / educationalCount, 1)
  return (opinionReach / opinionCount - educationalReach / educationalCount) / maxReach
}

function analyzeTrendBias(entries: ContentHistoryEntry[]): number {
  const trendWords = ['today', 'just', 'new', 'launch', 'release', 'announce', 'breaking', 'update', 'now']
  let trendReach = 0, trendCount = 0, evergreenReach = 0, evergreenCount = 0
  for (const entry of entries) {
    const isTrend = trendWords.some(w => entry.openingLine.toLowerCase().includes(w))
    if (isTrend) { trendReach += entry.reach ?? 0; trendCount++ }
    else { evergreenReach += entry.reach ?? 0; evergreenCount++ }
  }
  if (trendCount === 0 || evergreenCount === 0) return 0
  const maxReach = Math.max(trendReach / trendCount, evergreenReach / evergreenCount, 1)
  return (trendReach / trendCount - evergreenReach / evergreenCount) / maxReach
}

function analyzePlatformBreakdown(entries: ContentHistoryEntry[]): Record<string, { count: number; avgReach: number }> {
  const groups: Record<string, number[]> = {}
  for (const entry of entries) {
    const platform = entry.platform ?? 'linkedin'
    const reaches = groups[platform] ?? []
    reaches.push(entry.reach ?? 0)
    groups[platform] = reaches
  }
  const result: Record<string, { count: number; avgReach: number }> = {}
  for (const [platform, reaches] of Object.entries(groups)) {
    result[platform] = { count: reaches.length, avgReach: mean(reaches) }
  }
  return result
}

function emptyProfile(totalPosts: number): PerformanceProfile {
  return {
    totalPosts, postsWithMetrics: 0, avgEngagementRate: 0,
    bestHooks: [], bestTopics: [], optimalLength: { min: 0, max: 0, avg: 0 },
    opinionVsEducational: 0, trendVsEvergreen: 0, confidence: 0, platformBreakdown: {},
  }
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

const ANALYSIS_STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off',
  'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
  'or', 'if', 'while', 'that', 'this', 'it', 'its', 'i', 'me', 'my',
  'we', 'our', 'you', 'your', 'they', 'them', 'what', 'which', 'who',
  'whom', 'these', 'those', 'am', 'about', 'up', 'down',
])
