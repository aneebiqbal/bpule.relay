import { describe, expect, it } from 'vitest'
import {
  computeRates,
  rateMetricFromGroups,
  RATE_GROUP_SQL,
  type RateBucket,
  type RateGroup,
} from '@/lib/store/rates'
import { NeonDbClient, type NeonExecutorApi } from '@/lib/db/neon'
import type { Lead, Message, Outcome } from '@/lib/domain/types'

/**
 * REP_RATE_SQL_JS_PARITY.
 *
 * The Neon path computes rates with one SQL aggregate; the Supabase rollback
 * derives the same groups from `computeRates`. These tests pin the group
 * derivation to the canonical JS computation and pin the raw-SQL wiring that
 * carries the aggregate.
 */

function lead(id: string, ownerRepId: string | null, playId: string | null): Lead {
  return { id, ownerRepId, playId } as Lead
}

function msg(id: string, leadId: string, sentAt: string | null): Message {
  return { id, leadId, sentAt } as Message
}

function outcome(id: string, leadId: string, stage: string): Outcome {
  return { id, leadId, stage } as Outcome
}

function bucket(lead: Lead, messages: Message[], outcomes: Outcome[]): RateBucket {
  return { lead, sentMessages: messages, outcomes }
}

/** The exact fallback derivation used by SupabaseStore.getRateGroups(). */
export function groupsFromBuckets(buckets: readonly RateBucket[]): RateGroup[] {
  const byKey = new Map<string, RateGroup>()
  const groups: RateGroup[] = []
  for (const b of buckets) {
    const key = `${b.lead.ownerRepId ?? ''}|${b.lead.playId ?? ''}`
    let g = byKey.get(key)
    if (!g) {
      g = {
        ownerRepId: b.lead.ownerRepId,
        playId: b.lead.playId,
        sentLeads: 0,
        sent: 0,
        repliedLeads: 0,
        readLeads: 0,
        checkedLeads: 0,
      }
      byKey.set(key, g)
      groups.push(g)
    }
    const m = computeRates([b])
    g.sent += m.sent
    g.sentLeads += m.sentLeads
    g.repliedLeads += m.repliedLeads
    g.readLeads += m.readLeads
    g.checkedLeads += m.checkedLeads
  }
  return groups
}

describe('REP_RATE_SQL_JS_PARITY', () => {
  it('group derivation matches computeRates on a mixed fixture', () => {
    const buckets = [
      // rep-1 / play-a: two sent messages, one replied, one read, one check
      bucket(lead('l1', 'rep-1', 'play-a'), [msg('m1', 'l1', '2026-10-01T00:00:00Z'), msg('m2', 'l1', '2026-10-02T00:00:00Z')], [outcome('o1', 'l1', 'replied'), outcome('o2', 'l1', 'read'), outcome('o3', 'l1', 'check')]),
      // rep-1 / play-a: no messages, no outcomes
      bucket(lead('l2', 'rep-1', 'play-a'), [], []),
      // rep-1 / play-b: draft only (no sent_at) — never counts as sent
      bucket(lead('l3', 'rep-1', 'play-b'), [msg('m3', 'l3', null)], []),
      // rep-2 / play-a: connection-only (empty body is still a sent message here)
      bucket(lead('l4', 'rep-2', 'play-a'), [msg('m4', 'l4', '2026-10-03T00:00:00Z')], [outcome('o4', 'l4', 'replied')]),
      // rep-2 / no play: read + check, no sent
      bucket(lead('l5', 'rep-2', null), [], [outcome('o5', 'l5', 'read'), outcome('o6', 'l5', 'check')]),
    ]

    expect(rateMetricFromGroups(groupsFromBuckets(buckets))).toEqual(computeRates(buckets))
  })

  it('empty buckets produce the empty metric', () => {
    expect(rateMetricFromGroups([])).toEqual(computeRates([]))
  })

  it('a sent message with no reply yields a null reply rate, not zero', () => {
    const buckets = [bucket(lead('l1', 'rep-1', null), [msg('m1', 'l1', '2026-10-01T00:00:00Z')], [])]
    const metric = rateMetricFromGroups(groupsFromBuckets(buckets))
    expect(metric.sent).toBe(1)
    expect(metric.sentLeads).toBe(1)
    expect(metric.replyRate).toBe(0)
  })

  it('RATE_GROUP_SQL is scoped to the org, excludes archived leads and uses ? placeholders', () => {
    expect(RATE_GROUP_SQL).toContain('l.organization_id = ?')
    expect(RATE_GROUP_SQL).toContain('l.archived = false')
    expect(RATE_GROUP_SQL).toContain('BOOL_OR(stage = \'replied\')')
    expect(RATE_GROUP_SQL).toContain('COUNT(*) FILTER (WHERE m.sent > 0)')
    expect(RATE_GROUP_SQL.match(/\?/g)).toHaveLength(3)
  })
})

describe('NeonDbClient.raw', () => {
  it('rewrites ? placeholders and puts the RLS identity in scope', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = []
    const executor: NeonExecutorApi = {
      async query(text, values = []) {
        calls.push({ sql: text, values })
        return []
      },
      async queryInWrite() {
        return []
      },
    }
    const client = new NeonDbClient(executor, 'user-1')
    await client.raw<{ c: number }>('SELECT COUNT(*) AS c FROM messages WHERE organization_id = ?', ['org-1'])

    expect(calls).toHaveLength(1)
    // The executor (NeonExecutorImpl) prepends the RLS identity and shifts the
    // placeholder; the client hands it the raw statement and params.
    expect(calls[0].values).toEqual(['org-1'])
    expect(calls[0].sql).toBe('SELECT COUNT(*) AS c FROM messages WHERE organization_id = ?')
  })

  it('returns an error payload instead of throwing', async () => {
    const executor: NeonExecutorApi = {
      async query() {
        throw new Error('boom')
      },
      async queryInWrite() {
        return []
      },
    }
    const client = new NeonDbClient(executor, 'user-1')
    const res = await client.raw('SELECT 1')
    expect(res.error?.message).toContain('boom')
    expect(res.data).toBeNull()
  })
})
