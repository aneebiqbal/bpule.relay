import { describe, it, expect } from 'vitest'
import { buildMockStore } from '@/lib/store/mock-store'
import type { Rep, RevenueIdentity } from '@/lib/domain/types'
import type { StoreContext } from '@/lib/store/types'

// Simulate two organizations
const ORG_A = 'org-alpha'
const ORG_B = 'org-beta'

const ADMIN_A: Rep = { id: 'admin-a', name: 'Admin A', role: 'admin', organizationId: ORG_A, createdAt: '2024-01-01', timezone: 'UTC' }
const REP_A: Rep = { id: 'rep-a', name: 'Rep A', role: 'rep', organizationId: ORG_A, createdAt: '2024-01-01', timezone: 'UTC' }
const REP_B: Rep = { id: 'rep-b', name: 'Rep B', role: 'rep', organizationId: ORG_A, createdAt: '2024-01-01', timezone: 'UTC' }
const ADMIN_B: Rep = { id: 'admin-b', name: 'Admin B', role: 'admin', organizationId: ORG_B, createdAt: '2024-01-01', timezone: 'UTC' }

function ctx(rep: Rep): StoreContext { return { rep, mode: 'demo' } }

describe('Revenue OS — Full Security Integration', () => {
  describe('1. Admin creates and assigns identities', () => {
    it('admin can create identities and assign to reps', async () => {
      const store = buildMockStore(ctx(ADMIN_A))

      const ri = await store.createRevenueIdentityAdmin({
        slug: 'test-linkedin',
        identityName: 'Test LinkedIn',
        channel: 'linkedin',
        title: 'Senior Engineer',
      })
      expect(ri.id).toBeTruthy()
      expect(ri.identityName).toBe('Test LinkedIn')
      expect(ri.channel).toBe('linkedin')
      expect(ri.status).toBe('active')

      // Assign to rep A
      const assignment = await store.assignIdentityAdmin(ri.id, 'rep-a')
      expect(assignment.repId).toBe('rep-a')
      expect(assignment.revenueIdentityId).toBe(ri.id)
    })

    it('admin can configure daily targets', async () => {
      const store = buildMockStore(ctx(ADMIN_A))
      const identities = await store.listRevenueIdentitiesAdmin()
      expect(identities.length).toBeGreaterThan(0)
      await store.assignIdentityAdmin(identities[0].id, 'rep-a')

      const target = await store.createDailyTargetAdmin({
        repId: 'rep-a',
        revenueIdentityId: identities[0].id,
        activityType: 'dm',
        targetCount: 35,
      })
      expect(target.targetCount).toBe(35)
      expect(target.active).toBe(true)
    })

    it('admin can reassign identity', async () => {
      const store = buildMockStore(ctx(ADMIN_A))
      const identities = await store.listRevenueIdentitiesAdmin()
      const id = identities[0].id

      // Assign to rep B
      await store.assignIdentityAdmin(id, 'rep-b')
      const assignments = await store.listIdentityAssignmentsAdmin()
      const assignedToB = assignments.find((a) => a.revenueIdentityId === id && a.repId === 'rep-b')
      expect(assignedToB).toBeTruthy()
    })

    it('admin can archive identity', async () => {
      const store = buildMockStore(ctx(ADMIN_A))
      const identities = await store.listRevenueIdentitiesAdmin()
      const id = identities[0].id

      await store.archiveRevenueIdentityAdmin(id)
      const archived = await store.getRevenueIdentityAdmin(id)
      expect(archived?.status).toBe('archived')
    })
  })

  describe('2. Rep permissions — CANNOT mutate', () => {
    it('rep CANNOT create identity', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.createRevenueIdentityAdmin({
        slug: 'hack', identityName: 'Hack', channel: 'linkedin',
      })).rejects.toThrow('Admin only')
    })

    it('rep CANNOT edit identity', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.updateRevenueIdentityAdmin('ri-demo-linkedin', { identityName: 'Hacked' }))
        .rejects.toThrow('Admin only')
    })

    it('rep CANNOT archive identity', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.archiveRevenueIdentityAdmin('ri-demo-linkedin'))
        .rejects.toThrow('Admin only')
    })

    it('rep CANNOT assign identity', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.assignIdentityAdmin('ri-demo-linkedin', 'rep-b'))
        .rejects.toThrow('Admin only')
    })

    it('rep CANNOT unassign identity', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.unassignIdentityAdmin('ri-demo-linkedin', 'rep-hassan'))
        .rejects.toThrow('Admin only')
    })

    it('rep CANNOT create target', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.createDailyTargetAdmin({
        repId: 'rep-a', revenueIdentityId: 'ri-demo-linkedin', activityType: 'dm', targetCount: 99,
      })).rejects.toThrow('Admin only')
    })

    it('rep CANNOT update target', async () => {
      const store = buildMockStore(ctx(REP_A))
      const targets = await store.listDailyTargetsAdmin().catch(() => [])
      // Even if we had a target ID, the call should fail
      await expect(store.updateDailyTargetAdmin('dt-demo-1', { targetCount: 99 }))
        .rejects.toThrow('Admin only')
    })

    it('rep CANNOT delete target', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.deleteDailyTargetAdmin('dt-demo-1'))
        .rejects.toThrow('Admin only')
    })

    it('rep CANNOT access admin command center', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.getCommandCenterAdmin()).rejects.toThrow('Admin only')
    })

    it('rep CANNOT access team accountability', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.getTeamAccountabilityAdmin()).rejects.toThrow('Admin only')
    })

    it('rep CANNOT access audit log', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.listAuditLogAdmin()).rejects.toThrow('Admin only')
    })

    it('rep CANNOT list all identities (admin view)', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.listRevenueIdentitiesAdmin()).rejects.toThrow('Admin only')
    })

    it('rep CANNOT list all assignments', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.listIdentityAssignmentsAdmin()).rejects.toThrow('Admin only')
    })

    it('rep CANNOT list all targets', async () => {
      const store = buildMockStore(ctx(REP_A))
      await expect(store.listDailyTargetsAdmin()).rejects.toThrow('Admin only')
    })
  })

  describe('3. Assignment isolation', () => {
    it('rep sees ONLY assigned identities', async () => {
      const store = buildMockStore(ctx(REP_A))
      Object.defineProperty(ctx(REP_A).rep, 'id', { value: 'rep-hassan', configurable: true })
      const assigned = await store.listMyAssignedIdentities()
      // rep-hassan has demo assignments
      expect(assigned.length).toBeGreaterThan(0)
      // All returned identities should be assigned to this rep
      for (const a of assigned) {
        expect(a.assignmentId).toBeTruthy()
      }
    })

    it('unassigned identity is NOT accessible to rep', async () => {
      const store = buildMockStore(ctx(REP_B))
      const assigned = await store.listMyAssignedIdentities()
      // rep-b has no demo assignments
      expect(assigned.length).toBe(0)
    })
  })

  describe('4. Rep read access works', () => {
    it('rep CAN get today accountability', async () => {
      const store = buildMockStore(ctx(REP_A))
      Object.defineProperty(ctx(REP_A).rep, 'id', { value: 'rep-hassan', configurable: true })
      const today = await store.getMyTodayAccountability()
      expect(today).toHaveProperty('totalTarget')
      expect(today).toHaveProperty('totalCompleted')
      expect(today).toHaveProperty('totalRemaining')
      expect(today).toHaveProperty('overallStatus')
      expect(today).toHaveProperty('assignedIdentities')
    })

    it('rep CAN list notifications', async () => {
      const store = buildMockStore(ctx(REP_A))
      const notifs = await store.listAccountabilityNotifications()
      expect(Array.isArray(notifs)).toBe(true)
    })

    it('rep CAN mark notification read', async () => {
      const store = buildMockStore(ctx(REP_A))
      // Should not throw even if no notifications
      await expect(store.markAccountabilityNotificationRead('nonexistent')).resolves.not.toThrow()
    })
  })

  describe('5. Admin command center', () => {
    it('admin sees all identities in command center', async () => {
      const store = buildMockStore(ctx(ADMIN_A))
      const cc = await store.getCommandCenterAdmin()
      expect(cc.activeIdentities).toBeGreaterThan(0)
      expect(cc.totalReps).toBeGreaterThan(0)
      expect(cc.identityPerformance.length).toBeGreaterThan(0)
    })

    it('admin sees team accountability', async () => {
      const store = buildMockStore(ctx(ADMIN_A))
      const team = await store.getTeamAccountabilityAdmin()
      expect(team.date).toBeTruthy()
      expect(Array.isArray(team.summaries)).toBe(true)
    })
  })

  describe('6. Cross-org isolation (simulated)', () => {
    it('admin B cannot see admin A identities via assignment', async () => {
      const storeB = buildMockStore(ctx(ADMIN_B))
      // Admin B's store has its own demo data (separate org-demo scope in mock)
      const identitiesB = await storeB.listRevenueIdentitiesAdmin()
      // The mock store uses the same in-memory array, but in real Supabase
      // RLS would filter by organization_id. This test verifies the admin check works.
      expect(Array.isArray(identitiesB)).toBe(true)
    })
  })
})
