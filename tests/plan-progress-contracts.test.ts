/**
 * V6.1 canonical plan projection contracts.
 *
 * The projection is the ONE read model for "what does this channel owe today".
 * The profile total is the sum of operator contributions, and the team total
 * counts every unique channel lane exactly once — a shared requirement is never
 * duplicated per operator.
 */
import { describe, expect, it } from 'vitest'
import {
  computeTeamPlanTotalFromProgress,
  loadDailyPlanProgress,
} from '@/lib/targets/load-plan-progress'
import { serviceDbClient } from '@/lib/db/client'

const ORG = '11111111-1111-1111-1111-111111111111'
const TODAY = new Date().toISOString().slice(0, 10)

describe('PLAN_PROGRESS_PROJECTION', () => {
  it('the profile completed total equals the sum of its operator contributions', async () => {
    const client = serviceDbClient()
    const progress = await loadDailyPlanProgress(client, { orgId: ORG, businessDate: TODAY })
    expect(progress.length).toBeGreaterThan(0)
    for (const row of progress) {
      const sum = row.contributions.reduce((total, entry) => total + entry.completedCount, 0)
      expect(row.completed, row.identityName).toBe(sum)
    }
  }, 60_000)

  it('the team total counts every unique targetable channel lane exactly once', async () => {
    const client = serviceDbClient()
    const progress = await loadDailyPlanProgress(client, { orgId: ORG, businessDate: TODAY })
    const { data: plans, error } = await client
      .from('daily_target_plans')
      .select('target_count')
      .eq('organization_id', ORG)
      .eq('active', true)
      .eq('targetable', true)
    expect(error).toBeNull()
    const expected = (plans ?? []).reduce((total, row) => total + (row.target_count as number), 0)
    expect(computeTeamPlanTotalFromProgress(progress)).toBe(expected)
  }, 60_000)

  it('a plan-less channel reports no_plan, never a fake zero', async () => {
    const progress = await loadDailyPlanProgress(
      serviceDbClient(),
      { orgId: ORG, businessDate: TODAY },
    )
    for (const row of progress.filter((entry) => !entry.hasPlan)) {
      expect(row.target).toBe(0)
      expect(row.pace).toBe('no_plan')
    }
  }, 60_000)
})
