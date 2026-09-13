import type { ContentHistoryEntry } from '@/lib/domain/types'

/** Below this many metrics-logged posts, a time-of-day pattern is noise, not signal. */
export const BEST_TIME_MIN_SAMPLES = 10

export type BestTimeResult =
  | { ready: false; loggedCount: number; minRequired: number }
  | { ready: true; loggedCount: number; buckets: BestTimeBucket[]; topHourRange: string }

export interface BestTimeBucket {
  label: string
  hourStart: number
  hourEnd: number
  postCount: number
  avgEngagement: number
}

const HOUR_BUCKETS: Array<{ label: string; start: number; end: number }> = [
  { label: 'Early morning', start: 5, end: 9 },
  { label: 'Late morning', start: 9, end: 12 },
  { label: 'Early afternoon', start: 12, end: 15 },
  { label: 'Late afternoon', start: 15, end: 18 },
  { label: 'Evening', start: 18, end: 22 },
  { label: 'Night', start: 22, end: 5 },
]

function engagementScore(entry: ContentHistoryEntry): number | null {
  const parts = [entry.likes, entry.comments, entry.reposts, entry.saves].filter(
    (v): v is number => typeof v === 'number',
  )
  if (parts.length === 0) return null
  return parts.reduce((sum, v) => sum + v, 0)
}

function bucketForHour(hour: number): (typeof HOUR_BUCKETS)[number] {
  return HOUR_BUCKETS.find((b) => (b.start < b.end ? hour >= b.start && hour < b.end : hour >= b.start || hour < b.end))
    ?? HOUR_BUCKETS[HOUR_BUCKETS.length - 1]
}

/**
 * Personalized best-time-to-post, from this person's own logged history only.
 * Below BEST_TIME_MIN_SAMPLES real logged posts, says plainly there isn't
 * enough data yet rather than showing a pattern from too few points.
 */
export function computeBestTime(history: ContentHistoryEntry[]): BestTimeResult {
  const withMetrics = history.filter((h) => engagementScore(h) !== null)

  if (withMetrics.length < BEST_TIME_MIN_SAMPLES) {
    return { ready: false, loggedCount: withMetrics.length, minRequired: BEST_TIME_MIN_SAMPLES }
  }

  const sums = new Map<string, { total: number; count: number }>()
  for (const entry of withMetrics) {
    const hour = new Date(entry.postedAt).getHours()
    const bucket = bucketForHour(hour)
    const score = engagementScore(entry) ?? 0
    const current = sums.get(bucket.label) ?? { total: 0, count: 0 }
    current.total += score
    current.count += 1
    sums.set(bucket.label, current)
  }

  const buckets: BestTimeBucket[] = HOUR_BUCKETS
    .map((b) => {
      const agg = sums.get(b.label)
      return {
        label: b.label,
        hourStart: b.start,
        hourEnd: b.end,
        postCount: agg?.count ?? 0,
        avgEngagement: agg && agg.count > 0 ? agg.total / agg.count : 0,
      }
    })
    .filter((b) => b.postCount > 0)
    .sort((a, b) => b.avgEngagement - a.avgEngagement)

  const top = buckets[0]
  const topHourRange = top ? formatHourRange(top.hourStart, top.hourEnd) : ''

  return { ready: true, loggedCount: withMetrics.length, buckets, topHourRange }
}

function formatHourRange(start: number, end: number): string {
  const fmt = (h: number) => {
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}${period}`
  }
  return `${fmt(start)}–${fmt(end)}`
}
