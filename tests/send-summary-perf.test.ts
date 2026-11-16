/**
 * The rail and the app layout only need today's send count and the effective
 * ceiling. `getQueue()` also loaded every owned lead row, which made every
 * authenticated navigation fetch a payload it never rendered. Guard that the
 * cheap summary never touches `leads`.
 */
import { describe, expect, it } from 'vitest'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Organization, Rep } from '@/lib/domain/types'

const ORG_ID = '11111111-1111-1111-1111-111111111111'
const REP_ID = '22222222-2222-2222-2222-222222222222'

function makeRep(): Rep {
  return {
    id: REP_ID,
    name: 'Rep',
    role: 'member',
    organizationId: ORG_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    timezone: 'UTC',
  }
}

function makeOrg(): Organization {
  return {
    id: ORG_ID,
    name: 'Test Org',
    plan: 'active',
    billingCustomerId: null,
    timezone: 'UTC',
    workingDays: [1, 2, 3, 4, 5],
    holidays: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    settings: {},
  }
}

function countingClient(fake: ReturnType<typeof createFakeSupabase>) {
  const tables: string[] = []
  const originalFrom = fake.client.from.bind(fake.client)
  const client = Object.create(fake.client) as typeof fake.client
  client.from = (table: string) => {
    tables.push(table)
    return originalFrom(table)
  }
  return { client, tables }
}

describe('getSendSummary', () => {
  it('never reads the leads table', async () => {
    const fake = createFakeSupabase()
    const { client, tables } = countingClient(fake)
    const store = new SupabaseStore(makeRep(), client as never, makeOrg())

    await store.getSendSummary()

    expect(tables).not.toContain('leads')
    expect(tables).toContain('messages')
  })

  it('still returns the effective ceiling', async () => {
    const fake = createFakeSupabase()
    const { client } = countingClient(fake)
    const store = new SupabaseStore(makeRep(), client as never, makeOrg())

    const summary = await store.getSendSummary()

    expect(summary.todaySends).toBe(0)
    expect(summary.dailyLimit).toBeGreaterThan(0)
  })

  it('getQueue still loads leads (the payload the summary avoids)', async () => {
    const fake = createFakeSupabase({
      leads: [{ id: 'l1', organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'new' }],
    })
    const { client, tables } = countingClient(fake)
    const store = new SupabaseStore(makeRep(), client as never, makeOrg())

    await store.getQueue()

    expect(tables).toContain('leads')
  })
})
