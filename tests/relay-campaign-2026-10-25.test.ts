/**
 * First-100 campaign + dataset export V2 regression guards.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createFakeSupabase } from './helpers/fake-supabase'
import { first100Progress, learningHealth, reviewerAgreement, reasonLabel } from '@/lib/admin/learning-health'
import { buildEvalExport, EVAL_EXPORT_MODES } from '@/lib/dataset/eval-export'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const ORG = 'org-campaign'

describe('Day 1 — first-100 campaign progress', () => {
  it('counts labels and pairwise from canonical tables', async () => {
    const fake = createFakeSupabase({
      scoring_labels: [
        { id: 'l1', organization_id: ORG, opportunity_key: 'a'.repeat(64), prospect_quality: 'GREAT', labeler_rep_id: 'r1' },
        { id: 'l2', organization_id: ORG, opportunity_key: 'b'.repeat(64), prospect_quality: 'GOOD', labeler_rep_id: 'r1' },
      ],
      scoring_pairwise_labels: [{ id: 'p1', organization_id: ORG, opportunity_key_a: 'a'.repeat(64), opportunity_key_b: 'b'.repeat(64), winner: 'A' }],
      message_evaluations: [{ id: 'm1', organization_id: ORG, message_id: 'msg1', score: 5, classification: 'SALES_READY' }],
      thesis_evaluations: [{ id: 't1', organization_id: ORG, lead_id: 'lead1', rating: 'STRONG' }],
      routing_evaluations: [{ id: 'rt1', organization_id: ORG, lead_id: 'lead1', v1_correct: true, v2_correct: false }],
    })
    const progress = await first100Progress(fake.client as never, ORG)
    expect(progress.opportunityLabels).toBe(2)
    expect(progress.remaining).toBe(98)
    expect(progress.pairwise).toBe(1)
    expect(progress.messageReviews).toBe(1)
    expect(progress.thesisReviews).toBe(1)
    expect(progress.routingReviews).toBe(1)
  })

  it('is rendered as a campaign header with learning health', () => {
    expect(read('src/components/admin/learning-health.tsx')).toContain('First 100 real opportunities')
    expect(read('src/app/(app)/admin/training-data/page.tsx')).toContain('LearningHealthHeader')
  })

  it('labels reasons in human language, not raw enums', () => {
    expect(reasonLabel('engines disagree')).toBe('Model disagreement')
    expect(reasonLabel('unexpected positive outcome')).toBe('Outcome contradicts the rank')
    expect(reasonLabel('near band edge')).toBe('Near a qualification threshold')
  })
})

describe('Day 1.5 — review speed: keyboard shortcuts', () => {
  it('the quick label uses keyboard 1–5 and Enter', () => {
    const src = read('src/components/admin/training-data-center.tsx')
    expect(src).toContain("'1', '2', '3', '4', '5'")
    expect(src).toContain('data-quick-label')
    expect(src).toContain('e.key === \'Enter\'')
  })
})

describe('Day 3.5 — dataset export V2 modes', () => {
  it('declares the six evaluation modes', () => {
    expect(EVAL_EXPORT_MODES).toEqual([
      'SCORING_EVAL', 'PAIRWISE_RANKING', 'ROUTING_EVAL', 'MESSAGE_QUALITY', 'THESIS_QUALITY', 'OUTCOME_TRAINING',
    ])
  })

  it('builds each export from canonical tables', async () => {
    const fake = createFakeSupabase({
      scoring_labels: [{ id: 'l1', organization_id: ORG, opportunity_key: 'k1', prospect_quality: 'GREAT', expected_score_min: 75, expected_score_max: 100 }],
      scoring_shadow_decisions: [
        { id: 's1', organization_id: ORG, opportunity_key: 'k1', production_engine: 'v3', production_score: 60, production_qualification: 'MAYBE', candidate_engine: 'ordinal_logit', candidate_score: 80, candidate_qualification: 'STRONG', archetype: 'technical_founder', is_test: false },
      ],
      scoring_pairwise_labels: [{ id: 'p1', organization_id: ORG, opportunity_key_a: 'a'.repeat(64), opportunity_key_b: 'b'.repeat(64), winner: 'A' }],
      routing_evaluations: [{ id: 'r1', organization_id: ORG, lead_id: 'lead1', best_sender_profile_id: 'p1', v1_correct: true, v2_correct: false }],
      message_evaluations: [{ id: 'm1', organization_id: ORG, message_id: 'msg1', score: 5, classification: 'SALES_READY' }],
      thesis_evaluations: [{ id: 't1', organization_id: ORG, lead_id: 'lead1', rating: 'STRONG' }],
    })
    const scoring = await buildEvalExport(fake.client as never, ORG, 'SCORING_EVAL')
    expect(scoring).toHaveLength(1)
    expect(scoring[0]).toMatchObject({ opportunity_key: 'k1', v3_engine: 'v3', candidate_engine: 'ordinal_logit' })

    expect(await buildEvalExport(fake.client as never, ORG, 'PAIRWISE_RANKING')).toHaveLength(1)
    expect(await buildEvalExport(fake.client as never, ORG, 'ROUTING_EVAL')).toHaveLength(1)
    expect(await buildEvalExport(fake.client as never, ORG, 'MESSAGE_QUALITY')).toHaveLength(1)
    expect(await buildEvalExport(fake.client as never, ORG, 'THESIS_QUALITY')).toHaveLength(1)
  })
})

describe('Day 4.5 — QA action completeness', () => {
  it('thread Reassign navigates instead of returning a 400', () => {
    const page = read('src/app/(app)/admin/qa/page.tsx')
    expect(page).toContain('Reassign')
    expect(page).toMatch(/Reassign<\/Link>/)
  })

  it('Confirm and Dismiss persist thread status', () => {
    expect(read('src/app/api/admin/qa/evaluations/route.ts')).toContain("thread_status: 'VERIFIED'")
    expect(read('src/app/api/admin/qa/evaluations/route.ts')).toContain("thread_status: 'DISMISSED'")
  })
})

describe('Day 4 — learning health signals', () => {
  it('computes reviewer agreement only when there is overlap', async () => {
    const noOverlap = createFakeSupabase({
      scoring_labels: [{ id: 'l1', organization_id: ORG, opportunity_key: 'a'.repeat(64), prospect_quality: 'GREAT', labeler_rep_id: 'r1' }],
    })
    expect(await reviewerAgreement(noOverlap.client as never, ORG)).toBeNull()

    const overlap = createFakeSupabase({
      scoring_labels: [
        { id: 'l1', organization_id: ORG, opportunity_key: 'a'.repeat(64), prospect_quality: 'GREAT', labeler_rep_id: 'r1' },
        { id: 'l2', organization_id: ORG, opportunity_key: 'a'.repeat(64), prospect_quality: 'GREAT', labeler_rep_id: 'r2' },
      ],
    })
    expect(await reviewerAgreement(overlap.client as never, ORG)).toBe(100)
  })

  it('reports quality signals and label distribution', async () => {
    const fake = createFakeSupabase({
      scoring_labels: [{ id: 'l1', organization_id: ORG, opportunity_key: 'a'.repeat(64), prospect_quality: 'GREAT' }],
      message_evaluations: [{ id: 'm1', organization_id: ORG, message_id: 'msg1', score: 5 }, { id: 'm2', organization_id: ORG, message_id: 'msg2', score: 2 }],
      thesis_evaluations: [{ id: 't1', organization_id: ORG, lead_id: 'lead1', rating: 'STRONG' }, { id: 't2', organization_id: ORG, lead_id: 'lead2', rating: 'MISLEADING' }],
    })
    const health = await learningHealth(fake.client as never, ORG)
    expect(health.messagePassRate).toBe(50)
    expect(health.thesisMisleadingRate).toBe(50)
    expect(health.labelDistribution['GREAT']).toBe(1)
  })
})
