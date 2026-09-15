import { describe, it, expect, beforeEach } from 'vitest'
import { buildMockStore } from '@/lib/store/mock-store'
import type { Rep, RevenueIdentity, DailyTarget } from '@/lib/domain/types'
import type { StoreContext } from '@/lib/store/types'

const ADMIN_REP: Rep = { id: 'rep-admin', name: 'Admin', role: 'admin', organizationId: 'org-demo', createdAt: '2024-01-01', timezone: 'UTC' }
const REGULAR_REP: Rep = { id: 'rep-regular', name: 'Rep', role: 'rep', organizationId: 'org-demo', createdAt: '2024-01-01', timezone: 'UTC' }

function adminCtx(): StoreContext { return { rep: ADMIN_REP, mode: 'demo' } }
function repCtx(): StoreContext { return { rep: REGULAR_REP, mode: 'demo' } }

describe('Revenue Identity OS — Security Model', () => {
  describe('Admin-only operations', () => {
    it('admin can list revenue identities', async () => {
      const store = buildMockStore(adminCtx())
      const identities = await store.listRevenueIdentitiesAdmin()
      expect(Array.isArray(identities)).toBe(true)
      expect(identities.length).toBeGreaterThan(0)
    })

    it('rep CANNOT list revenue identities (Admin only)', async () => {
      const store = buildMockStore(repCtx())
      await expect(store.listRevenueIdentitiesAdmin()).rejects.toThrow('Admin only')
    })

    it('admin can create revenue identity', async () => {
      const store = buildMockStore(adminCtx())
      const ri = await store.createRevenueIdentityAdmin({
        slug: 'test-identity',
        identityName: 'Test Identity',
        channel: 'linkedin',
        title: 'Senior Engineer',
      })
      expect(ri.id).toBeTruthy()
      expect(ri.identityName).toBe('Test Identity')
      expect(ri.status).toBe('active')
    })

    it('rep CANNOT create revenue identity', async () => {
      const store = buildMockStore(repCtx())
      await expect(store.createRevenueIdentityAdmin({
        slug: 'hack',
        identityName: 'Hack',
        channel: 'linkedin',
      })).rejects.toThrow('Admin only')
    })

    it('admin can archive identity', async () => {
      const store = buildMockStore(adminCtx())
      const identities = await store.listRevenueIdentitiesAdmin()
      const target = identities[0]
      await store.archiveRevenueIdentityAdmin(target.id)
      const updated = await store.getRevenueIdentityAdmin(target.id)
      expect(updated?.status).toBe('archived')
    })

    it('rep CANNOT archive identity', async () => {
      const store = buildMockStore(repCtx())
      await expect(store.archiveRevenueIdentityAdmin('ri-demo-linkedin')).rejects.toThrow('Admin only')
    })
  })

  describe('Assignment operations', () => {
    it('admin can assign identity to rep', async () => {
      const store = buildMockStore(adminCtx())
      const assignment = await store.assignIdentityAdmin('ri-demo-linkedin', 'rep-regular')
      expect(assignment.revenueIdentityId).toBe('ri-demo-linkedin')
      expect(assignment.repId).toBe('rep-regular')
    })

    it('rep CANNOT assign identity', async () => {
      const store = buildMockStore(repCtx())
      await expect(store.assignIdentityAdmin('ri-demo-linkedin', 'rep-regular')).rejects.toThrow('Admin only')
    })

    it('admin can unassign identity', async () => {
      const store = buildMockStore(adminCtx())
      await store.unassignIdentityAdmin('ri-demo-linkedin', 'rep-regular')
      const assignments = await store.listIdentityAssignmentsAdmin()
      const stillAssigned = assignments.find((a) => a.revenueIdentityId === 'ri-demo-linkedin' && a.repId === 'rep-regular')
      expect(stillAssigned).toBeUndefined()
    })
  })

  describe('Target operations', () => {
    it('admin can create daily target', async () => {
      const store = buildMockStore(adminCtx())
      const target = await store.createDailyTargetAdmin({
        repId: 'rep-regular',
        revenueIdentityId: 'ri-demo-linkedin',
        activityType: 'dm',
        targetCount: 25,
      })
      expect(target.targetCount).toBe(25)
      expect(target.active).toBe(true)
    })

    it('rep CANNOT create target', async () => {
      const store = buildMockStore(repCtx())
      await expect(store.createDailyTargetAdmin({
        repId: 'rep-regular',
        revenueIdentityId: 'ri-demo-linkedin',
        activityType: 'dm',
        targetCount: 25,
      })).rejects.toThrow('Admin only')
    })

    it('admin can delete target', async () => {
      const store = buildMockStore(adminCtx())
      const targets = await store.listDailyTargetsAdmin()
      if (targets.length > 0) {
        await store.deleteDailyTargetAdmin(targets[0].id)
        const updated = await store.listDailyTargetsAdmin()
        expect(updated.find((t) => t.id === targets[0].id)).toBeUndefined()
      }
    })
  })

  describe('Rep read access', () => {
    it('rep CAN list their assigned identities', async () => {
      const store = buildMockStore(repCtx())
      Object.defineProperty(repCtx().rep, 'id', { value: 'rep-hassan' })
      const assigned = await store.listMyAssignedIdentities()
      expect(Array.isArray(assigned)).toBe(true)
    })

    it('rep CAN get today accountability', async () => {
      const store = buildMockStore(repCtx())
      Object.defineProperty(repCtx().rep, 'id', { value: 'rep-hassan' })
      const today = await store.getMyTodayAccountability()
      expect(today).toHaveProperty('totalTarget')
      expect(today).toHaveProperty('totalCompleted')
      expect(today).toHaveProperty('overallStatus')
    })

    it('rep CANNOT access admin command center', async () => {
      const store = buildMockStore(repCtx())
      await expect(store.getCommandCenterAdmin()).rejects.toThrow('Admin only')
    })

    it('rep CANNOT access audit log', async () => {
      const store = buildMockStore(repCtx())
      await expect(store.listAuditLogAdmin()).rejects.toThrow('Admin only')
    })
  })
})
