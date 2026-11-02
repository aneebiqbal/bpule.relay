/**
 * AUTH_MEMBERSHIP_SINGLETON / AUTH_UNINVITED_USER_DENIED — invitation contract.
 *
 * The pending invitation lives in Relay's `pending_invitations` table, not in
 * auth metadata. These are the pure shape rules the callback and the invite API
 * share; the database round trip itself is covered by the RLS harness.
 */
import { describe, expect, it } from 'vitest'
import { isInviteEmail, nameFromEmail, repRoleFor } from '@/lib/auth/invitations'
import { parseInvitationRow } from '@/lib/auth/pending-invitations'

const ORG = '11111111-1111-1111-1111-111111111111'

describe('AUTH_UNINVITED_USER_DENIED', () => {
  it('a missing row is not a membership plan', () => {
    expect(parseInvitationRow(null)).toBeNull()
    expect(parseInvitationRow(undefined)).toBeNull()
  })

  it('an invitation without an organisation is not usable', () => {
    expect(parseInvitationRow({ organization_id: '', role: 'ADMIN', invited_by: null })).toBeNull()
    expect(parseInvitationRow({ organization_id: '   ', role: 'ADMIN', invited_by: null })).toBeNull()
  })
})

describe('AUTH_MEMBERSHIP_SINGLETON invitation parsing', () => {
  it('reads the organisation, role and inviter', () => {
    expect(
      parseInvitationRow({ organization_id: ORG, role: 'MANAGER', invited_by: 'rep-1' }),
    ).toEqual({ organizationId: ORG, role: 'MANAGER', invitedBy: 'rep-1' })
  })

  it('defaults a missing role to the least-privileged role', () => {
    expect(parseInvitationRow({ organization_id: ORG, role: '', invited_by: null })?.role).toBe('MEMBER')
    expect(parseInvitationRow({ organization_id: ORG, role: 'SUPERUSER', invited_by: null })?.role).toBe('MEMBER')
  })

  it('leaves the inviter null when none was recorded', () => {
    expect(parseInvitationRow({ organization_id: ORG, role: 'MEMBER', invited_by: null })?.invitedBy).toBeNull()
  })

  it('maps organisation roles onto the legacy rep role', () => {
    expect(repRoleFor('OWNER')).toBe('admin')
    expect(repRoleFor('ADMIN')).toBe('admin')
    expect(repRoleFor('MANAGER')).toBe('rep')
    expect(repRoleFor('MEMBER')).toBe('rep')
  })
})

describe('invite email and display name', () => {
  it('accepts a plausible work address', () => {
    expect(isInviteEmail('jane@company.com')).toBe(true)
    expect(isInviteEmail('not-an-email')).toBe(false)
  })

  it('derives a display name from the local part', () => {
    expect(nameFromEmail('jane.doe@company.com')).toBe('Jane Doe')
  })
})
