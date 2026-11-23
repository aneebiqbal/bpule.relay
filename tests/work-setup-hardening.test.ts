/**
 * Hardening regressions for the canonical Work Setup write path.
 *
 * Two properties are load-bearing:
 *   1. every named seat must belong to the actor's organization (RLS checks the
 *      row's organization_id, not that rep_id is a member of it);
 *   2. replacing allocations must never leave a lane with zero active shares
 *      when a write fails halfway.
 */
import { describe, expect, it } from 'vitest'
import type { DbClient } from '@/lib/db/types'
import { assertSeatsInOrg } from '@/lib/profiles/assignment'
import { replacePlanAllocations } from '@/lib/operations/work-setup-write'
import { createFakeSupabase } from './helpers/fake-supabase'

const ORG = '11111111-1111-1111-1111-111111111111'
const PLAN = '22222222-2222-2222-2222-222222222222'

describe('assertSeatsInOrg', () => {
  it('accepts a rep that belongs to the organization', async () => {
    const { client } = createFakeSupabase({
      reps: [{ id: 'r1', organization_id: ORG }],
    })
    const result = await assertSeatsInOrg(client as unknown as DbClient, ORG, ['r1'])
    expect(result.ok).toBe(true)
  })

  it('rejects a rep from another organization', async () => {
    const { client } = createFakeSupabase({
      reps: [{ id: 'r1', organization_id: ORG }],
    })
    const result = await assertSeatsInOrg(client as unknown as DbClient, ORG, ['r1', 'r-foreign'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not in this organization/i)
  })

  it('accepts an empty seat list', async () => {
    const { client } = createFakeSupabase()
    const result = await assertSeatsInOrg(client as unknown as DbClient, ORG, [])
    expect(result.ok).toBe(true)
  })
})

describe('replacePlanAllocations', () => {
  it('updates an existing share and inserts a new one', async () => {
    const { client, tables } = createFakeSupabase({
      daily_plan_allocations: [
        { id: 'a1', organization_id: ORG, plan_id: PLAN, rep_id: 'r1', target_count: 2, active: true, created_by: 'admin' },
      ],
    })
    const result = await replacePlanAllocations(client as unknown as DbClient, {
      orgId: ORG,
      planId: PLAN,
      actorRepId: 'admin',
      shares: new Map([
        ['r1', 5],
        ['r2', 3],
      ]),
    })
    expect(result).toEqual({ ok: true, written: 2 })
    const rows = tables.daily_plan_allocations
    expect(rows.find((row) => row.id === 'a1')?.target_count).toBe(5)
    expect(rows.find((row) => row.id === 'a1')?.active).toBe(true)
    const inserted = rows.find((row) => row.rep_id === 'r2')
    expect(inserted?.active).toBe(true)
    expect(inserted?.target_count).toBe(3)
  })

  it('deactivates a share that is no longer wanted', async () => {
    const { client, tables } = createFakeSupabase({
      daily_plan_allocations: [
        { id: 'a1', organization_id: ORG, plan_id: PLAN, rep_id: 'r1', target_count: 2, active: true, created_by: 'admin' },
        { id: 'a2', organization_id: ORG, plan_id: PLAN, rep_id: 'r3', target_count: 4, active: true, created_by: 'admin' },
      ],
    })
    const result = await replacePlanAllocations(client as unknown as DbClient, {
      orgId: ORG,
      planId: PLAN,
      actorRepId: 'admin',
      shares: new Map([['r1', 2]]),
    })
    expect(result.ok).toBe(true)
    expect(tables.daily_plan_allocations.find((row) => row.id === 'a1')?.active).toBe(true)
    expect(tables.daily_plan_allocations.find((row) => row.id === 'a2')?.active).toBe(false)
  })

  it('leaves existing shares active when inserting a new share fails', async () => {
    const { client, tables } = createFakeSupabase({
      daily_plan_allocations: [
        { id: 'a1', organization_id: ORG, plan_id: PLAN, rep_id: 'r1', target_count: 2, active: true, created_by: 'admin' },
      ],
    })
    const originalFrom = client.from.bind(client)
    ;(client as unknown as { from: (table: string) => ReturnType<typeof originalFrom> }).from = (table: string) => {
      const builder = originalFrom(table)
      if (table === 'daily_plan_allocations') {
        builder.insert = (() => ({
          then(onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) {
            return Promise.resolve({ data: null, error: new Error('insert failed') }).then(onFulfilled, onRejected)
          },
        })) as ReturnType<typeof originalFrom>['insert']
      }
      return builder
    }

    const result = await replacePlanAllocations(client as unknown as DbClient, {
      orgId: ORG,
      planId: PLAN,
      actorRepId: 'admin',
      shares: new Map([
        ['r1', 5],
        ['r2', 3],
      ]),
    })
    expect(result.ok).toBe(false)
    const surviving = tables.daily_plan_allocations.filter((row) => row.active)
    expect(surviving).toHaveLength(1)
    expect(surviving[0].rep_id).toBe('r1')
  })
})
