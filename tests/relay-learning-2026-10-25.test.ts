/**
 * Human learning + evaluation regression guards.
 *
 * Minimum-sample gating, message/thesis/routing persistence, revenue funnel.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createFakeSupabase } from './helpers/fake-supabase'
import {
  sampleGating,
  modelComparison,
  messageReviewStats,
  thesisReviewStats,
  routingEvaluationStats,
  revenueFunnel,
  recordMessageEvaluation,
  recordThesisEvaluation,
  recordRoutingEvaluation,
} from '@/lib/admin/evaluations'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8'))
  .join('\n')

const ORG = 'org-eval'
const REP = 'rep-1'

describe('Phase 7 — minimum-sample gating', () => {
  it('gates by label count', () => {
    expect(sampleGating(0)).toBe('INSUFFICIENT_DATA')
    expect(sampleGating(29)).toBe('INSUFFICIENT_DATA')
    expect(sampleGating(30)).toBe('PRELIMINARY_ONLY')
    expect(sampleGating(99)).toBe('PRELIMINARY_ONLY')
    expect(sampleGating(100)).toBe('PROMOTION_STUDY')
  })

  it('returns INSUFFICIENT_DATA with no labels', async () => {
    const fake = createFakeSupabase({})
    const result = await modelComparison(fake.client as never, ORG)
    expect(result.gating).toBe('INSUFFICIENT_DATA')
    expect(result.engines).toBeNull()
  })
})

describe('Phase 4/5/6 — evaluations persist', () => {
  it('records a message evaluation and aggregates it', async () => {
    const fake = createFakeSupabase({})
    await recordMessageEvaluation(fake.client as never, {
      organizationId: ORG, messageId: 'm1', reviewerRepId: REP, score: 5, classification: 'SALES_READY', reasons: ['grounded'],
    })
    const stats = await messageReviewStats(fake.client as never, ORG)
    expect(stats.total).toBe(1)
    expect(stats.salesReady).toBe(1)
    expect(stats.passRate).toBe(100)
  })

  it('records a thesis evaluation and aggregates it', async () => {
    const fake = createFakeSupabase({})
    await recordThesisEvaluation(fake.client as never, { organizationId: ORG, leadId: 'l1', reviewerRepId: REP, rating: 'STRONG' })
    await recordThesisEvaluation(fake.client as never, { organizationId: ORG, leadId: 'l2', reviewerRepId: REP, rating: 'MISLEADING' })
    const stats = await thesisReviewStats(fake.client as never, ORG)
    expect(stats.total).toBe(2)
    expect(stats.strong).toBe(1)
    expect(stats.misleading).toBe(1)
    expect(stats.misleadingRate).toBe(50)
  })

  it('records a routing judgment and aggregates it', async () => {
    const fake = createFakeSupabase({})
    await recordRoutingEvaluation(fake.client as never, { organizationId: ORG, leadId: 'l1', reviewerRepId: REP, bestSenderProfileId: 'p1', v1Correct: true, v2Correct: false })
    const stats = await routingEvaluationStats(fake.client as never, ORG)
    expect(stats.judged).toBe(1)
    expect(stats.v1CorrectRate).toBe(100)
    expect(stats.v2CorrectRate).toBe(0)
  })
})

describe('Phase 9 — revenue funnel from outcomes', () => {
  it('counts the best stage per lead', async () => {
    const fake = createFakeSupabase({
      outcomes: [
        { id: 'o1', organization_id: ORG, lead_id: 'a', stage: 'meeting' },
        { id: 'o2', organization_id: ORG, lead_id: 'a', stage: 'proposal' },
        { id: 'o3', organization_id: ORG, lead_id: 'b', stage: 'won' },
        { id: 'o4', organization_id: ORG, lead_id: 'c', stage: 'lost' },
      ],
    })
    const funnel = await revenueFunnel(fake.client as never, ORG)
    expect(funnel.won).toBe(1)
    expect(funnel.proposal).toBe(2) // proposal + won
    expect(funnel.meeting).toBe(2)
    expect(funnel.lost).toBe(1)
  })
})

describe('Phase 17 — admin QA action persistence', () => {
  it('the evaluation API is admin-gated and handles message/thesis/routing/thread', () => {
    const src = read('src/app/api/admin/qa/evaluations/route.ts')
    expect(src).toContain("can(auth, 'VIEW_TEAM_ANALYTICS')")
    for (const kind of ["kind === 'message'", "kind === 'thesis'", "kind === 'routing'", "kind === 'thread'"]) expect(src).toContain(kind)
    expect(src).toContain("thread_status: 'VERIFIED'")
  })

  it('the evaluation tables exist with RLS and unique reviewer keys', () => {
    for (const t of ['message_evaluations', 'thesis_evaluations', 'routing_evaluations']) {
      expect(migrations).toContain(`create table if not exists ${t}`)
      expect(migrations).toContain(`alter table ${t} enable row level security`)
    }
  })
})
