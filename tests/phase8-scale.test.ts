/**
 * Phase 8 final activation — scale and egress fixes, synthetic data.
 * ACCOUNTS_SCALE: >2,000 leads are all grouped (was a silent 2,000 cap).
 * TEAM_REPORT_SCALE: >5,000 events all count (was a silent 5,000 cap).
 * CHAT_PREVIEW_EGRESS: with the view, no message body column is requested.
 */
import { describe, expect, it } from 'vitest'
import { readAllPages } from '@/lib/operations/paged-read'
import { loadAccountLeads, ACCOUNT_LEAD_CAP } from '@/lib/operations/accounts'
import { loadPerformance } from '@/lib/operations/performance'
import { loadLatestPreviews } from '@/lib/operations/chat-queue'

type Row = Record<string, unknown>

/** Fake that serves `.range(from, to)` slices of a table and records selects. */
function pagedClient(tables: Record<string, Row[]>) {
  const selects: Array<{ table: string; columns: string }> = []
  const ranges: Array<[number, number]> = []
  const from = (table: string) => {
    let range: [number, number] | null = null
    let limit: number | null = null
    const b: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'in', 'not', 'gte', 'lt', 'order', 'ilike', 'or']) b[m] = () => b
    b.select = (columns: string) => {
      selects.push({ table, columns })
      return b
    }
    b.range = (f: number, t: number) => {
      range = [f, t]
      ranges.push(range)
      return b
    }
    b.limit = (n: number) => {
      limit = n
      return b
    }
    const run = () => {
      let rows = tables[table] ?? []
      if (range) rows = rows.slice(range[0], range[1] + 1)
      else if (limit !== null) rows = rows.slice(0, limit)
      return { data: rows, error: null, count: null }
    }
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej)
    return b
  }
  return { client: { from } as never, selects, ranges }
}

describe('PAGED_READ', () => {
  it('reads every page and is not truncated below the ceiling', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ i }))
    const r = await readAllPages((f, t) => Promise.resolve({ data: rows.slice(f, t + 1), error: null }), { ceiling: 10_000 })
    expect(r.rows).toHaveLength(2500)
    expect(r.truncated).toBe(false)
    expect(r.pages).toBe(3)
  })

  it('exactly at the ceiling probes once; past it says truncated', async () => {
    const exact = Array.from({ length: 2000 }, (_, i) => ({ i }))
    const a = await readAllPages((f, t) => Promise.resolve({ data: exact.slice(f, t + 1), error: null }), { ceiling: 2000 })
    expect(a).toMatchObject({ truncated: false })
    const more = Array.from({ length: 2001 }, (_, i) => ({ i }))
    const b = await readAllPages((f, t) => Promise.resolve({ data: more.slice(f, t + 1), error: null }), { ceiling: 2000 })
    expect(b.rows).toHaveLength(2000)
    expect(b.truncated).toBe(true)
  })

  it('a page error is thrown, never swallowed into a short result', async () => {
    await expect(readAllPages(() => Promise.resolve({ data: null, error: new Error('boom') }), { ceiling: 10 })).rejects.toThrow('boom')
  })
})

describe('ACCOUNTS_SCALE', () => {
  it('2,600 leads across 650 companies → every company is present, not truncated', async () => {
    const leads = Array.from({ length: 2600 }, (_, i) => ({
      id: `l${i}`, company: `Co ${i % 650}`, company_key: `co-${i % 650}`, contact_name: `P${i}`, contact_title: null,
      owner_rep_id: 'rep-a', revenue_identity_id: null, status: 'new', source: 'linkedin', market_region: null, canonical_score: 50,
      created_at: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
    }))
    const { client, ranges } = pagedClient({ leads, conversation_states: [], revenue_identities: [], reps: [{ id: 'rep-a', name: 'A' }] })
    const res = await loadAccountLeads(client, { orgId: 'org', repIds: null })
    expect(res.leads).toHaveLength(2600)
    expect(res.truncated).toBe(false)
    expect(new Set(res.leads.map((l) => l.companyKey)).size).toBe(650)
    expect(ranges.length).toBe(3)
    expect(ACCOUNT_LEAD_CAP).toBe(10_000)
  })
})

describe('TEAM_REPORT_SCALE', () => {
  it('7,500 executed sends in a window are all counted', async () => {
    const events = Array.from({ length: 7500 }, (_, i) => ({
      actor_id: i % 2 ? 'rep-a' : 'rep-b', action_type: 'DM_SENT', execution_status: 'sent', lead_id: `l${i % 300}`, sender_profile_id: null,
    }))
    const { client } = pagedClient({
      action_events: events, leads: [], task_events: [], conversation_states: [], reps: [{ id: 'rep-a', name: 'A' }, { id: 'rep-b', name: 'B' }], revenue_identities: [],
    })
    const perf = await loadPerformance(client, { orgId: 'org', repIds: null, start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' })
    expect(perf.totals.messages).toBe(7500)
    expect(perf.byRep.map((r) => r.metrics.messages).sort()).toEqual([3750, 3750])
    expect(perf.truncated).toBe(false)
  })
})

describe('CHAT_PREVIEW_EGRESS', () => {
  it('view path: one bounded preview per lead, no sent_text requested', async () => {
    const { client, selects } = pagedClient({
      lead_message_previews: [
        { lead_id: 'l1', direction: 'inbound', thread_status: 'UNVERIFIED', preview: 'Yes, Thursday works' },
        { lead_id: 'l2', direction: 'outbound', thread_status: 'VERIFIED', preview: 'Hi Tom' },
      ],
    })
    const map = await loadLatestPreviews(client, ['l1', 'l2'], true)
    expect(map.get('l1')).toMatchObject({ preview: 'Yes, Thursday works', direction: 'inbound' })
    expect(selects.every((s) => s.table === 'lead_message_previews' && !s.columns.includes('sent_text'))).toBe(true)
  })

  it('fallback (view not applied): full body read, truncated to 140 chars server-side', async () => {
    const long = 'x'.repeat(5000)
    const { client, selects } = pagedClient({
      messages: [{ lead_id: 'l1', direction: 'outbound', sent_text: long, sent_at: '2026-11-01T10:00:00Z', thread_status: 'VERIFIED' }],
    })
    const map = await loadLatestPreviews(client, ['l1'], false)
    expect(map.get('l1')!.preview!.length).toBeLessThanOrEqual(141)
    expect(selects[0]).toMatchObject({ table: 'messages' })
  })
})
