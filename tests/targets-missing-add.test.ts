import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildTeamTargetOverview } from '@/lib/accountability/target-overview'
import { defaultTargetsForChannel } from '@/lib/accountability/default-targets'
import type { DailyTarget } from '@/lib/domain/types'

const REPS = [{ id: 'r1', name: 'Aneeb' }]
const IDENTITIES = [{ id: 'i1', identityName: 'Aneeb', channel: 'linkedin' as const, status: 'active', profileId: null }]
const ASSIGNMENTS = [{ repId: 'r1', revenueIdentityId: 'i1' }]

function target(overrides: Partial<DailyTarget>): DailyTarget {
  return {
    id: 't1',
    organizationId: 'o1',
    repId: 'r1',
    revenueIdentityId: 'i1',
    activityType: 'dm',
    targetCount: 5,
    active: true,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('missing target lanes can be added', () => {
  it('reports every pack activity that has no lane yet', () => {
    const overview = buildTeamTargetOverview({ reps: REPS, identities: IDENTITIES, assignments: ASSIGNMENTS, targets: [] })
    const lane = overview.people[0].lanes[0]
    expect(lane.missing.map((m) => m.activityType)).toEqual(
      defaultTargetsForChannel('linkedin').map((m) => m.activityType),
    )
  })

  it('a created target clears its lane from missing and keeps the pack complete', () => {
    const pack = defaultTargetsForChannel('linkedin')
    const targets = pack.map((row, index) =>
      target({ id: `t${index}`, activityType: row.activityType, targetCount: row.targetCount }),
    )
    const overview = buildTeamTargetOverview({ reps: REPS, identities: IDENTITIES, assignments: ASSIGNMENTS, targets })
    const lane = overview.people[0].lanes[0]
    expect(lane.missing).toHaveLength(0)
    expect(lane.actionsPerDay).toBe(pack.reduce((sum, row) => sum + row.targetCount, 0))
    expect(overview.people[0].packComplete).toBe(true)
  })

  it('the manager offers an add control for every missing lane', () => {
    const source = readFileSync('src/components/targets-manager.tsx', 'utf8')
    expect(source).toMatch(/addMissingTarget/)
    expect(source).toMatch(/assignIfNeeded: true/)
    expect(source).toMatch(/Missing · /)
  })

  it('the single-target route accepts every activity in the channel packs', () => {
    const source = readFileSync('src/app/api/admin/targets/route.ts', 'utf8')
    for (const channel of ['linkedin', 'upwork', 'email'] as const) {
      for (const row of defaultTargetsForChannel(channel)) {
        expect(source, `${channel}:${row.activityType}`).toContain(`'${row.activityType}'`)
      }
    }
  })
})
