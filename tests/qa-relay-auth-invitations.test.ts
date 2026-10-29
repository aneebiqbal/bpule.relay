/**
 * AUTH_MEMBERSHIP_SINGLETON / AUTH_UNINVITED_USER_DENIED — invitation contract.
 *
 * The pending invitation lives in admin-only `app_metadata`. These are the
 * pure rules the callback and the invite API share.
 */
import { describe, expect, it } from 'vitest'
import {
  INVITATION_KEY,
  isInviteEmail,
  nameFromEmail,
  readInvitation,
  repRoleFor,
} from '@/lib/auth/invitations'

const ORG = '11111111-1111-1111-1111-111111111111'

describe('AUTH_UNINVITED_USER_DENIED', () => {
  it('an account with no invitation metadata has no membership plan', () => {
    expect(readInvitation({})).toBeNull()
    expect(readInvitation(null)).toBeNull()
    expect(readInvitation({ provider: 'google' })).toBeNull()
  })

  it('an invitation without an organisation is not usable', () => {
    expect(readInvitation({ [INVITATION_KEY]: { role: 'ADMIN' } })).toBeNull()
    expect(readInvitation({ [INVITATION_KEY]: { organization_id: '   ' } })).toBeNull()
  })
})

describe('AUTH_MEMBERSHIP_SINGLETON invitation parsing', () => {
  it('reads the organisation, role and inviter', () => {
    expect(readInvitation({
      [INVITATION_KEY]: { organization_id: ORG, role: 'MANAGER', invited_by: 'rep-1' },
    })).toEqual({ organizationId: ORG, role: 'MANAGER', invitedBy: 'rep-1' })
  })

  it('defaults an unknown role to the least-privileged role', () => {
    expect(readInvitation({ [INVITATION_KEY]: { organization_id: ORG, role: 'SUPERUSER' } })?.role).toBe('MEMBER')
  })

  it('maps organisation roles onto the legacy rep role', () => {
    expect(repRoleFor('OWNER')).toBe('admin')
    expect(repRoleFor('ADMIN')).toBe('admin')
    expect(repRoleFor('MANAGER')).toBe('rep')
    expect(repRoleFor('MEMBER')).toBe('rep')
  })
})

describe('invite input validation', () => {
  it('derives a readable name from the email local part', () => {
    expect(nameFromEmail('jane.doe@example.com')).toBe('Jane Doe')
    expect(nameFromEmail('ops-team@example.com')).toBe('Ops Team')
  })

  it('rejects obviously invalid emails before calling Supabase', () => {
    expect(isInviteEmail('jane@example.com')).toBe(true)
    expect(isInviteEmail('not-an-email')).toBe(false)
    expect(isInviteEmail('a@b')).toBe(false)
  })
})
