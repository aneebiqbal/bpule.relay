import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { assembleWorkSetup } from '@/lib/operations/work-setup'
import { defaultTargetsForChannel } from '@/lib/accountability/default-targets'

const REPS = [
  { id: 'r1', name: 'Aneeb' },
  { id: 'r2', name: 'Ahmad' },
]
const IDENTITIES = [
  { id: 'i1', identityName: 'Aneeb · LinkedIn', channel: 'linkedin' as const, profileId: 'p1', status: 'active' },
]
const PROFILES = [
  {
    profileId: 'p1',
    profileName: 'Aneeb',
    identityIds: ['i1'],
    primaryRepId: 'r1',
    primaryRepName: 'Aneeb',
    operators: [{ repId: 'r2', repName: 'Ahmad' }],
    backups: [],
  },
]

function base(input: Parameters<typeof assembleWorkSetup>[0]) {
  return assembleWorkSetup({
    businessDate: '2026-11-23',
    timezone: 'Asia/Karachi',
    reps: REPS,
    identities: IDENTITIES,
    lanes: [],
    profiles: PROFILES,
    populations: {
      tracked: 0,
      requirement: 0,
      trackedNonTargetable: 0,
      assigned: 0,
      personal: 0,
      unseatedAllocationUnits: 0,
      unallocated: 0,
      requirementAssigned: 0,
      requirementUnallocated: 0,
      completed: 0,
    },
    overdueTasks: 0,
    revisions: new Map<string, string>(),
    ...input,
  })
}

describe('work setup surfaces every account', () => {
  it('reports an account with no plan as missing-target', () => {
    const payload = base({})
    const row = payload.rows.find((entry) => entry.identityId === 'i1')
    expect(row?.issues).toContain('missing-target')
    expect(row?.requirement).toBe(0)
  })

  it('reports an account with no primary as unassigned', () => {
    const payload = base({
      profiles: [{ ...PROFILES[0], primaryRepId: null, primaryRepName: null }],
    })
    const row = payload.rows.find((entry) => entry.identityId === 'i1')
    expect(row?.issues).toContain('unassigned')
  })

  it('counts a shared lane once and shows the unallocated remainder', () => {
    const pack = defaultTargetsForChannel('linkedin')
    const lanes = pack.map((row) => ({
      identityId: 'i1',
      planId: `plan-${row.activityType}`,
      activityType: row.activityType,
      targetCount: row.targetCount,
      targetable: true,
      completed: 0,
      allocations: [] as Array<{ repId: string; repName: string; targetCount: number }>,
    }))
    const payload = base({ lanes })
    const row = payload.rows.find((entry) => entry.identityId === 'i1')
    expect(row?.requirement).toBe(pack.reduce((sum, row) => sum + row.targetCount, 0))
    expect(row?.allocated).toBe(0)
    expect(row?.unallocated).toBe(row?.requirement)
    expect(row?.issues).not.toContain('missing-target')
  })

  it('allocations only count seated operators', () => {
    const lanes = [
      {
        identityId: 'i1',
        planId: 'plan-dm',
        activityType: 'dm',
        targetCount: 30,
        targetable: true,
        completed: 5,
        allocations: [
          { repId: 'r2', repName: 'Ahmad', targetCount: 20 },
          { repId: 'r-ghost', repName: 'Ghost', targetCount: 10 },
        ],
      },
    ]
    const payload = base({ lanes })
    const row = payload.rows.find((entry) => entry.identityId === 'i1')
    expect(row?.allocated).toBe(20)
    expect(row?.unallocated).toBe(10)
    expect(row?.issues).toContain('allocation-without-seat')
  })
})

describe('work setup write contract', () => {
  it('the writer validates the lane set and allocation sums', () => {
    const source = readFileSync('src/lib/operations/work-setup-write.ts', 'utf8')
    expect(source).toMatch(/WORK_SETUP_ACTIVITIES/)
    expect(source).toMatch(/above the lane target/)
    expect(source).toMatch(/saveResponsibilityChain/)
  })

  it('the API never writes coverage, plan or allocation tables directly', () => {
    const source = readFileSync('src/app/api/admin/work-setup/route.ts', 'utf8')
    expect(source).not.toMatch(/from\('profile_coverage'\)/)
    expect(source).not.toMatch(/from\('daily_target_plans'\)/)
    expect(source).not.toMatch(/from\('daily_plan_allocations'\)/)
  })

  it('the single-target route accepts every activity in the channel packs', () => {
    const source = readFileSync('src/lib/operations/work-setup-write.ts', 'utf8')
    for (const channel of ['linkedin', 'upwork', 'email'] as const) {
      for (const row of defaultTargetsForChannel(channel)) {
        expect(source, `${channel}:${row.activityType}`).toContain(`'${row.activityType}'`)
      }
    }
  })
})
