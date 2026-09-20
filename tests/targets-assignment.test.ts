import { describe, expect, it } from 'vitest'
import { buildMockStore } from '@/lib/store/mock-store'

const admin = {
  id: 'rep-hassan',
  name: 'Hassan (demo)',
  role: 'admin' as const,
  organizationId: 'org-demo',
  createdAt: '2024-01-01T00:00:00.000Z',
  timezone: 'UTC',
}

describe('Daily targets store', () => {
  it('lists seeded targets and keeps a save after a second list', async () => {
    const store = buildMockStore({ rep: admin, mode: 'demo' })
    const initial = await store.listDailyTargetsAdmin()
    expect(initial.length).toBeGreaterThan(0)

    const created = await store.createDailyTargetAdmin({
      repId: 'rep-hassan',
      revenueIdentityId: 'ri-demo-linkedin',
      activityType: 'followup',
      targetCount: 8,
    })
    expect(created.targetCount).toBe(8)
    expect(created.activityType).toBe('followup')

    const after = await store.listDailyTargetsAdmin()
    expect(after.some((t) => t.id === created.id && t.targetCount === 8)).toBe(true)
  })

  it('upserts the same identity + activity instead of duplicating', async () => {
    const store = buildMockStore({ rep: admin, mode: 'demo' })
    const first = await store.createDailyTargetAdmin({
      repId: 'rep-hassan',
      revenueIdentityId: 'ri-demo-linkedin',
      activityType: 'dm',
      targetCount: 12,
    })
    const second = await store.createDailyTargetAdmin({
      repId: 'rep-hassan',
      revenueIdentityId: 'ri-demo-linkedin',
      activityType: 'dm',
      targetCount: 18,
    })
    expect(second.id).toBe(first.id)
    expect(second.targetCount).toBe(18)
    const dms = (await store.listDailyTargetsAdmin()).filter(
      (t) => t.revenueIdentityId === 'ri-demo-linkedin' && t.activityType === 'dm',
    )
    expect(dms).toHaveLength(1)
  })

  it('rejects a target when the identity is not assigned to the rep', async () => {
    const store = buildMockStore({ rep: admin, mode: 'demo' })
    await expect(
      store.createDailyTargetAdmin({
        repId: 'rep-ahmed',
        revenueIdentityId: 'ri-demo-linkedin',
        activityType: 'dm',
        targetCount: 5,
      }),
    ).rejects.toThrow(/NOT_ASSIGNED/)
  })

  it('pause and delete survive a subsequent list', async () => {
    const store = buildMockStore({ rep: admin, mode: 'demo' })
    const created = await store.createDailyTargetAdmin({
      repId: 'rep-hassan',
      revenueIdentityId: 'ri-demo-upwork',
      activityType: 'followup',
      targetCount: 4,
    })
    const paused = await store.updateDailyTargetAdmin(created.id, { active: false })
    expect(paused.active).toBe(false)
    expect((await store.listDailyTargetsAdmin()).find((t) => t.id === created.id)?.active).toBe(false)

    await store.deleteDailyTargetAdmin(created.id)
    expect((await store.listDailyTargetsAdmin()).some((t) => t.id === created.id)).toBe(false)
  })
})
