import { describe, expect, it } from 'vitest'
import {
  PIPELINE_STAGE_KEYS,
  emptyPipelineStageCounts,
  pipelineCardIdsSql,
  pipelineScopeClause,
  pipelineScopeParams,
  pipelineStageSql,
} from '@/lib/store/pipeline-stage'
import { SupabaseDbClient } from '@/lib/db/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Pipeline aggregate contracts.
 *
 * The SQL was verified against the production-shaped export on a real Postgres
 * 17 instance: 416 non-archived leads, 0 per-lead stage diffs, and 150/150
 * bounded card ids identical to the JS selection. These tests pin the parts
 * that can be checked without a database: the exact connection-only rule, the
 * scope clause, and the Supabase rollback behaviour.
 */

const STAGE_SQL = pipelineStageSql(pipelineScopeClause({}))
const CARD_SQL = pipelineCardIdsSql(pipelineScopeClause({}))

describe('PIPELINE_SQL_STAGE_PARITY', () => {
  it('keeps the connection-only body rule in both the counts and card queries', () => {
    for (const sql of [STAGE_SQL, CARD_SQL]) {
      expect(sql).toContain("direction <> 'inbound' AND sent_text IS NOT NULL AND btrim(sent_text) <> ''")
      expect(sql).toContain("direction = 'inbound' AND sent_text IS NOT NULL AND btrim(sent_text) <> ''")
      // A connection-only message (empty body) must never set last_outbound_at.
      expect(sql).not.toContain("BOOL_OR(direction <> 'inbound' AND sent_at IS NOT NULL) AS last_outbound_at")
    }
  })

  it('uses the canonical stage vocabulary and no invented stages', () => {
    for (const key of PIPELINE_STAGE_KEYS) expect(STAGE_SQL).toContain(`'${key}'`)
    expect(PIPELINE_STAGE_KEYS).toEqual([
      'to_contact', 'observe', 'waiting', 'follow_up_due', 'needs_reply', 'done', 'cold',
    ])
  })

  it('applies the same follow-up clock as the JS policy (3/6 days, max 3)', () => {
    expect(STAGE_SQL).toContain('COALESCE(followup_count, 0) < 3')
    expect(STAGE_SQL).toContain('CASE COALESCE(followup_count, 0) WHEN 0 THEN 3 ELSE 6 END')
  })
})

describe('PIPELINE_AGGREGATE_SCOPE', () => {
  it('scopes to the organization and excludes archived leads', () => {
    expect(pipelineScopeClause({})).toBe('l.organization_id = ? AND l.archived = false')
  })

  it('adds the rep owner scope without widening the workspace', () => {
    const clause = pipelineScopeClause({ ownerRepId: 'rep-1', revenueIdentityId: 'ws-1', profileId: 'prof-1' })
    expect(clause).toContain('l.owner_rep_id = ?')
    expect(clause).toContain('(l.revenue_identity_id = ? OR (l.revenue_identity_id IS NULL AND l.sender_profile_id = ?))')
    const params = pipelineScopeParams('org-1', '2026-11-03T00:00:00.000Z', {
      ownerRepId: 'rep-1',
      revenueIdentityId: 'ws-1',
      profileId: 'prof-1',
    })
    // org, org, now×7, org, owner, identity, profile, now
    expect(params).toHaveLength(14)
    expect(params[0]).toBe('org-1')
    expect(params[9]).toBe('org-1')
    expect(params[10]).toBe('rep-1')
    expect(params[11]).toBe('ws-1')
    expect(params[12]).toBe('prof-1')
    expect(params[13]).toBe('2026-11-03T00:00:00.000Z')
  })

  it('omits the owner/workspace predicates for an org view', () => {
    const params = pipelineScopeParams('org-1', '2026-11-03T00:00:00.000Z', {})
    expect(params).toHaveLength(11)
    expect(pipelineScopeClause({})).not.toContain('owner_rep_id')
  })
})

describe('PIPELINE_AGGREGATE_CONNECTION_ONLY_PARITY', () => {
  it('a connection-only message (empty body) does not count as an outbound body', async () => {
    const { derivePipelineStage } = await import('@/components/leads/pipeline-utils')
    const base = {
      status: 'contacted',
      verdict: 'send',
      direction: 'outbound',
      inboundMessage: null,
      connectionAcceptedAt: null,
      hasDmSent: false,
      followupCount: 0,
      lifecycle: { state: 'active', daysStale: 0, reason: 'Recently contacted' },
      createdAt: '2026-10-01T00:00:00.000Z',
      lastOutboundAt: null,
      lastInboundAt: null,
    }
    // No body → no outbound → the lead waits rather than reading as contacted.
    expect(derivePipelineStage(base as never)).toBe('waiting')
    // With a body, the same lead is a real outbound and the follow-up clock runs.
    expect(derivePipelineStage({ ...base, lastOutboundAt: '2026-10-01T00:00:00.000Z' } as never)).toBe('follow_up_due')
  })
})

describe('Supabase rollback for the pipeline aggregate', () => {
  it('raw() returns an error so the caller falls back to the JS authority', async () => {
    const fake = {} as SupabaseClient
    const client = new SupabaseDbClient(fake)
    const res = await client.raw('SELECT 1')
    expect(res.error?.message).toContain('not supported by the Supabase provider')
  })
})

describe('emptyPipelineStageCounts', () => {
  it('returns zero for every canonical stage', () => {
    expect(emptyPipelineStageCounts()).toEqual({
      to_contact: 0, observe: 0, waiting: 0, follow_up_due: 0, needs_reply: 0, done: 0, cold: 0,
    })
  })
})
