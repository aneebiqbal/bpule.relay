/**
 * Canonical Upwork scope: one resolver for rep / manager / admin.
 * Reps get their own executable Upwork identities (primary + active cover),
 * managers get their managed reps, admins get the whole organization.
 * Backup-only and archived identities are never executable.
 */
import { describe, it, expect } from 'vitest'
import { resolveUpworkScope, type UpworkIdentityInput } from '@/lib/upwork/scope'

const id = (over: Partial<UpworkIdentityInput>): UpworkIdentityInput => ({
  repId: 'rep-a',
  revenueIdentityId: 'ident-a',
  profileId: 'profile-a',
  channel: 'upwork',
  access: 'assigned',
  status: 'active',
  ...over,
})

describe('rep scope', () => {
  it('returns only the rep’s own active upwork identities', () => {
    const scope = resolveUpworkScope({
      viewerRepId: 'rep-a',
      isAdmin: false,
      isManager: false,
      managedRepIds: null,
      identities: [
        id({}),
        id({ repId: 'rep-b', revenueIdentityId: 'ident-b', profileId: 'profile-b' }),
      ],
    })
    expect(scope.repIds).toEqual(['rep-a'])
    expect(scope.identityIds).toEqual(['ident-a'])
    expect(scope.profileIds).toEqual(['profile-a'])
  })

  it('includes active cover but excludes backup-only and archived identities', () => {
    const scope = resolveUpworkScope({
      viewerRepId: 'rep-a',
      isAdmin: false,
      isManager: false,
      managedRepIds: null,
      identities: [
        id({}),
        id({ revenueIdentityId: 'ident-cover', profileId: 'profile-cover', access: 'coverage' }),
        id({ revenueIdentityId: 'ident-backup', profileId: null, access: 'coverage' }),
        id({ revenueIdentityId: 'ident-archived', profileId: 'profile-arch', status: 'archived' }),
      ],
    })
    expect(scope.identityIds).toEqual(['ident-a', 'ident-cover'])
  })

  it('excludes non-upwork channels', () => {
    const scope = resolveUpworkScope({
      viewerRepId: 'rep-a',
      isAdmin: false,
      isManager: false,
      managedRepIds: null,
      identities: [id({}), id({ revenueIdentityId: 'ident-li', profileId: 'profile-li', channel: 'linkedin' })],
    })
    expect(scope.identityIds).toEqual(['ident-a'])
  })
})

describe('manager scope', () => {
  it('returns the managed reps’ executable identities', () => {
    const scope = resolveUpworkScope({
      viewerRepId: 'mgr',
      isAdmin: false,
      isManager: true,
      managedRepIds: ['rep-a', 'rep-b'],
      identities: [
        id({}),
        id({ repId: 'rep-b', revenueIdentityId: 'ident-b', profileId: 'profile-b' }),
        id({ repId: 'rep-c', revenueIdentityId: 'ident-c', profileId: 'profile-c' }),
      ],
    })
    expect(scope.repIds).toEqual(['rep-a', 'rep-b'])
    expect(scope.identityIds.sort()).toEqual(['ident-a', 'ident-b'])
  })
})

describe('admin scope', () => {
  it('is organization-wide: null rep scope and every active upwork identity', () => {
    const scope = resolveUpworkScope({
      viewerRepId: 'admin',
      isAdmin: true,
      isManager: false,
      managedRepIds: null,
      identities: [
        id({}),
        id({ repId: 'rep-b', revenueIdentityId: 'ident-b', profileId: 'profile-b' }),
      ],
    })
    expect(scope.repIds).toBeNull()
    expect(scope.identityIds.sort()).toEqual(['ident-a', 'ident-b'])
  })
})
