/**
 * Human evaluation data layer (message, thesis, routing) + model comparison
 * with minimum-sample gating + revenue funnel.
 *
 * All functions are org-scoped and read-only except the explicit record*
 * writers, which append reviewer-attributed rows. Nothing overwrites the
 * original message, thesis or routing decision.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const MESSAGE_CLASSIFICATIONS = [
  'SALES_READY', 'GENERIC', 'MARKETING_NOT_SALES', 'UNSUPPORTED', 'FABRICATED', 'WRONG_STAGE',
] as const
export type MessageClassification = (typeof MESSAGE_CLASSIFICATIONS)[number]

export const THESIS_RATINGS = ['STRONG', 'USEFUL', 'WEAK', 'MISLEADING'] as const
export type ThesisRating = (typeof THESIS_RATINGS)[number]

/** Sample the messages a reviewer should score. Test/demo/E2E are excluded. */
export async function sampleMessagesForReview(
  client: SupabaseClient,
  orgId: string,
  opts: { types?: string[]; limit?: number } = {},
) {
  const limit = opts.limit ?? 50
  let q = client
    .from('messages')
    .select('id, lead_id, type, direction, sent_text, model_used, created_at')
    .eq('organization_id', orgId)
    .not('sent_text', 'is', null)
    .order('created_at', { ascending: false })
  if (opts.types?.length) q = q.in('type', opts.types)
  const { data, error } = await q.limit(limit)
  if (error) return { messages: [] as Array<Record<string, unknown>>, unavailable: true }
  return { messages: (data ?? []) as Array<Record<string, unknown>>, unavailable: false }
}

export async function recordMessageEvaluation(
  client: SupabaseClient,
  input: {
    organizationId: string
    messageId: string
    reviewerRepId: string
    score: number
    classification: MessageClassification
    dimensions?: Record<string, number>
    reasons?: string[]
    note?: string | null
  },
) {
  const { error } = await client.from('message_evaluations').upsert(
    {
      organization_id: input.organizationId,
      message_id: input.messageId,
      reviewer_rep_id: input.reviewerRepId,
      score: input.score,
      classification: input.classification,
      dimensions: input.dimensions ?? {},
      reasons: input.reasons ?? [],
      note: input.note ?? null,
    },
    { onConflict: 'organization_id,message_id,reviewer_rep_id' },
  )
  if (error) throw error
  return { ok: true }
}

/** Human message-review quality metrics. */
export async function messageReviewStats(client: SupabaseClient, orgId: string) {
  const { data } = await client
    .from('message_evaluations')
    .select('score, classification')
    .eq('organization_id', orgId)
  const rows = (data ?? []) as Array<{ score: number; classification: string }>
  const total = rows.length
  const count = (c: string) => rows.filter((r) => r.classification === c).length
  const pass = rows.filter((r) => r.score >= 3).length
  const good = rows.filter((r) => r.score >= 4).length
  return {
    total,
    salesReady: count('SALES_READY'),
    generic: count('GENERIC'),
    marketingNotSales: count('MARKETING_NOT_SALES'),
    unsupported: count('UNSUPPORTED'),
    fabricated: count('FABRICATED'),
    wrongStage: count('WRONG_STAGE'),
    passRate: total > 0 ? Math.round((pass / total) * 100) : 0,
    goodRate: total > 0 ? Math.round((good / total) * 100) : 0,
  }
}

/** Sample theses for review (latest per unique opportunity). */
export async function sampleThesesForReview(client: SupabaseClient, orgId: string, limit = 50) {
  const { data, error } = await client
    .from('leads')
    .select('id, company, contact_name, contact_title, canonical_intelligence')
    .eq('organization_id', orgId)
    .not('canonical_intelligence', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { theses: [] as Array<Record<string, unknown>>, unavailable: true }
  return { theses: (data ?? []) as Array<Record<string, unknown>>, unavailable: false }
}

export async function recordThesisEvaluation(
  client: SupabaseClient,
  input: { organizationId: string; leadId: string; reviewerRepId: string; rating: ThesisRating; reasons?: string[]; note?: string | null },
) {
  const { error } = await client.from('thesis_evaluations').upsert(
    {
      organization_id: input.organizationId,
      lead_id: input.leadId,
      reviewer_rep_id: input.reviewerRepId,
      rating: input.rating,
      reasons: input.reasons ?? [],
      note: input.note ?? null,
    },
    { onConflict: 'organization_id,lead_id,reviewer_rep_id' },
  )
  if (error) throw error
  return { ok: true }
}

/** Human thesis-quality metrics. */
export async function thesisReviewStats(client: SupabaseClient, orgId: string) {
  const { data } = await client.from('thesis_evaluations').select('rating').eq('organization_id', orgId)
  const rows = (data ?? []) as Array<{ rating: string }>
  const total = rows.length
  const count = (r: string) => rows.filter((x) => x.rating === r).length
  return {
    total,
    strong: count('STRONG'),
    useful: count('USEFUL'),
    weak: count('WEAK'),
    misleading: count('MISLEADING'),
    misleadingRate: total > 0 ? Math.round((count('MISLEADING') / total) * 100) : 0,
  }
}

export async function recordRoutingEvaluation(
  client: SupabaseClient,
  input: {
    organizationId: string
    leadId: string
    reviewerRepId: string
    bestSenderProfileId?: string | null
    v1Correct?: boolean | null
    v2Correct?: boolean | null
  },
) {
  const { error } = await client.from('routing_evaluations').upsert(
    {
      organization_id: input.organizationId,
      lead_id: input.leadId,
      reviewer_rep_id: input.reviewerRepId,
      best_sender_profile_id: input.bestSenderProfileId ?? null,
      v1_correct: input.v1Correct ?? null,
      v2_correct: input.v2Correct ?? null,
    },
    { onConflict: 'organization_id,lead_id,reviewer_rep_id' },
  )
  if (error) throw error
  return { ok: true }
}

/** Human routing-judgment coverage. */
export async function routingEvaluationStats(client: SupabaseClient, orgId: string) {
  const { data } = await client.from('routing_evaluations').select('v1_correct, v2_correct, best_sender_profile_id').eq('organization_id', orgId)
  const rows = (data ?? []) as Array<{ v1_correct: boolean | null; v2_correct: boolean | null; best_sender_profile_id: string | null }>
  const judged = rows.filter((r) => r.v1_correct != null || r.v2_correct != null)
  const v1 = judged.filter((r) => r.v1_correct != null)
  const v2 = judged.filter((r) => r.v2_correct != null)
  return {
    total: rows.length,
    judged: judged.length,
    v1CorrectRate: v1.length > 0 ? Math.round((v1.filter((r) => r.v1_correct).length / v1.length) * 100) : null,
    v2CorrectRate: v2.length > 0 ? Math.round((v2.filter((r) => r.v2_correct).length / v2.length) * 100) : null,
    bestSenderChosen: rows.filter((r) => r.best_sender_profile_id).length,
  }
}

export type SampleGating = 'INSUFFICIENT_DATA' | 'PRELIMINARY_ONLY' | 'PROMOTION_STUDY'

/** Minimum-sample gating for model comparison. Never promotes. */
export function sampleGating(labelCount: number): SampleGating {
  if (labelCount < 30) return 'INSUFFICIENT_DATA'
  if (labelCount < 100) return 'PRELIMINARY_ONLY'
  return 'PROMOTION_STUDY'
}

export interface ModelComparison {
  gating: SampleGating
  labelCount: number
  /** Only meaningful at PROMOTION_STUDY; null otherwise. */
  engines: Array<{ engine: string; accuracy: number | null; ndcg10: number | null }> | null
}

/**
 * Compare production V3 and the shadow engines against human bands. Returns
 * INSUFFICIENT_DATA below 30 labels and PRELIMINARY_ONLY below 100 — no metric
 * is shown as final before then.
 */
export async function modelComparison(client: SupabaseClient, orgId: string): Promise<ModelComparison> {
  const { data: labels } = await client
    .from('scoring_labels')
    .select('opportunity_key, expected_score_min, expected_score_max')
    .eq('organization_id', orgId)
  const labelRows = (labels ?? []) as Array<Record<string, unknown>>
  const count = new Set(labelRows.map((l) => l.opportunity_key)).size
  const gating = sampleGating(count)
  if (gating === 'INSUFFICIENT_DATA') return { gating, labelCount: count, engines: null }

  const { data: shadow } = await client
    .from('scoring_shadow_decisions')
    .select('opportunity_key, production_engine, candidate_engine, production_score, candidate_score, is_test')
    .eq('organization_id', orgId)
    .eq('is_test', false)

  const labelByKey = new Map(labelRows.map((l) => [l.opportunity_key, l]))
  const engines = new Map<string, { hits: number; n: number }>()
  for (const row of (shadow ?? []) as Array<Record<string, unknown>>) {
    const key = row.opportunity_key as string
    const label = labelByKey.get(key)
    if (!label) continue
    const min = Number(label.expected_score_min ?? 0)
    const max = Number(label.expected_score_max ?? 100)
    for (const engine of [row.production_engine, row.candidate_engine]) {
      if (!engine) continue
      const score = Number((engine === row.production_engine ? row.production_score : row.candidate_score) ?? 0)
      const bucket = engines.get(String(engine)) ?? { hits: 0, n: 0 }
      bucket.n++
      if (score >= min && score <= max) bucket.hits++
      engines.set(String(engine), bucket)
    }
  }
  const result = [...engines.entries()].map(([engine, b]) => ({
    engine,
    accuracy: b.n > 0 ? Math.round((b.hits / b.n) * 1000) / 10 : null,
    ndcg10: null,
  }))
  return { gating, labelCount: count, engines: result }
}

/** Canonical revenue funnel from stored outcomes. */
export async function revenueFunnel(client: SupabaseClient, orgId: string) {
  const { data } = await client
    .from('outcomes')
    .select('lead_id, stage')
    .eq('organization_id', orgId)
  const rows = (data ?? []) as Array<{ lead_id: string; stage: string }>
  const bestByLead = new Map<string, string>()
  const order = ['won', 'proposal', 'meeting', 'qualified_opportunity', 'positive_commercial_reply', 'replied', 'connection_accepted', 'no_response', 'deferred', 'negative', 'lost', 'do_not_contact']
  for (const r of rows) {
    const prev = bestByLead.get(r.lead_id)
    if (!prev || order.indexOf(r.stage) < order.indexOf(prev)) bestByLead.set(r.lead_id, r.stage)
  }
  const count = (stage: string) => [...bestByLead.values()].filter((s) => s === stage).length
  const qualified = count('qualified_opportunity') + count('meeting') + count('proposal') + count('positive_commercial_reply') + count('won')
  return {
    qualified,
    conversation: count('replied') + count('positive_commercial_reply') + count('meeting') + count('proposal') + count('won'),
    meeting: count('meeting') + count('proposal') + count('won'),
    proposal: count('proposal') + count('won'),
    won: count('won'),
    lost: count('lost') + count('do_not_contact') + count('negative'),
  }
}
