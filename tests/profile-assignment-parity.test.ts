/**
 * Profile assignment parity contracts.
 *
 * One canonical read model (`src/lib/profiles/assigned-profiles.ts`) backs the
 * rep home, the workspace switcher, the Upwork proposal flow and the LinkedIn
 * prospect flow. These gates pin the two rules the V4 spec calls out:
 *
 *   - assignment is rep-based and channel capability comes from the assigned
 *     revenue identities, never from `profiles.platform`;
 *   - the Upwork and LinkedIn flows each show only their own channel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  getAuthorizedIdentities: vi.fn(),
  listProfilesByIds: vi.fn(),
}))

vi.mock('@/lib/auth/workspace', () => ({
  getAuthorizedIdentities: () => mocks.getAuthorizedIdentities(),
}))

vi.mock('@/lib/store', () => ({
  createScoutStore: async () => ({
    listProfilesByIds: (ids: string[]) => mocks.listProfilesByIds(ids),
  }),
}))

import {
  assignedProfileName,
  filterAssignedProfilesByChannel,
  groupAssignedProfiles,
  listAssignedProfiles,
  type AssignedProfile,
} from '@/lib/profiles/assigned-profiles'
import type { AuthorizedIdentity } from '@/lib/auth/workspace'
import type { Profile } from '@/lib/domain/types'

function profile(id: string, over: Partial<Profile> = {}): Profile {
  return {
    id,
    repId: 'rep-owner',
    organizationId: 'org-1',
    platform: 'linkedin',
    label: id,
    profileUrl: null,
    headline: null,
    cvPath: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function identity(over: Partial<AuthorizedIdentity> = {}): AuthorizedIdentity {
  return {
    assignmentId: 'a1',
    revenueIdentityId: 'ri-1',
    identityName: 'Hassan',
    title: null,
    channel: 'linkedin',
    profileId: 'p1',
    profileUrl: null,
    status: 'active',
    ...over,
  }
}

function assigned(over: Partial<AssignedProfile> = {}): AssignedProfile {
  return {
    profile: profile('p1'),
    channels: ['linkedin'],
    assignedIdentityIds: ['ri-1'],
    assignmentIds: ['a1'],
    ...over,
  }
}

beforeEach(() => {
  mocks.getAuthorizedIdentities.mockReset()
  mocks.listProfilesByIds.mockReset()
})

describe('groupAssignedProfiles', () => {
  it('PROFILE_ASSIGNMENT_SINGLE_SOURCE: groups assigned channel identities by profile and unions channels', () => {
    const result = groupAssignedProfiles(
      [
        identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', channel: 'linkedin' }),
        identity({ assignmentId: 'a2', revenueIdentityId: 'ri-2', profileId: 'p1', channel: 'upwork' }),
        identity({ assignmentId: 'a3', revenueIdentityId: 'ri-3', profileId: 'p2', channel: 'linkedin' }),
      ],
      [profile('p1'), profile('p2')],
    )

    expect(result).toHaveLength(2)
    const p1 = result.find((r) => r.profile.id === 'p1')!
    expect(p1.channels).toEqual(['linkedin', 'upwork'])
    expect(p1.assignedIdentityIds).toEqual(['ri-1', 'ri-2'])
    expect(p1.assignmentIds).toEqual(['a1', 'a2'])
  })

  it('drops archived identities so an archived assignment is not a capability', () => {
    const result = groupAssignedProfiles(
      [
        identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', status: 'active' }),
        identity({ assignmentId: 'a2', revenueIdentityId: 'ri-2', profileId: 'p1', channel: 'upwork', status: 'archived' }),
      ],
      [profile('p1')],
    )

    expect(result).toHaveLength(1)
    expect(result[0].channels).toEqual(['linkedin'])
  })

  it('drops an identity with no linked profile (no sender account to send as)', () => {
    const result = groupAssignedProfiles(
      [identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: null })],
      [],
    )
    expect(result).toEqual([])
  })
})

describe('filterAssignedProfilesByChannel', () => {
  const profiles = [
    assigned({ profile: profile('p1'), channels: ['linkedin', 'upwork'] }),
    assigned({ profile: profile('p2'), channels: ['linkedin'] }),
    assigned({ profile: profile('p3'), channels: ['upwork'] }),
  ]

  it('UPWORK_CHANNEL_PROFILE_FILTER: shows only Upwork-capable assigned profiles', () => {
    const result = filterAssignedProfilesByChannel(profiles, 'upwork')
    expect(result.map((p) => p.profile.id)).toEqual(['p1', 'p3'])
  })

  it('LINKEDIN_CHANNEL_PROFILE_FILTER: shows only LinkedIn-capable assigned profiles', () => {
    const result = filterAssignedProfilesByChannel(profiles, 'linkedin')
    expect(result.map((p) => p.profile.id)).toEqual(['p1', 'p2'])
  })

  it('a LinkedIn-only profile never appears in the Upwork selector', () => {
    const result = filterAssignedProfilesByChannel(profiles, 'upwork')
    expect(result.some((p) => p.profile.id === 'p2')).toBe(false)
  })
})

describe('listAssignedProfiles', () => {
  it('ASSIGNED_PROFILE_SWITCHER_PARITY: the assigned identity ids are exactly the authorized identities', async () => {
    mocks.getAuthorizedIdentities.mockResolvedValue([
      identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', channel: 'linkedin' }),
      identity({ assignmentId: 'a2', revenueIdentityId: 'ri-2', profileId: 'p1', channel: 'upwork' }),
    ])
    mocks.listProfilesByIds.mockResolvedValue([profile('p1')])

    const result = await listAssignedProfiles()

    expect(result).toHaveLength(1)
    expect(result[0].assignedIdentityIds).toEqual(['ri-1', 'ri-2'])
    expect(mocks.listProfilesByIds).toHaveBeenCalledWith(['p1'])
  })

  it('REP_PROFILE_VISIBILITY: only active assigned profiles are returned', async () => {
    mocks.getAuthorizedIdentities.mockResolvedValue([
      identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', status: 'active' }),
      identity({ assignmentId: 'a2', revenueIdentityId: 'ri-2', profileId: 'p2', status: 'archived' }),
    ])
    mocks.listProfilesByIds.mockResolvedValue([profile('p1'), profile('p2')])

    const result = await listAssignedProfiles()

    expect(result.map((p) => p.profile.id)).toEqual(['p1'])
  })

  it('assignedProfileName prefers the display name and falls back to the label', () => {
    expect(assignedProfileName(assigned({ profile: profile('p1', { displayName: 'Hassan' }) }))).toBe('Hassan')
    expect(assignedProfileName(assigned({ profile: profile('p1', { label: 'Hassan' }) }))).toBe('Hassan')
    expect(assignedProfileName(assigned({ profile: profile('p1', { label: null }) }))).toBe('Unnamed profile')
  })
})

describe('assignment boundary (source contract)', () => {
  const UPWORK_ROUTES = [
    'src/app/api/upwork/jobs/[id]/generate/route.ts',
    'src/app/api/upwork/jobs/[id]/draft/route.ts',
  ]
  const PROSPECT_ROUTE = 'src/app/api/prospect/analyze/route.ts'

  it('UPWORK_CHANNEL_PROFILE_FILTER: Upwork routes read the canonical loader, not owned profiles', () => {
    for (const file of UPWORK_ROUTES) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
      expect(source, `${file} must use listAssignedProfiles`).toContain('listAssignedProfiles')
      expect(source, `${file} must filter the Upwork channel`).toContain("'upwork'")
      expect(source, `${file} must not fall back to owned listProfiles`).not.toContain('store.listProfiles()')
    }
  })

  it('LINKEDIN_CHANNEL_PROFILE_FILTER: the prospect route reads the canonical loader and keeps identity-linked senders', () => {
    const source = readFileSync(path.join(process.cwd(), PROSPECT_ROUTE), 'utf8')
    expect(source).toContain('listAssignedProfiles')
    expect(source).toContain("filterAssignedProfilesByChannel(assigned, 'linkedin')")
    // The owned-profile map must not be what filters the ranked senders.
    expect(source).not.toContain('store.listProfiles()')
  })

  it('the Upwork job page lists assigned Upwork profiles, not owned ones', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/(app)/upwork/[id]/page.tsx'),
      'utf8',
    )
    expect(source).toContain('listAssignedProfiles')
    expect(source).toContain("filterAssignedProfilesByChannel")
    expect(source).not.toContain('store.listProfiles()')
  })

  it('the prospect UI selector is fed by the assigned LinkedIn profiles endpoint', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/prospect/prospect-analyze.tsx'),
      'utf8',
    )
    expect(source).toContain('/api/profiles?assigned=1&channel=linkedin')
  })

  it('ASSIGNED_PROFILE_SWITCHER_PARITY: the switcher and the rep home read the same identity source', () => {
    const switcher = readFileSync(
      path.join(process.cwd(), 'src/components/shell/profile-switcher.tsx'),
      'utf8',
    )
    expect(switcher).toContain('useActiveIdentity')
    const canonical = readFileSync(
      path.join(process.cwd(), 'src/lib/profiles/assigned-profiles.ts'),
      'utf8',
    )
    expect(canonical).toContain('getAuthorizedIdentities')
  })
})
