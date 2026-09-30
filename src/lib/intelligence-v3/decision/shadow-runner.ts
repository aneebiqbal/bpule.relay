/**
 * Shadow Runner — V3
 *
 * Runs V3 decision alongside production V2 without affecting user-visible results.
 * Stores both outcomes for comparison and calibration.
 *
 * After sufficient real examples:
 * - Compare production vs V3
 * - Manually inspect disagreements
 * - Add true failures to golden set
 * - Then switch V3 to canonical
 */

import type { V3LeadDecisionPacket, V3ShadowComparison } from '../types'

export interface V3ShadowResult {
  /** Production (V2) decision */
  production: {
    score: number
    action: string
    qualification?: string
  }
  /** V3 decision */
  v3: V3LeadDecisionPacket
  /** Comparison */
  comparison: V3ShadowComparison
  /** Whether this should be flagged for review */
  flagged: boolean
  flagReason?: string
}

const FLAG_THRESHOLD = 15

export function compareShadow(
  productionScore: number,
  productionAction: string,
  productionQualification: string | undefined,
  v3Packet: V3LeadDecisionPacket,
): V3ShadowResult {
  const scoreDelta = v3Packet.score - productionScore
  const actionChanged = v3Packet.action !== productionAction
  const flagged = Math.abs(scoreDelta) >= FLAG_THRESHOLD || actionChanged

  const reasons: string[] = []
  if (Math.abs(scoreDelta) >= FLAG_THRESHOLD) {
    reasons.push(`Score delta: ${scoreDelta > 0 ? '+' : ''}${scoreDelta}`)
  }
  if (actionChanged) {
    reasons.push(`Action changed: ${productionAction} → ${v3Packet.action}`)
  }

  return {
    production: {
      score: productionScore,
      action: productionAction,
      qualification: productionQualification,
    },
    v3: v3Packet,
    comparison: {
      productionScore,
      productionAction,
      v3Score: v3Packet.score,
      v3Action: v3Packet.action,
      scoreDelta,
      actionChanged,
      productionDecision: productionQualification ?? null,
    },
    flagged,
    flagReason: flagged ? reasons.join('; ') : undefined,
  }
}

export interface V3ShadowStats {
  total: number
  scoreDeltas: number[]
  actionChanges: number
  flaggedCount: number
  avgDelta: number
  maxDelta: number
  v3HigherCount: number
  v3LowerCount: number
}

export function computeShadowStats(results: V3ShadowResult[]): V3ShadowStats {
  const deltas = results.map((r) => r.comparison.scoreDelta)
  return {
    total: results.length,
    scoreDeltas: deltas,
    actionChanges: results.filter((r) => r.comparison.actionChanged).length,
    flaggedCount: results.filter((r) => r.flagged).length,
    avgDelta: deltas.length > 0 ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : 0,
    maxDelta: deltas.length > 0 ? Math.max(...deltas.map(Math.abs)) : 0,
    v3HigherCount: deltas.filter((d) => d > 0).length,
    v3LowerCount: deltas.filter((d) => d < 0).length,
  }
}

/**
 * Generate a markdown report of shadow comparison results.
 * Used for audit-reports/decision-v3/shadow-comparison.md
 */
export function generateShadowReport(results: V3ShadowResult[]): string {
  const stats = computeShadowStats(results)
  const lines: string[] = []

  lines.push('# V3 Shadow Comparison Report')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Total leads compared: ${stats.total}`)
  lines.push(`- Average score delta: ${stats.avgDelta > 0 ? '+' : ''}${stats.avgDelta}`)
  lines.push(`- Max score delta: ±${stats.maxDelta}`)
  lines.push(`- V3 scored higher: ${stats.v3HigherCount}`)
  lines.push(`- V3 scored lower: ${stats.v3LowerCount}`)
  lines.push(`- Action changed: ${stats.actionChanges}`)
  lines.push(`- Flagged for review: ${stats.flaggedCount}`)

  if (stats.flaggedCount > 0) {
    lines.push('')
    lines.push('## Flagged Cases')
    lines.push('')
    for (const result of results.filter((r) => r.flagged)) {
      lines.push(`- Score: ${result.production.score} → ${result.v3.score} (Δ${result.comparison.scoreDelta > 0 ? '+' : ''}${result.comparison.scoreDelta})`)
      lines.push(`  Action: ${result.production.action} → ${result.v3.action}`)
      lines.push(`  Reason: ${result.flagReason}`)
      lines.push(`  V3 reasons: ${result.v3.reasons.join(', ')}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}
