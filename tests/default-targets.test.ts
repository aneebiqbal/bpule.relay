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
  // Rebalanced (approved product design): a lead can only ever receive 3
  // follow-ups total across its life (see followup-engine.ts's cap raise
  // 1 -> 3), so a flat 30/day followup target was never realistic — lowered
  // to 3/day. Upwork: one apply IS one proposal — single target, single
  // truth (see default-targets.ts). prospect_extracted is a new activity
  // type (extraction now earns real accountability credit) added to both
  // LinkedIn and Email packs, since /prospect capture happens on both.
  it('uses channel-specific default packs', () => {
    expect(defaultTargetsForChannel('linkedin')).toEqual([
      { activityType: 'connection_request', targetCount: 30 },
      { activityType: 'dm', targetCount: 30 },
      { activityType: 'followup', targetCount: 3 },
      { activityType: 'prospect_extracted', targetCount: 15 },
    ])
    expect(defaultTargetsForChannel('email')).toEqual([
      { activityType: 'email', targetCount: 25 },
      { activityType: 'followup', targetCount: 3 },
      { activityType: 'prospect_extracted', targetCount: 15 },
    ])
    expect(defaultTargetsForChannel('upwork')).toEqual([
      { activityType: 'application', targetCount: 10 },
    ])
    expect(formatDefaultPack('email')).toContain('25 emails')
    expect(formatDefaultPack('linkedin')).toContain('30 connections')
  })

  it('only reports activities that are not already present', () => {
    const missing = missingDefaultActivities('linkedin', [
      { activityType: 'dm' },
    ])
    expect(missing.map((row) => row.activityType)).toEqual(['connection_request', 'followup', 'prospect_extracted'])
  })

  it('assigns the full pack when an identity is given to a rep', async () => {
    const store = buildMockStore({ rep: admin, mode: 'demo' })
    await store.assignIdentityAdmin('ri-demo-linkedin', 'rep-ahmed')
    const targets = (await store.listDailyTargetsAdmin()).filter(
      (target) => target.repId === 'rep-ahmed' && target.revenueIdentityId === 'ri-demo-linkedin',
    )
    expect(targets.map((target) => target.activityType).sort()).toEqual(['connection_request', 'dm', 'followup', 'prospect_extracted'])
    const byType = Object.fromEntries(targets.map((t) => [t.activityType, t.targetCount]))
    expect(byType.connection_request).toBe(30)
    expect(byType.dm).toBe(30)
    expect(byType.followup).toBe(3)
    expect(byType.prospect_extracted).toBe(15)
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
    expect(followup?.targetCount).toBe(3)
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
    // prospect_extracted joins the missing list too — it's now part of
    // LINKEDIN_PACK (extraction credit rebalance, part B).
    expect(overview.people[0].lanes[0].missing.map((row) => row.activityType)).toEqual(['connection_request', 'followup', 'prospect_extracted'])
  })
})
