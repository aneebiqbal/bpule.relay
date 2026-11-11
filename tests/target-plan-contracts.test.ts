/**
 * V6.1 plan-model contracts.
 *
 * A plan belongs to the channel. Operators contribute toward it. Shared
 * operators never duplicate the requirement, and a REPLACE never resets it.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import {
  computeProfileProgress,
  computeRepPlanTotal,
  computeTeamPlanTotal,
  findSharedIdentities,
  planRequirement,
  type PlanLane,
} from '@/lib/targets/plan-model'

const ZAIRA = 'identity-zaira-upwork'

function lane(over: Partial<PlanLane> = {}): PlanLane {
  return {
    identityId: ZAIRA,
    activityType: 'application_submitted',
    targetCount: 10,
    targetable: true,
    ...over,
  }
}

describe('PROFILE_CHANNEL_PLAN_SINGLETON', () => {
  it('one lane is one requirement, no matter how many operators exist', () => {
    const lanes = [lane()]
    expect(planRequirement(lanes)).toBe(10)
    expect(computeTeamPlanTotal([...lanes, ...lanes])).toBe(10)
  })

  it('the production backfill produced exactly one plan per lane', () => {
    const migration = readFileSync(
      'supabase/migrations/20261111130000_daily_target_plans_v61.sql',
      'utf8',
    )
    expect(migration).toMatch(/dtp_active_lane_uniq/)
    expect(migration).toMatch(/where active;/)
  })
})

describe('SHARED_OPERATOR_DOES_NOT_DUPLICATE_PLAN', () => {
  it('two contributors share one requirement, not two', () => {
    const progress = computeProfileProgress({
      identityId: ZAIRA,
      lanes: [lane()],
      contributions: [
        { repId: 'rep-hassan', completedCount: 4 },
        { repId: 'rep-dawood', completedCount: 3 },
      ],
    })
    expect(progress.target).toBe(10)
    expect(progress.completed).toBe(7)
    expect(progress.remaining).toBe(3)
    expect(progress.contributions).toHaveLength(2)
  })

  it('the team total counts a shared lane once', () => {
    expect(computeTeamPlanTotal([lane(), lane()])).toBe(10)
  })
})

describe('PROFILE_COMPLETION_SUMS_OPERATOR_CONTRIBUTIONS', () => {
  it('the profile total equals the sum of contributions exactly', () => {
    const progress = computeProfileProgress({
      identityId: ZAIRA,
      lanes: [lane()],
      contributions: [
        { repId: 'a', completedCount: 4 },
        { repId: 'b', completedCount: 3 },
        { repId: 'c', completedCount: 0 },
      ],
    })
    const sum = progress.contributions.reduce((total, row) => total + row.completedCount, 0)
    expect(progress.completed).toBe(sum)
  })
})

describe('REPLACE_OPERATOR_DOES_NOT_MOVE_PLAN', () => {
  it('a midday replacement keeps the completion and the requirement', () => {
    // Hassan does 5 before 13:00; Dawood replaces and does 3.
    const before = computeProfileProgress({
      identityId: ZAIRA,
      lanes: [lane()],
      contributions: [{ repId: 'rep-hassan', completedCount: 5 }],
    })
    const after = computeProfileProgress({
      identityId: ZAIRA,
      lanes: [lane()],
      contributions: [
        { repId: 'rep-hassan', completedCount: 5 },
        { repId: 'rep-dawood', completedCount: 3 },
      ],
    })
    expect(after.target).toBe(before.target)
    expect(after.completed).toBe(8)
    expect(after.remaining).toBe(2)
    // Hassan's history is preserved.
    expect(after.contributions.find((row) => row.repId === 'rep-hassan')?.completedCount).toBe(5)
  })
})

describe('TEAM_TOTAL_COUNTS_PLAN_ONCE', () => {
  it('a shared Upwork plan contributes 12, not 24', () => {
    const lanes = [
      lane({ activityType: 'application_submitted', targetCount: 10 }),
      lane({ activityType: 'email_sent', targetCount: 2 }),
    ]
    expect(computeTeamPlanTotal(lanes)).toBe(12)
  })
})

describe('REP_PERSONAL_TOTAL_EXCLUDES_SHARED', () => {
  it('a shared identity is not claimed as a personal requirement', () => {
    const shared = findSharedIdentities(
      [ZAIRA],
      new Map([[ZAIRA, ['rep-hassan', 'rep-dawood']]]),
    )
    expect(shared.has(ZAIRA)).toBe(true)
    expect(computeRepPlanTotal([lane()], shared)).toBe(0)
    expect(computeRepPlanTotal([lane()], new Set())).toBe(10)
  })
})

describe('NO_TARGET_MEANS_NO_FAKE_ZERO', () => {
  it('a plan-less identity reports hasPlan=false and no 0/0 requirement', () => {
    const progress = computeProfileProgress({ identityId: ZAIRA, lanes: [], contributions: [] })
    expect(progress.hasPlan).toBe(false)
    expect(progress.target).toBe(0)
    expect(progress.remaining).toBe(0)
  })

  it('a tracked-only lane is not a requirement', () => {
    const progress = computeProfileProgress({
      identityId: ZAIRA,
      lanes: [lane({ activityType: 'proposal_generated', targetable: false })],
      contributions: [{ repId: 'rep-hassan', completedCount: 2 }],
    })
    expect(progress.hasPlan).toBe(false)
    expect(progress.target).toBe(0)
    // The tracked action is still visible.
    expect(progress.lanes[0].completedCount).toBe(0)
    expect(progress.lanes[0].targetable).toBe(false)
  })
})

describe('UPWORK_GENERATED_NOT_TARGETABLE', () => {
  it('draft generation never joins the requirement', () => {
    const lanes = [
      lane({ activityType: 'application_submitted', targetCount: 10 }),
      lane({ activityType: 'proposal_generated', targetCount: 2, targetable: false }),
    ]
    expect(planRequirement(lanes)).toBe(10)
  })
})

describe('ONE_COMPLETION_AUTHORITY', () => {
  it('the accountability event route delegates to the canonical RPC', () => {
    const source = readFileSync('src/app/api/accountability/event/route.ts', 'utf8')
    expect(source).toMatch(/record_activity_event/)
    // No direct accountability writes and no local pace logic.
    expect(source).not.toMatch(/\.from\('daily_accountability'\)/)
    expect(source).not.toMatch(/computeStatus/)
  })
})

describe('PLAN_AUTHORITY_SINGLE', () => {
  it('no application code reads the retired rep-scoped daily_targets table', () => {
    const roots = ['src/lib', 'src/app', 'src/components']
    const offenders: string[] = []
    const walk = (dir: string): string[] => {
      const out: string[] = []
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`
        if (entry.isDirectory()) out.push(...walk(path))
        else if (/\.tsx?$/.test(entry.name)) out.push(path)
      }
      return out
    }
    for (const root of roots) {
      for (const file of walk(root)) {
        const source = readFileSync(file, 'utf8')
        if (/from\(\s*['"]daily_targets['"]\s*\)/.test(source)) offenders.push(file)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('TARGET_HISTORY_NOT_REWRITTEN', () => {
  it('the plan model is effective-dated in the schema', () => {
    const migration = readFileSync(
      'supabase/migrations/20261111130000_daily_target_plans_v61.sql',
      'utf8',
    )
    expect(migration).toMatch(/effective_from date not null/)
    expect(migration).toMatch(/effective_until date/)
  })
})
