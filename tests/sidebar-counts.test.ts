import { describe, expect, it } from 'vitest'
import {
  conversationNeedsReply,
  loadSidebarCounts,
  sidebarBadge,
} from '@/lib/operations/sidebar-counts'

/**
 * Sidebar badges are chrome: a failed read must render nothing (null), never a
 * misleading zero, and never break the shell.
 */
describe('SIDEBAR_BADGE_DATA_CONTRACT', () => {
  it('null and zero render no badge; 1-99 show exactly; 100+ collapses', () => {
    expect(sidebarBadge(null)).toBeNull()
    expect(sidebarBadge(undefined)).toBeNull()
    expect(sidebarBadge(0)).toBeNull()
    expect(sidebarBadge(1)).toEqual({ value: 1, label: '1' })
    expect(sidebarBadge(42)).toEqual({ value: 42, label: '42' })
    expect(sidebarBadge(99)).toEqual({ value: 99, label: '99' })
    expect(sidebarBadge(100)).toEqual({ value: 100, label: '99+' })
    expect(sidebarBadge(1413)).toEqual({ value: 1413, label: '99+' })
  })

  it('inbox counts only threads where the prospect moved last and the deal is alive', () => {
    const base = { last_sent_at: null, last_reply_at: null, stage: null, won_at: null, lost_at: null }
    expect(conversationNeedsReply({ ...base, last_reply_at: '2026-11-01T10:00:00Z' })).toBe(true)
    expect(
      conversationNeedsReply({
        ...base,
        last_sent_at: '2026-11-01T09:00:00Z',
        last_reply_at: '2026-11-01T10:00:00Z',
      }),
    ).toBe(true)
    // Prospect has not replied yet.
    expect(conversationNeedsReply({ ...base, last_sent_at: '2026-11-01T10:00:00Z' })).toBe(false)
    // My outbound is the latest move — waiting on the prospect.
    expect(
      conversationNeedsReply({
        ...base,
        last_sent_at: '2026-11-01T11:00:00Z',
        last_reply_at: '2026-11-01T10:00:00Z',
      }),
    ).toBe(false)
    // Closed threads never count.
    expect(
      conversationNeedsReply({
        ...base,
        last_reply_at: '2026-11-01T10:00:00Z',
        stage: 'won',
      }),
    ).toBe(false)
    expect(
      conversationNeedsReply({
        ...base,
        last_reply_at: '2026-11-01T10:00:00Z',
        lost_at: '2026-11-02T10:00:00Z',
      }),
    ).toBe(false)
  })
})

describe('SIDEBAR_BADGE_LOADS_BOUNDED', () => {
  function fakeClient(tables: Record<string, unknown[]>) {
    const calls: string[] = []
    return {
      calls,
      from: (table: string) => {
        calls.push(table)
        const builder: Record<string, unknown> = {}
        for (const method of ['select', 'eq', 'not', 'in', 'lte', 'order', 'limit', 'or', 'is', 'maybeSingle', 'single']) {
          builder[method] = () => builder
        }
        builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({
            data: tables[table] ?? [],
            error: null,
            count: (tables[table] ?? []).length,
          }).then(resolve, reject)
        return builder
      },
    }
  }

  it('returns counts from one bounded sweep without message bodies', async () => {
    const client = fakeClient({
      leads: [{ id: 'l1' }, { id: 'l2' }],
      conversation_states: [
        { lead_id: 'l1', last_reply_at: '2026-11-01T10:00:00Z', last_sent_at: null, stage: 'replied', won_at: null, lost_at: null },
        { lead_id: 'l2', last_reply_at: null, last_sent_at: '2026-11-01T10:00:00Z', stage: 'contacted', won_at: null, lost_at: null },
      ],
      assigned_tasks: [],
    })
    const counts = await loadSidebarCounts(client as never, { orgId: 'o1', repId: 'r1' })
    expect(counts.inboxNeedsReply).toBe(1)
    expect(counts.actionableTasks).toBe(0)
    // No message-body table is touched.
    expect(client.calls).not.toContain('messages')
  })

  it('reports null instead of zero when a read fails', async () => {
    const client = {
      from: () => {
        throw new Error('relation does not exist')
      },
    }
    const counts = await loadSidebarCounts(client as never, { orgId: 'o1', repId: 'r1' })
    expect(counts).toEqual({ inboxNeedsReply: null, actionableTasks: null })
  })
})
