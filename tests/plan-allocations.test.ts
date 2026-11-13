import { describe, expect, it } from 'vitest'
import {
  computeProfileProgress,
  computeRepPlanTotal,
  findOverAllocatedLanes,
  planRequirement,
  type PlanLane,
  type RepAllocation,
  type RepContribution,
} from '@/lib/targets/plan-model'

const lanes: PlanLane[] = [
  { identityId: 'identity-1', activityType: 'connection_sent', targetCount: 30, targetable: true },
  { identityId: 'identity-1', activityType: 'dm_sent', targetCount: 20, targetable: true },
]

const contributions: RepContribution[] = [
  { repId: 'rep-hassan', completedCount: 12 },
  { repId: 'rep-ahmad', completedCount: 10 },
]

describe('shared vs allocated plans', () => {
  it('counts the shared requirement once, regardless of contributors', () => {
    const progress = computeProfileProgress({
      identityId: 'identity-1',
      lanes,
      contributions,
      completedByLane: { connection_sent: 22, dm_sent: 13 },
    })
    expect(progress.target).toBe(50)
    expect(progress.completed).toBe(22)
    expect(progress.remaining).toBe(28)
    expect(progress.allocated).toBe(false)
    expect(progress.allocations).toEqual([])
  })

  it('aggregates per-operator shares without changing the requirement', () => {
    const allocations: Record<string, RepAllocation[]> = {
      connection_sent: [
        { repId: 'rep-hassan', targetCount: 20 },
        { repId: 'rep-ahmad', targetCount: 10 },
      ],
      dm_sent: [
        { repId: 'rep-hassan', targetCount: 12 },
        { repId: 'rep-ahmad', targetCount: 8 },
      ],
    }
    const progress = computeProfileProgress({
      identityId: 'identity-1',
      lanes,
      contributions,
      completedByLane: { connection_sent: 22, dm_sent: 13 },
      allocationsByLane: allocations,
    })
    expect(progress.target).toBe(50)
    expect(progress.allocated).toBe(true)
    expect(progress.allocations).toEqual([
      { repId: 'rep-ahmad', targetCount: 18 },
      { repId: 'rep-hassan', targetCount: 32 },
    ])
  })

  it('ignores allocations on non-targetable lanes', () => {
    const tracked: PlanLane[] = [
      { identityId: 'identity-1', activityType: 'proposal_generated', targetCount: 5, targetable: false },
      ...lanes,
    ]
    const progress = computeProfileProgress({
      identityId: 'identity-1',
      lanes: tracked,
      contributions,
      allocationsByLane: {
        proposal_generated: [{ repId: 'rep-hassan', targetCount: 99 }],
      },
    })
    expect(progress.target).toBe(50)
    expect(progress.allocations).toEqual([])
    expect(progress.allocated).toBe(false)
  })

  it('rejects allocations that exceed the lane target', () => {
    const problems = findOverAllocatedLanes({
      lanes,
      allocationsByLane: {
        connection_sent: [
          { repId: 'rep-hassan', targetCount: 20 },
          { repId: 'rep-ahmad', targetCount: 15 },
        ],
        dm_sent: [
          { repId: 'rep-hassan', targetCount: 10 },
          { repId: 'rep-ahmad', targetCount: 10 },
        ],
      },
    })
    expect(problems).toEqual([
      { activityType: 'connection_sent', allocated: 35, targetCount: 30 },
    ])
  })

  it('accepts allocations that exactly match the target', () => {
    expect(
      findOverAllocatedLanes({
        lanes,
        allocationsByLane: {
          connection_sent: [
            { repId: 'rep-hassan', targetCount: 20 },
            { repId: 'rep-ahmad', targetCount: 10 },
          ],
        },
      }),
    ).toEqual([])
  })

  it('never lets a shared identity inflate a rep personal requirement', () => {
    const shared = new Set(['identity-1'])
    expect(computeRepPlanTotal(lanes, shared)).toBe(0)
    expect(planRequirement(lanes)).toBe(50)
  })
})
