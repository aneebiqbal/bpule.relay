import { describe, expect, it } from 'vitest'
import { defaultTargetsForChannel, formatDefaultPack, missingDefaultActivities } from '@/lib/accountability/default-targets'
import { buildTeamTargetOverview } from '@/lib/accountability/target-overview'
import { buildMockStore } from '@/lib/store/mock-store'

const admin = {
  id: 'rep-hassan',
  name: 'Hassan (demo)',
  role: 'admin' as const,
  organizationId: 'org-demo',
  createdAt: '2024-01-01T00:00:00.000Z',
  timezone: 'UTC',
}

describe('default daily target packs', () => {
  it('uses 30/30/30 for LinkedIn and 10/10 for Upwork', () => {
    expect(defaultTargetsForChannel('linkedin')).toEqual([
      { activityType: 'connection_request', targetCount: 30 },
      { activityType: 'dm', targetCount: 30 },
      { activityType: 'followup', targetCount: 30 },
    ])
    expect(defaultTargetsForChannel('upwork')).toEqual([
      { activityType: 'application', targetCount: 10 },
      { activityType: 'proposal', targetCount: 10 },
    ])
    expect(formatDefaultPack('linkedin')).toContain('30 connections')
  })

  it('only reports activities that are not already present', () => {
    const missing = missingDefaultActivities('linkedin', [
      { activityType: 'dm' },
    ])
    expect(missing.map((row) => row.activityType)).toEqual(['connection_request', 'followup'])
  })

  it('assigns the full pack when an identity is given to a rep', async () => {
    const store = buildMockStore({ rep: admin, mode: 'demo' })
    await store.assignIdentityAdmin('ri-demo-linkedin', 'rep-ahmed')
    const targets = (await store.listDailyTargetsAdmin()).filter(
      (target) => target.repId === 'rep-ahmed' && target.revenueIdentityId === 'ri-demo-linkedin',
    )
    expect(targets.map((target) => target.activityType).sort()).toEqual(['connection_request', 'dm', 'followup'])
    expect(targets.every((target) => target.targetCount === 30)).toBe(true)
  })

  it('does not overwrite a customized count on re-assign', async () => {
    const store = buildMockStore({ rep: admin, mode: 'demo' })
    await store.createDailyTargetAdmin({
      repId: 'rep-hassan',
      revenueIdentityId: 'ri-demo-linkedin',
      activityType: 'dm',
      targetCount: 12,
    })
    await store.assignIdentityAdmin('ri-demo-linkedin', 'rep-hassan')
    const dm = (await store.listDailyTargetsAdmin()).find(
      (target) => target.repId === 'rep-hassan' && target.revenueIdentityId === 'ri-demo-linkedin' && target.activityType === 'dm',
    )
    expect(dm?.targetCount).toBe(12)
    const followup = (await store.listDailyTargetsAdmin()).find(
      (target) => target.repId === 'rep-hassan' && target.revenueIdentityId === 'ri-demo-linkedin' && target.activityType === 'followup',
    )
    expect(followup?.targetCount).toBe(30)
  })

  it('shows each person and missing pack coverage to admin', () => {
    const overview = buildTeamTargetOverview({
      reps: [
        { id: 'rep-a', name: 'Ahmed' },
        { id: 'rep-b', name: 'Saud' },
      ],
      identities: [
        { id: 'ri-1', identityName: 'Mehak', channel: 'linkedin', status: 'active' },
      ],
      assignments: [{ repId: 'rep-a', revenueIdentityId: 'ri-1' }],
      targets: [
        {
          id: 'dt-1',
          organizationId: 'org',
          repId: 'rep-a',
          revenueIdentityId: 'ri-1',
          activityType: 'dm',
          targetCount: 30,
          active: true,
          createdBy: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    expect(overview.people).toHaveLength(1)
    expect(overview.people[0].repName).toBe('Ahmed')
    expect(overview.people[0].totalActionsPerDay).toBe(30)
    expect(overview.missingPacks).toBe(1)
    expect(overview.people[0].lanes[0].missing.map((row) => row.activityType)).toEqual(['connection_request', 'followup'])
  })
})
