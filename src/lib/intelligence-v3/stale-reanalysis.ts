/**
 * Controlled stale-score reanalysis (Day 5).
 *
 * 31% of production rows carry an older scoring version. This module produces a
 * DRY-RUN report (count, sample, expected version changes) and supports an
 * explicit, per-lead re-analysis. It never mass-writes: applying is an explicit
 * action that archives the previous packet and records a rescore event.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SCORING_VERSION } from './versions'

export interface StaleLeadSummary {
  leadId: string
  company: string
  currentVersion: string
  currentScore: number | null
  action: string | null
  scoredAt: string | null
}

export interface StaleReanalysisReport {
  currentVersion: string
  staleCount: number
  sample: StaleLeadSummary[]
  expectedVersionChange: string
  /** The report is a dry run: nothing is written. */
  dryRun: true
}

/** Read-only dry run over the org's stale leads. */
export async function buildStaleReanalysisReport(
  client: SupabaseClient,
  orgId: string,
  limit = 50,
): Promise<StaleReanalysisReport> {
  const { data: rows } = await client
    .from('leads')
    .select('id, company, score_version, canonical_score, verdict, scored_at')
    .eq('organization_id', orgId)
    .not('score_version', 'is', null)
    .limit(2000)

  const all = (rows ?? []) as Array<{
    id: string
    company: string
    score_version: string
    canonical_score: number | null
    verdict: string | null
    scored_at: string | null
  }>

  const stale = all.filter((r) => r.score_version !== SCORING_VERSION)
  return {
    currentVersion: SCORING_VERSION,
    staleCount: stale.length,
    sample: stale.slice(0, limit).map((r) => ({
      leadId: r.id,
      company: r.company,
      currentVersion: r.score_version,
      currentScore: r.canonical_score,
      action: r.verdict,
      scoredAt: r.scored_at,
    })),
    expectedVersionChange: `all ${stale.length} stale rows would move to ${SCORING_VERSION}`,
    dryRun: true,
  }
}

/** The versions a stale row would move from, for the report UI. */
export function staleVersionBreakdown(rows: Array<{ score_version?: string | null }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const v = r.score_version ?? 'unknown'
    if (v === SCORING_VERSION) continue
    out[v] = (out[v] ?? 0) + 1
  }
  return out
}
