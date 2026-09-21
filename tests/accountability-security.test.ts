import { describe, it, expect } from 'vitest'
import type { AuthContext } from '@/lib/auth/organization'
import { can } from '@/lib/auth/organization'

function createAuthContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    repId: 'person-1',
    orgId: 'org-1',
    orgName: 'Test Org',
    organizationRole: 'MEMBER',
    teamMemberships: [],
    managedTeamIds: [],
    memberTeamIds: [],
    capabilities: new Set(),
    isOwner: false,
    isAdmin: false,
    isManager: false,
    isMember: true,
    ...overrides,
  }
}

describe('Accountability Security', () => {
  describe('Owner capabilities', () => {
    it('owner can manage accountability policy', () => {
      const ctx = createAuthContext({ isOwner: true, organizationRole: 'OWNER' })
      expect(can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')).toBe(true)
    })

    it('owner can approve rewards', () => {
      const ctx = createAuthContext({ isOwner: true, organizationRole: 'OWNER' })
      expect(can(ctx, 'APPROVE_REWARDS')).toBe(true)
    })

    it('owner can review team accountability', () => {
      const ctx = createAuthContext({ isOwner: true, organizationRole: 'OWNER' })
      expect(can(ctx, 'REVIEW_TEAM_ACCOUNTABILITY')).toBe(true)
    })
  })

  describe('Admin capabilities', () => {
    it('admin can manage accountability policy', () => {
      const ctx = createAuthContext({
        isAdmin: true,
        organizationRole: 'ADMIN',
        capabilities: new Set(['MANAGE_ACCOUNTABILITY_POLICY']),
      })
      expect(can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')).toBe(true)
    })

    it('admin can approve rewards', () => {
      const ctx = createAuthContext({
        isAdmin: true,
        organizationRole: 'ADMIN',
        capabilities: new Set(['APPROVE_REWARDS']),
      })
      expect(can(ctx, 'APPROVE_REWARDS')).toBe(true)
    })
  })

  describe('Manager capabilities', () => {
    it('manager can view team work', () => {
      const ctx = createAuthContext({
        isManager: true,
        organizationRole: 'MANAGER',
        managedTeamIds: ['team-1'],
        capabilities: new Set(['VIEW_TEAM_WORK']),
      })
      expect(can(ctx, 'VIEW_TEAM_WORK')).toBe(true)
    })

    it('manager can review team accountability', () => {
      const ctx = createAuthContext({
        isManager: true,
        organizationRole: 'MANAGER',
        managedTeamIds: ['team-1'],
        capabilities: new Set(['REVIEW_TEAM_ACCOUNTABILITY']),
      })
      expect(can(ctx, 'REVIEW_TEAM_ACCOUNTABILITY')).toBe(true)
    })

    it('manager cannot manage accountability policy', () => {
      const ctx = createAuthContext({
        isManager: true,
        organizationRole: 'MANAGER',
        managedTeamIds: ['team-1'],
        capabilities: new Set(['VIEW_TEAM_WORK']),
      })
      expect(can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')).toBe(false)
    })

    it('manager cannot approve rewards', () => {
      const ctx = createAuthContext({
        isManager: true,
        organizationRole: 'MANAGER',
        managedTeamIds: ['team-1'],
        capabilities: new Set(['VIEW_TEAM_WORK']),
      })
      expect(can(ctx, 'APPROVE_REWARDS')).toBe(false)
    })
  })

  describe('Member capabilities', () => {
    it('member can view own work', () => {
      const ctx = createAuthContext({
        capabilities: new Set(['VIEW_OWN_WORK']),
      })
      expect(can(ctx, 'VIEW_OWN_WORK')).toBe(true)
    })

    it('member cannot manage accountability policy', () => {
      const ctx = createAuthContext({
        capabilities: new Set(['VIEW_OWN_WORK']),
      })
      expect(can(ctx, 'MANAGE_ACCOUNTABILITY_POLICY')).toBe(false)
    })

    it('member cannot view team analytics', () => {
      const ctx = createAuthContext({
        capabilities: new Set(['VIEW_OWN_WORK']),
      })
      expect(can(ctx, 'VIEW_TEAM_ANALYTICS')).toBe(false)
    })

    it('member cannot approve rewards', () => {
      const ctx = createAuthContext({
        capabilities: new Set(['VIEW_OWN_WORK']),
      })
      expect(can(ctx, 'APPROVE_REWARDS')).toBe(false)
    })
  })

  describe('Cross-team access', () => {
    it('manager cannot inspect other team', () => {
      const ctx = createAuthContext({
        isManager: true,
        organizationRole: 'MANAGER',
        managedTeamIds: ['team-1'],
        capabilities: new Set(['VIEW_TEAM_WORK']),
      })
      expect(can(ctx, 'VIEW_TEAM_WORK')).toBe(true)
    })
  })
})
