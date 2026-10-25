/**
 * Admin QA view data (Day 4 / 5 / 5.25).
 *
 * Three read-only views the QA center consumes:
 *   - routing v1/v2 comparison + flags
 *   - current/stale/unscored score coverage
 *   - unverified conversation threads awaiting review
 *
 * All org-scoped. Nothing here promotes v2 or writes a score.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildRoutingComparison, type RoutingComparisonView } from '@/lib/relay/routing-comparison'
import { loadSenderProfiles, parsePacket } from '@/lib/relay/routing-context'
import { analyzeScoreStaleness } from '@/lib/intelligence-v3/score-staleness'

export interface RoutingQARow extends RoutingComparisonView {
  company: string
}

/** v1/v2 comparison for the org's scored leads. */
export async function routingComparisonViews(
  client: SupabaseClient,
  orgId: string,
  repId: string,
  limit = 50,
): Promise<{ rows: RoutingQARow[]; routingVersion: string | null; compareVersion: string }> {
  const { data: leads } = await client
    .from('leads')
    .select('id, company, sender_profile_id, canonical_intelligence')
    .eq('organization_id', orgId)
    .not('canonical_intelligence', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  const senders = await loadSenderProfiles(client, orgId, repId)

  const rows: RoutingQARow[] = []
  let routingVersion: string | null = null
  for (const lead of (leads ?? []) as Array<{ id: string; company: string; sender_profile_id: string | null; canonical_intelligence: unknown }>) {
    const view = buildRoutingComparison({
      lead: {
        id: lead.id,
        company: lead.company,
        senderProfileId: lead.sender_profile_id ?? null,
        canonicalIntelligence: (lead.canonical_intelligence ?? null) as Record<string, unknown> | null,
      },
      senders,
      platform: 'linkedin',
    })
    if (!view) continue
    routingVersion = routingVersion ?? view.routingVersion
    rows.push({ ...view, company: lead.company })
  }
  return { rows, routingVersion, compareVersion: rows[0]?.compareVersion ?? 'routing_compare_v1' }
}

/** Current / stale / unscored score coverage for the org. */
export async function scoringCoverage(client: SupabaseClient, orgId: string) {
  const { data: rows } = await client
    .from('leads')
    .select('score_version, scored_at')
    .eq('organization_id', orgId)
  return analyzeScoreStaleness((rows ?? []) as Array<{ scoreVersion?: string | null; scoredAt?: string | null }>)
}

/** Unverified conversation threads awaiting identity review. */
export async function unverifiedThreads(client: SupabaseClient, orgId: string, limit = 50) {
  const { data, error } = await client
    .from('messages')
    .select('id, lead_id, sent_text, sent_at, thread_status, sender_profile_id')
    .eq('organization_id', orgId)
    .eq('direction', 'inbound')
    .eq('thread_status', 'UNVERIFIED')
    .order('sent_at', { ascending: false })
    .limit(limit)
  if (error) return { threads: [] as Array<Record<string, unknown>>, unavailable: true }
  return { threads: (data ?? []) as Array<Record<string, unknown>>, unavailable: false }
}

/** Lead ids whose packet is not current (for a controlled re-analysis report). */
export async function staleLeadIds(client: SupabaseClient, orgId: string, limit = 500): Promise<string[]> {
  const { data: rows } = await client
    .from('leads')
    .select('id, score_version')
    .eq('organization_id', orgId)
    .not('score_version', 'is', null)
    .limit(limit)
  const { SCORING_VERSION } = await import('@/lib/intelligence-v3/versions')
  return (rows ?? [])
    .filter((r) => (r as { score_version: string }).score_version !== SCORING_VERSION)
    .map((r) => (r as { id: string }).id)
}
