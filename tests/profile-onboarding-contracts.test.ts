/**
 * Profile onboarding + assignment contracts.
 *
 * These pin the canonical flow: one onboarding write for profile + channel
 * identities + assignment, channel capability derived from identities (never
 * from `profiles.platform`), and no surface showing an ineligible profile.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  filterAssignedProfilesByChannel,
  groupAssignedProfiles,
} from '@/lib/profiles/assigned-profiles'
import type { AuthorizedIdentity } from '@/lib/auth/workspace'

const ROOT = process.cwd()
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8')

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

describe('UPWORK_PROFILE_CAPABILITY_REQUIRED', () => {
  it('a LinkedIn-only assigned profile is not Upwork-capable', () => {
    const profiles = groupAssignedProfiles(
      [
        identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', channel: 'linkedin' }),
        identity({ assignmentId: 'a2', revenueIdentityId: 'ri-2', profileId: 'p2', channel: 'upwork' }),
      ],
      [{ id: 'p1', repId: 'r', organizationId: 'o', platform: 'linkedin', label: null, profileUrl: null, headline: null, cvPath: null, createdAt: '' }, { id: 'p2', repId: 'r', organizationId: 'o', platform: 'upwork', label: null, profileUrl: null, headline: null, cvPath: null, createdAt: '' }],
    )
    expect(filterAssignedProfilesByChannel(profiles, 'upwork').map((row) => row.profile.id)).toEqual(['p2'])
  })

  it('the Upwork route reads the canonical loader and filters the Upwork channel', () => {
    const source = read('src/app/api/upwork/jobs/[id]/generate/route.ts')
    expect(source).toContain('listAssignedProfiles')
    expect(source).toContain("filterAssignedProfilesByChannel(assignedProfiles, 'upwork')")
  })
})

describe('LINKEDIN_PROFILE_CAPABILITY_REQUIRED', () => {
  it('an Upwork-only assigned profile is not LinkedIn-capable', () => {
    const profiles = groupAssignedProfiles(
      [identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', channel: 'upwork' })],
      [{ id: 'p1', repId: 'r', organizationId: 'o', platform: 'upwork', label: null, profileUrl: null, headline: null, cvPath: null, createdAt: '' }],
    )
    expect(filterAssignedProfilesByChannel(profiles, 'linkedin')).toEqual([])
  })

  it('the prospect route reads the canonical loader and filters the LinkedIn channel', () => {
    const source = read('src/app/api/prospect/analyze/route.ts')
    expect(source).toContain('listAssignedProfiles')
    expect(source).toContain("filterAssignedProfilesByChannel(assigned, 'linkedin')")
  })
})

describe('PROFILE_CREATION_SINGLE_CANONICAL_FLOW', () => {
  it('one endpoint owns the profile, identity and assignment writes', () => {
    const source = read('src/app/api/team/profile-onboarding/route.ts')
    expect(source).toContain("from('profiles')")
    expect(source).toContain("from('revenue_identities')")
    // Assignment, PRIMARY coverage and the target pack are written by the one
    // canonical responsibility module — the route holds no parallel write path.
    expect(source).toContain('assignPrimaryResponsibility')
    expect(read('src/lib/profiles/assignment.ts')).toContain("from('identity_assignments')")
    expect(read('src/lib/profiles/assignment.ts')).toContain("from('profile_coverage')")
  })

  it('the wizard uses that endpoint, not a parallel path', () => {
    const source = read('src/components/team/add-profile-wizard.tsx')
    expect(source).toContain('/api/team/profile-onboarding')
    expect(source).toContain('/api/profile-intelligence/batch')
  })

  it('channel capability is derived from identities, never profiles.platform', () => {
    const source = read('src/lib/profiles/assigned-profiles.ts')
    expect(source).toContain('identity.channel')
    expect(source).not.toContain('profile.platform')
  })
})

describe('PROFILE_PARTIAL_FAILURE_SAFE', () => {
  it('the onboarding endpoint reports partial success instead of fake success', () => {
    const source = read('src/app/api/team/profile-onboarding/route.ts')
    expect(source).toContain("result.status = 'partial'")
    expect(source).toContain("result.failed = 'assign'")
  })

  it('the canonical assign route never fails a committed assignment on audit or notification', () => {
    const source = read('src/app/api/admin/revenue-identities/[id]/assign/route.ts')
    expect(source).toContain('Audit — best effort')
    expect(source).toContain('Notify the rep — best effort')
  })
})

describe('PROFILE_ASSIGNMENT_END_TO_END_PARITY', () => {
  it('rep home, the switcher, Upwork and LinkedIn all derive from the same assigned identities', () => {
    const readModel = read('src/lib/profiles/assigned-profiles.ts')
    expect(readModel).toContain('getAuthorizedIdentities')
    expect(read('src/app/api/upwork/jobs/[id]/generate/route.ts')).toContain('listAssignedProfiles')
    expect(read('src/app/api/prospect/analyze/route.ts')).toContain('listAssignedProfiles')
    expect(read('src/app/(app)/team/profiles/page.tsx')).toContain('loadTeamProfileDirectory')
  })
})

describe('PROFILE_UNASSIGNMENT_PRESERVES_HISTORY', () => {
  it('unassign deletes only the assignment row', () => {
    const source = read('src/app/api/admin/revenue-identities/[id]/assign/route.ts')
    expect(source).toContain("from('identity_assignments')")
    expect(source).not.toContain("from('revenue_identities')\n      .delete()")
  })

  it('the onboarding endpoint never deletes profile or identity rows', () => {
    const source = read('src/app/api/team/profile-onboarding/route.ts')
    expect(source).not.toContain('.delete()')
  })
})

describe('REP_PROFILE_ACCESS_ASSIGNMENT_SCOPED', () => {
  it('the read model only returns active assigned identities', () => {
    const source = read('src/lib/profiles/assigned-profiles.ts')
    expect(source).toContain("identity.status !== 'active'")
  })

  it('archived identities are dropped by the grouping helper', () => {
    const profiles = groupAssignedProfiles(
      [identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', status: 'archived' })],
      [{ id: 'p1', repId: 'r', organizationId: 'o', platform: 'linkedin', label: null, profileUrl: null, headline: null, cvPath: null, createdAt: '' }],
    )
    expect(profiles).toEqual([])
  })
})
