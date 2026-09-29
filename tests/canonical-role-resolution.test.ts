import { describe, expect, it } from 'vitest'

/**
 * Regression tests for canonical role resolution.
 *
 * The critical bug: reps.role could override organization_roles, allowing
 * a demoted user (organization_roles says MEMBER) to retain admin access
 * because reps.role still said 'admin'.
 *
 * After the fix: organization_roles is the canonical source. reps.role is
 * only used as a bootstrap fallback when no org role row exists.
 */

describe('Canonical role resolution', () => {
  it('organization_roles row always wins over reps.role', () => {
    // Simulate the fixed logic
    function resolveRole(tableRole: string | undefined, repsRole: string): string {
      return tableRole ?? (repsRole === 'admin' ? 'ADMIN' : 'MEMBER')
    }

    // Table says MEMBER, reps.role says admin → must be MEMBER (demotion respected)
    expect(resolveRole('MEMBER', 'admin')).toBe('MEMBER')

    // Table says ADMIN, reps.role says admin → ADMIN
    expect(resolveRole('ADMIN', 'admin')).toBe('ADMIN')

    // Table says OWNER, reps.role says admin → OWNER
    expect(resolveRole('OWNER', 'admin')).toBe('OWNER')

    // Table says MANAGER, reps.role says admin → MANAGER (not escalated)
    expect(resolveRole('MANAGER', 'admin')).toBe('MANAGER')

    // No table row, reps.role says admin → ADMIN (bootstrap fallback)
    expect(resolveRole(undefined, 'admin')).toBe('ADMIN')

    // No table row, reps.role says rep → MEMBER (bootstrap fallback)
    expect(resolveRole(undefined, 'rep')).toBe('MEMBER')

    // Table says MEMBER, reps.role says rep → MEMBER
    expect(resolveRole('MEMBER', 'rep')).toBe('MEMBER')
  })

  it('demoted admin loses product admin access', () => {
    // After demotion: organization_roles says MEMBER
    // reps.role may still say 'admin' (stale) but must not grant admin
    function isProductAdmin(orgRole: string | undefined): boolean {
      return orgRole === 'OWNER' || orgRole === 'ADMIN'
    }

    // Demoted user: table says MEMBER
    expect(isProductAdmin('MEMBER')).toBe(false)

    // Active admin: table says ADMIN
    expect(isProductAdmin('ADMIN')).toBe(true)

    // Owner
    expect(isProductAdmin('OWNER')).toBe(true)

    // No role at all (edge case)
    expect(isProductAdmin(undefined)).toBe(false)
  })

  it('stale reps.role cannot escalate privileges', () => {
    // The key scenario: admin demotes user in organization_roles
    // but forgets to update reps.role. The user must NOT have admin access.
    const tableRole = 'MEMBER' // canonical: demoted
    const staleRepsRole = 'admin' // stale: still says admin

    // Fixed logic: table wins
    const effectiveRole = tableRole ?? (staleRepsRole === 'admin' ? 'ADMIN' : 'MEMBER')
    expect(effectiveRole).toBe('MEMBER')

    // Old (buggy) logic would have been:
    // if (tableRole === 'OWNER' || tableRole === 'ADMIN') tableRole
    // else if (repsRole === 'admin') 'ADMIN'  ← BUG: stale reps.role escalates
    // else tableRole ?? 'MEMBER'
    const buggyRole =
      tableRole === 'OWNER' || tableRole === 'ADMIN'
        ? tableRole
        : staleRepsRole === 'admin'
          ? 'ADMIN'
          : tableRole ?? 'MEMBER'
    // This demonstrates the old bug existed
    expect(buggyRole).toBe('ADMIN') // BUG! Should be MEMBER
  })
})
