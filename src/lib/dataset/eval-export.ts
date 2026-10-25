/**
 * Dataset export V2 — evaluation-specific export modes.
 *
 * Each mode produces the rows a training/evaluation study needs, joined from
 * the canonical tables, with no hidden post-label leakage. All org-scoped and
 * test-data excluded by default.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SCORING_VERSION } from '@/lib/intelligence-v3/versions'

export const EVAL_EXPORT_MODES = [
  'SCORING_EVAL',
  'PAIRWISE_RANKING',
  'ROUTING_EVAL',
  'MESSAGE_QUALITY',
  'THESIS_QUALITY',
  'OUTCOME_TRAINING',
] as const
export type EvalExportMode = (typeof EVAL_EXPORT_MODES)[number]

/** SCORING_EVAL: opportunity key, human label, V3 decision, shadow decisions, archetype, outcome. */
export async function exportScoringEval(client: SupabaseClient, orgId: string) {
  const [{ data: labels }, { data: shadow }] = await Promise.all([
    client.from('scoring_labels').select('opportunity_key, prospect_quality, expected_score_min, expected_score_max, expected_action').eq('organization_id', orgId).limit(5000),
    client.from('scoring_shadow_decisions').select('opportunity_key, production_engine, production_score, production_qualification, candidate_engine, candidate_score, candidate_qualification, features, is_test').eq('organization_id', orgId).eq('is_test', false).limit(5000),
  ])
  const labelByKey = new Map((labels ?? []).map((l) => [l.opportunity_key, l]))
  const rows: Record<string, unknown>[] = []
  for (const s of (shadow ?? []) as Array<Record<string, unknown>>) {
    const label = labelByKey.get(s.opportunity_key as string) ?? null
    const features = (s.features ?? null) as Record<string, unknown> | null
    rows.push({
      opportunity_key: s.opportunity_key,
      scoring_version: SCORING_VERSION,
      human_quality: label?.prospect_quality ?? null,
      human_band: label ? `${label.expected_score_min}-${label.expected_score_max}` : null,
      v3_engine: s.production_engine, v3_score: s.production_score, v3_qualification: s.production_qualification,
      candidate_engine: s.candidate_engine, candidate_score: s.candidate_score, candidate_qualification: s.candidate_qualification,
      archetype: features?.archetype ?? null,
    })
  }
  return rows
}

/** PAIRWISE_RANKING: two opportunities, the reviewer's choice, and the model rankings. */
export async function exportPairwiseRanking(client: SupabaseClient, orgId: string) {
  const { data } = await client
    .from('scoring_pairwise_labels')
    .select('opportunity_key_a, opportunity_key_b, winner, labeler_rep_id, created_at')
    .eq('organization_id', orgId)
    .limit(5000)
  return (data ?? []) as Array<Record<string, unknown>>
}

/** ROUTING_EVAL: opportunity, eligible senders, V1/V2 and the human best sender. */
export async function exportRoutingEval(client: SupabaseClient, orgId: string) {
  const [{ data: evals }, { data: shadow }] = await Promise.all([
    client.from('routing_evaluations').select('lead_id, best_sender_profile_id, v1_correct, v2_correct, created_at').eq('organization_id', orgId).limit(5000),
    client.from('scoring_shadow_decisions').select('lead_id, routing_v1, routing_v2, is_test').eq('organization_id', orgId).eq('is_test', false).limit(5000),
  ])
  const routingByLead = new Map((shadow ?? []).map((s) => [s.lead_id, s]))
  return (evals ?? []).map((e) => ({
    lead_id: e.lead_id,
    v1: (routingByLead.get(e.lead_id)?.routing_v1 ?? null),
    v2: (routingByLead.get(e.lead_id)?.routing_v2 ?? null),
    human_best_sender: e.best_sender_profile_id,
    v1_correct: e.v1_correct, v2_correct: e.v2_correct,
    reviewed_at: e.created_at,
  })) as Array<Record<string, unknown>>
}

/** MESSAGE_QUALITY: generated message, type, human score, classification, outcome. */
export async function exportMessageQuality(client: SupabaseClient, orgId: string) {
  const [{ data: evals }, { data: messages }] = await Promise.all([
    client.from('message_evaluations').select('message_id, score, classification, dimensions, reasons').eq('organization_id', orgId).limit(5000),
    client.from('messages').select('id, type, sent_text, send_disposition').eq('organization_id', orgId).limit(5000),
  ])
  const msgById = new Map((messages ?? []).map((m) => [m.id, m]))
  return (evals ?? []).map((e) => {
    const m = msgById.get(e.message_id)
    return {
      message_id: e.message_id, message_type: m?.type ?? null, send_disposition: m?.send_disposition ?? null,
      human_score: e.score, classification: e.classification, dimensions: e.dimensions, reasons: e.reasons,
    }
  }) as Array<Record<string, unknown>>
}

/** THESIS_QUALITY: the sales thesis, the human rating, the reasons, the archetype. */
export async function exportThesisQuality(client: SupabaseClient, orgId: string) {
  const [{ data: evals }, { data: leads }] = await Promise.all([
    client.from('thesis_evaluations').select('lead_id, rating, reasons').eq('organization_id', orgId).limit(5000),
    client.from('leads').select('id, company, contact_name, canonical_intelligence').eq('organization_id', orgId).limit(5000),
  ])
  const leadById = new Map((leads ?? []).map((l) => [l.id, l]))
  return (evals ?? []).map((e) => {
    const lead = leadById.get(e.lead_id) as Record<string, unknown> | undefined
    const ci = (lead?.canonical_intelligence ?? null) as Record<string, unknown> | null
    const thesis = (ci?.salesThesis ?? ci?.thesis ?? null) as Record<string, unknown> | null
    return { lead_id: e.lead_id, company: lead?.company ?? null, thesis, rating: e.rating, reasons: e.reasons }
  }) as Array<Record<string, unknown>>
}

/** OUTCOME_TRAINING: opportunity, sender, strategy, reply/meeting/proposal/won-lost and timestamps. */
export async function exportOutcomeTraining(client: SupabaseClient, orgId: string) {
  const { data } = await client
    .from('leads')
    .select('id, company, contact_name, sender_profile_id, status, created_at, scored_at, connection_accepted_at, revenue_identity_id')
    .eq('organization_id', orgId)
    .limit(5000)
  const { data: outcomes } = await client.from('outcomes').select('lead_id, stage, occurred_at').eq('organization_id', orgId).limit(5000)
  const byLead = new Map<string, Array<Record<string, unknown>>>()
  for (const o of (outcomes ?? []) as Array<Record<string, unknown>>) {
    const arr = byLead.get(o.lead_id as string) ?? []
    arr.push(o)
    byLead.set(o.lead_id as string, arr)
  }
  return (data ?? []).map((l) => {
    const stages = (byLead.get(l.id) ?? []).map((o) => o.stage)
    return {
      lead_id: l.id, company: l.company, contact_name: l.contact_name, sender_profile_id: l.sender_profile_id,
      status: l.status, created_at: l.created_at, scored_at: l.scored_at, connection_accepted_at: l.connection_accepted_at,
      stages, won: stages.includes('won'), lost: stages.includes('lost') || stages.includes('do_not_contact'),
    }
  }) as Array<Record<string, unknown>>
}

export async function buildEvalExport(client: SupabaseClient, orgId: string, mode: EvalExportMode): Promise<Array<Record<string, unknown>>> {
  switch (mode) {
    case 'SCORING_EVAL': return exportScoringEval(client, orgId)
    case 'PAIRWISE_RANKING': return exportPairwiseRanking(client, orgId)
    case 'ROUTING_EVAL': return exportRoutingEval(client, orgId)
    case 'MESSAGE_QUALITY': return exportMessageQuality(client, orgId)
    case 'THESIS_QUALITY': return exportThesisQuality(client, orgId)
    case 'OUTCOME_TRAINING': return exportOutcomeTraining(client, orgId)
  }
}
