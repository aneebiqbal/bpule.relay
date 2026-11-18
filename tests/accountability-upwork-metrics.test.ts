import { describe, expect, it } from 'vitest'
import type { DbClient } from '@/lib/db/types'
import { getRepMetrics } from '@/lib/accountability/metrics'

/**
 * BUG-41 — saving an Upwork draft must count as an action, and must never be
 * reported as a submitted application.
 */

function stubClient(tables: Record<string, unknown[]>): DbClient {
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'gte', 'lte', 'in', 'neq', 'order', 'limit']) {
      chain[method] = () => chain
    }
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: tables[table] ?? [], error: null })
    return chain
  }
  return { from: (table: string) => makeChain(table) } as unknown as DbClient
}

const DAY = '2026-11-17'

describe('Upwork activity in daily accountability (BUG-41)', () => {
  it('counts a saved draft as one action but not as an application', async () => {
    const client = stubClient({
      messages: [],
      outcomes: [],
      leads: [],
      action_events: [
        { action_type: 'UPWORK_PROPOSAL_PREPARED', occurred_at: `${DAY}T10:00:00.000Z` },
      ],
    })
    const m = await getRepMetrics(client, 'rep-1', 'Rep', DAY)
    expect(m.upworkProposals).toBe(1)
    expect(m.upworkApplications).toBe(0)
    expect(m.outreachActions).toBe(1)
    expect(m.totalActions).toBe(1)
  })

  it('counts a submitted application separately from a draft', async () => {
    const client = stubClient({
      messages: [],
      outcomes: [],
      leads: [],
      action_events: [
        { action_type: 'UPWORK_PROPOSAL_PREPARED', occurred_at: `${DAY}T09:00:00.000Z` },
        { action_type: 'UPWORK_APPLICATION_SUBMITTED', occurred_at: `${DAY}T11:00:00.000Z` },
      ],
    })
    const m = await getRepMetrics(client, 'rep-1', 'Rep', DAY)
    expect(m.upworkProposals).toBe(1)
    expect(m.upworkApplications).toBe(1)
    expect(m.totalActions).toBe(2)
  })

  it('ignores unrelated action types', async () => {
    const client = stubClient({
      messages: [],
      outcomes: [],
      leads: [],
      action_events: [
        { action_type: 'CONNECTION_SENT', occurred_at: `${DAY}T10:00:00.000Z` },
      ],
    })
    const m = await getRepMetrics(client, 'rep-1', 'Rep', DAY)
    expect(m.upworkProposals).toBe(0)
    expect(m.upworkApplications).toBe(0)
    expect(m.totalActions).toBe(0)
  })

  it('leaves the response rate as a messaging metric', async () => {
    const client = stubClient({
      messages: [
        { type: 'dm', direction: 'outbound', sent_at: `${DAY}T09:00:00.000Z` },
        { type: 'dm', direction: 'inbound', sent_at: `${DAY}T10:00:00.000Z` },
      ],
      outcomes: [],
      leads: [],
      action_events: [
        { action_type: 'UPWORK_PROPOSAL_PREPARED', occurred_at: `${DAY}T11:00:00.000Z` },
      ],
    })
    const m = await getRepMetrics(client, 'rep-1', 'Rep', DAY)
    expect(m.outreachActions).toBe(2) // one DM + one draft
    expect(m.responseRate).toBe(100) // 1 reply of 1 message sent
  })
})
