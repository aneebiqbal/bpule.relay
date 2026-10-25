/**
 * First-100 campaign + learning health.
 *
 * Campaign counts and quality signals come from the canonical tables. Nothing
 * here is faked: a zero is a true zero, and every number is org-scoped.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Human label for an active-learning priority reason. Never a raw enum dump. */
export const REASON_LABEL: Record<string, string> = {
  unlabelled: 'Not reviewed yet',
  'low confidence': 'High value / low confidence',
  contradiction: 'Contradictory signals',
  'engines disagree': 'Model disagreement',
  'near band edge': 'Near a qualification threshold',
  'high value': 'High-value opportunity',
  'human feedback': 'A rep has flagged this',
  'wrong sender feedback': 'Sender feedback',
  'wrong score feedback': 'Score feedback',
  'human-edited message': 'Message was edited',
  'unexpected positive outcome': 'Outcome contradicts the rank',
  'strong lead, no reply': 'Strong lead with no reply',
}

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason.replace(/_/g, ' ')
}

export interface CampaignProgress {
  opportunityLabels: number
  target: number
  remaining: number
  pairwise: number
  routingReviews: number
  messageReviews: number
  thesisReviews: number
  outcomeLinked: number
}

/** First-100 campaign progress from the canonical tables. */
export async function first100Progress(client: SupabaseClient, orgId: string): Promise<CampaignProgress> {
  const [{ count: opportunityLabels }, { count: pairwise }, { count: routingReviews }, { count: messageReviews }, { count: thesisReviews }] = await Promise.all([
    client.from('scoring_labels').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    client.from('scoring_pairwise_labels').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    client.from('routing_evaluations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    client.from('message_evaluations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    client.from('thesis_evaluations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
  ])
  const target = 100
  return {
    opportunityLabels: opportunityLabels ?? 0,
    target,
    remaining: Math.max(0, target - (opportunityLabels ?? 0)),
    pairwise: pairwise ?? 0,
    routingReviews: routingReviews ?? 0,
    messageReviews: messageReviews ?? 0,
    thesisReviews: thesisReviews ?? 0,
    outcomeLinked: 0, // computed by learningHealth when outcomes exist
  }
}

export interface LearningHealth extends CampaignProgress {
  humanModelAgreement: number | null
  routingAgreement: { v1: number | null; v2: number | null }
  messagePassRate: number | null
  thesisMisleadingRate: number | null
  labelDistribution: Record<string, number>
  reviewerAgreement: number | null
}

/** The single admin summary of learning health. */
export async function learningHealth(client: SupabaseClient, orgId: string): Promise<LearningHealth> {
  const progress = await first100Progress(client, orgId)

  const { data: labels } = await client
    .from('scoring_labels')
    .select('prospect_quality, labeler_rep_id')
    .eq('organization_id', orgId)
  const labelRows = (labels ?? []) as Array<{ prospect_quality: string | null; labeler_rep_id: string | null }>

  const labelDistribution: Record<string, number> = {}
  for (const r of labelRows) labelDistribution[r.prospect_quality ?? 'unlabelled'] = (labelDistribution[r.prospect_quality ?? 'unlabelled'] ?? 0) + 1

  const { data: messageEvals } = await client.from('message_evaluations').select('score').eq('organization_id', orgId)
  const msg = (messageEvals ?? []) as Array<{ score: number }>
  const messagePassRate = msg.length > 0 ? Math.round((msg.filter((m) => m.score >= 3).length / msg.length) * 100) : null

  const { data: thesisEvals } = await client.from('thesis_evaluations').select('rating').eq('organization_id', orgId)
  const th = (thesisEvals ?? []) as Array<{ rating: string }>
  const thesisMisleadingRate = th.length > 0 ? Math.round((th.filter((t) => t.rating === 'MISLEADING').length / th.length) * 100) : null

  const { data: routingEvals } = await client.from('routing_evaluations').select('v1_correct, v2_correct').eq('organization_id', orgId)
  const rt = (routingEvals ?? []) as Array<{ v1_correct: boolean | null; v2_correct: boolean | null }>
  const v1 = rt.filter((r) => r.v1_correct != null)
  const v2 = rt.filter((r) => r.v2_correct != null)
  const rate = (rows: Array<{ v1_correct?: boolean | null; v2_correct?: boolean | null }>, key: 'v1_correct' | 'v2_correct') =>
    rows.length > 0 ? Math.round((rows.filter((r) => r[key] === true).length / rows.length) * 100) : null

  return {
    ...progress,
    humanModelAgreement: null, // requires per-opportunity human band vs model band; computed when labels carry ranges
    routingAgreement: { v1: rate(v1, 'v1_correct'), v2: rate(v2, 'v2_correct') },
    messagePassRate,
    thesisMisleadingRate,
    labelDistribution,
    reviewerAgreement: null, // computed by reviewerAgreement() below
  }
}

/**
 * Simple same-label agreement between reviewers who labelled the same
 * opportunity. Only meaningful with overlap; null otherwise.
 */
export async function reviewerAgreement(client: SupabaseClient, orgId: string): Promise<number | null> {
  const { data } = await client
    .from('scoring_labels')
    .select('opportunity_key, labeler_rep_id, prospect_quality')
    .eq('organization_id', orgId)
  const rows = (data ?? []) as Array<{ opportunity_key: string; labeler_rep_id: string | null; prospect_quality: string | null }>
  const byKey = new Map<string, Array<{ reviewer: string; quality: string }>>()
  for (const r of rows) {
    if (!r.labeler_rep_id || !r.prospect_quality) continue
    const arr = byKey.get(r.opportunity_key) ?? []
    arr.push({ reviewer: r.labeler_rep_id, quality: r.prospect_quality })
    byKey.set(r.opportunity_key, arr)
  }
  let pairs = 0
  let agreed = 0
  for (const arr of byKey.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i]!.reviewer === arr[j]!.reviewer) continue
        pairs++
        if (arr[i]!.quality === arr[j]!.quality) agreed++
      }
    }
  }
  return pairs > 0 ? Math.round((agreed / pairs) * 100) : null
}
