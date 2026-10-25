/**
 * Score staleness (Phase 14).
 *
 * A stored packet is current only when its scoring version matches the running
 * scorer. This reports current/stale coverage, the stale-version breakdown and
 * the oldest stale score, so admin QA never treats a stale packet as current.
 */

import { SCORING_VERSION } from './versions'

export interface ScoreStalenessReport {
  total: number
  current: number
  stale: number
  unscored: number
  staleByVersion: Record<string, number>
  oldestStaleAt: string | null
  maxStaleAgeDays: number | null
}

export function analyzeScoreStaleness(
  rows: Array<{ scoreVersion?: string | null; scoredAt?: string | null }>,
  now: Date = new Date(),
): ScoreStalenessReport {
  let current = 0
  let stale = 0
  let unscored = 0
  const staleByVersion: Record<string, number> = {}
  let oldestStaleAt: string | null = null

  for (const row of rows) {
    const version = row.scoreVersion ?? null
    if (!version) {
      unscored++
      continue
    }
    if (version === SCORING_VERSION) {
      current++
      continue
    }
    stale++
    staleByVersion[version] = (staleByVersion[version] ?? 0) + 1
    if (row.scoredAt && (!oldestStaleAt || row.scoredAt < oldestStaleAt)) oldestStaleAt = row.scoredAt
  }

  let maxStaleAgeDays: number | null = null
  if (oldestStaleAt) {
    const ageMs = now.getTime() - new Date(oldestStaleAt).getTime()
    if (Number.isFinite(ageMs)) maxStaleAgeDays = Math.max(0, Math.floor(ageMs / 86_400_000))
  }

  return {
    total: rows.length,
    current,
    stale,
    unscored,
    staleByVersion,
    oldestStaleAt,
    maxStaleAgeDays,
  }
}
