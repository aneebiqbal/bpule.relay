/**
 * Canonical daily accountability contracts.
 *
 * The organization's expected actions must equal the sum of unique approved
 * target units; personal allocations plus explicitly reported unallocated
 * shared work must reconcile to it. These assertions are the guard rail that
 * stops a surface from rebuilding the total with its own scope rules.
 */
import { describe, expect, it } from 'vitest'
import {
  getOrganizationDailySummary,
  lanePersonalTarget,
  loadAccountabilityLanes,
  type AccountabilityLane,
} from '@/lib/execution/accountability'
import { serviceDbClient } from '@/lib/db/client'

const ORG = '11111111-1111-1111-1111-111111111111'
const TODAY = new Date().toISOString().slice(0, 10)

function lane(partial: Partial<AccountabilityLane> & Pick<AccountabilityLane, 'targetCount' | 'seats'>): AccountabilityLane {
  return {
    planId: 'p',
    identityId: 'i',
    identityName: 'Identity',
    channel: 'linkedin',
    profileId: 'profile',
    activityType: 'dm',
    targetable: true,
    effectiveFrom: '2026-01-01',
    effectiveUntil: null,
    allocations: [],
    contributions: [],
    completed: 0,
    remaining: partial.targetCount,
    shared: partial.seats.length > 1,
    allocated: false,
    ...partial,
  }
}

describe('lanePersonalTarget', () => {
  it('a solo lane is the seat’s full expectation', () => {
    expect(lanePersonalTarget(lane({ targetCount: 30, seats: ['rep-1'] }), 'rep-1')).toBe(30)
    expect(lanePersonalTarget(lane({ targetCount: 30, seats: ['rep-1'] }), 'rep-2')).toBe(0)
  })

  it('a shared unallocated lane contributes zero to a personal expectation', () => {
    const shared = lane({ targetCount: 30, seats: ['rep-1', 'rep-2'] })
    expect(lanePersonalTarget(shared, 'rep-1')).toBe(0)
    expect(lanePersonalTarget(shared, 'rep-2')).toBe(0)
  })

  it('an allocation is the rep’s explicit share, never the whole lane', () => {
    const allocated = lane({
      targetCount: 10,
      seats: ['rep-1', 'rep-2'],
      allocations: [{ repId: 'rep-1', targetCount: 4 }],
    })
    expect(lanePersonalTarget(allocated, 'rep-1')).toBe(4)
    expect(lanePersonalTarget(allocated, 'rep-2')).toBe(0)
  })
})

describe('ORGANIZATION_DAILY_ACCOUNTABILITY', () => {
  it('assigned plus unallocated reconciles to the tracked total', async () => {
    const summary = await getOrganizationDailySummary(serviceDbClient(), {
      orgId: ORG,
      businessDate: TODAY,
    })
    expect(summary.tracked).toBeGreaterThan(0)
    expect(summary.assigned + summary.unallocated).toBe(summary.tracked)
    expect(summary.requirement).toBeLessThanOrEqual(summary.tracked)
  }, 60_000)

  it('the requirement counts every unique targetable lane exactly once', async () => {
    const client = serviceDbClient()
    const [summary, plans] = await Promise.all([
      getOrganizationDailySummary(client, { orgId: ORG, businessDate: TODAY }),
      client.from('daily_target_plans').select('target_count').eq('organization_id', ORG).eq('active', true).eq('targetable', true),
    ])
    const expected = (plans.data ?? []).reduce((sum, row) => sum + (row.target_count as number), 0)
    expect(summary.requirement).toBe(expected)
  }, 60_000)

  it('a shared lane is never duplicated into a personal expectation', async () => {
    const summary = await getOrganizationDailySummary(serviceDbClient(), {
      orgId: ORG,
      businessDate: TODAY,
    })
    const repAssigned = summary.reps.reduce((sum, rep) => sum + rep.assigned, 0)
    // Unseated allocations are reported separately, so the rep sum can be lower.
    expect(repAssigned).toBeLessThanOrEqual(summary.assigned)
    expect(summary.unseatedAllocationUnits).toBeGreaterThanOrEqual(0)
  }, 60_000)

  it('the lane completion is the sum of its operator contributions', async () => {
    const lanes = await loadAccountabilityLanes(serviceDbClient(), { orgId: ORG, businessDate: TODAY })
    for (const row of lanes) {
      expect(row.completed).toBe(row.contributions.reduce((sum, entry) => sum + entry.completedCount, 0))
    }
  }, 60_000)
})
