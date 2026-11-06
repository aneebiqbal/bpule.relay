/**
 * Upwork profile assignment + proposal generation contracts.
 *
 * One authority for eligibility: `identity_assignments` grouped by
 * `revenue_identities.profile_id`, filtered by `revenue_identities.channel`.
 * Every surface — the job page, the generate/draft/apply APIs, Rep Home, the
 * switcher, LinkedIn — reads that same module, and every write reauthorizes
 * the client-selected profile against it.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  filterAssignedProfilesByChannel,
  groupAssignedProfiles,
  normalizeChannel,
} from '@/lib/profiles/assigned-profiles'
import type { AuthorizedIdentity } from '@/lib/auth/workspace'
import type { Profile, RevenueIdentityChannel } from '@/lib/domain/types'

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

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    repId: 'rep-1',
    organizationId: 'org-1',
    platform: 'upwork',
    label: 'Hassan Upwork',
    profileUrl: null,
    headline: null,
    cvPath: null,
    createdAt: '2026-01-01',
    ...over,
  }
}

function assigned(identities: AuthorizedIdentity[], profiles: Profile[]) {
  return groupAssignedProfiles(identities, profiles)
}

describe('channel normalization', () => {
  it('recognizes Upwork spelled in any case or separator', () => {
    expect(normalizeChannel('upwork')).toBe('upwork')
    expect(normalizeChannel('UPWORK')).toBe('upwork')
    expect(normalizeChannel('Upwork')).toBe('upwork')
    expect(normalizeChannel(' up-work ')).toBe('upwork')
    expect(normalizeChannel('linkedin')).toBe('linkedin')
    expect(normalizeChannel('LinkedIn')).toBe('linkedin')
    expect(normalizeChannel('')).toBe('other')
    expect(normalizeChannel(null)).toBe('other')
    expect(normalizeChannel('carrier-pigeon')).toBe('other')
  })

  it('groups a non-canonical stored channel into the right capability', () => {
    const rows = assigned(
      [identity({ channel: 'UPWORK' })],
      [profile({ platform: 'linkedin' })],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].channels).toEqual(['upwork'])
    expect(filterAssignedProfilesByChannel(rows, 'upwork')).toHaveLength(1)
  })
})

describe('UPWORK_ASSIGNED_PROFILE_VISIBLE', () => {
  it('an active assigned Upwork identity makes its profile eligible', () => {
    const rows = filterAssignedProfilesByChannel(
      assigned(
        [identity({ assignmentId: 'a1', revenueIdentityId: 'ri-u', profileId: 'p-up', channel: 'upwork' })],
        [profile({ id: 'p-up', platform: 'upwork', label: 'Hassan Upwork' })],
      ),
      'upwork',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].profile.id).toBe('p-up')
    expect(rows[0].assignedIdentityIds).toEqual(['ri-u'])
    expect(rows[0].assignmentIds).toEqual(['a1'])
  })

  it('the job page reads the canonical loader, not a second eligibility rule', () => {
    const source = read('src/app/(app)/upwork/[id]/page.tsx')
    expect(source).toContain('listAssignedProfiles')
    expect(source).toContain("filterAssignedProfilesByChannel(assignedProfiles, 'upwork')")
  })
})

describe('UPWORK_ASSIGNED_PROFILE_AUTOSELECT_SINGLE', () => {
  it('the selector initializes to the only eligible profile', () => {
    const source = read('src/components/upwork-job-actions.tsx')
    expect(source).toContain('profiles[0]?.id')
    // A stored id that is no longer eligible must fall back, not generate in a
    // profile the acting rep cannot use.
    expect(source).toContain('profiles.some((option) => option.id === selectedProfileId)')
  })

  it('a single eligible profile is passed straight through the page filter', () => {
    const rows = filterAssignedProfilesByChannel(
      assigned(
        [identity({ revenueIdentityId: 'ri-u', profileId: 'p-up', channel: 'upwork' })],
        [profile({ id: 'p-up' })],
      ),
      'upwork',
    )
    expect(rows.map((row) => row.profile.id)).toEqual(['p-up'])
  })
})

describe('UPWORK_MULTIPLE_ASSIGNED_PROFILE_SELECTION', () => {
  it('every eligible profile is offered, each with its own identity', () => {
    const rows = filterAssignedProfilesByChannel(
      assigned(
        [
          identity({ assignmentId: 'a1', revenueIdentityId: 'ri-1', profileId: 'p1', channel: 'upwork', identityName: 'Aneeb' }),
          identity({ assignmentId: 'a2', revenueIdentityId: 'ri-2', profileId: 'p2', channel: 'upwork', identityName: 'Fizza' }),
        ],
        [profile({ id: 'p1', label: 'Aneeb' }), profile({ id: 'p2', label: 'Fizza' })],
      ),
      'upwork',
    )
    expect(rows.map((row) => row.profile.id).sort()).toEqual(['p1', 'p2'])
  })

  it('the selection is sent to the generate API and reauthorized there', () => {
    const ui = read('src/components/upwork-job-actions.tsx')
    expect(ui).toContain('profileId: activeProfileId')
    const api = read('src/app/api/upwork/jobs/[id]/generate/route.ts')
    expect(api).toContain('profiles.find((p) => p.id === requestedProfileId)')
    expect(api).toContain('not assigned to you for Upwork')
  })
})

describe('UPWORK_ONLY_SHOWS_UPWORK_PROFILES', () => {
  it('a LinkedIn-only assigned profile is excluded', () => {
    const rows = filterAssignedProfilesByChannel(
      assigned(
        [identity({ revenueIdentityId: 'ri-l', profileId: 'p-l', channel: 'linkedin' })],
        [profile({ id: 'p-l', platform: 'linkedin' })],
      ),
      'upwork',
    )
    expect(rows).toEqual([])
  })

  it('a profile with both channels is offered once with both labels', () => {
    const rows = filterAssignedProfilesByChannel(
      assigned(
        [
          identity({ assignmentId: 'a1', revenueIdentityId: 'ri-l', profileId: 'p1', channel: 'linkedin' }),
          identity({ assignmentId: 'a2', revenueIdentityId: 'ri-u', profileId: 'p1', channel: 'upwork' }),
        ],
        [profile({ id: 'p1', platform: 'linkedin' })],
      ),
      'upwork',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].channels).toEqual(['linkedin', 'upwork'])
  })
})

describe('UPWORK_HIDES_UNASSIGNED_PROFILE', () => {
  it('only identities present in identity_assignments can become eligible', () => {
    // The unassigned profile exists in `profiles`, but no assignment points at
    // its identity, so it must never appear.
    const rows = filterAssignedProfilesByChannel(
      assigned(
        [identity({ revenueIdentityId: 'ri-u', profileId: 'p-assigned', channel: 'upwork' })],
        [profile({ id: 'p-assigned' }), profile({ id: 'p-owned-unassigned', platform: 'upwork' })],
      ),
      'upwork',
    )
    expect(rows.map((row) => row.profile.id)).toEqual(['p-assigned'])
  })

  it('the read model derives from assignments only', () => {
    const source = read('src/lib/profiles/assigned-profiles.ts')
    expect(source).toContain('getAuthorizedIdentities')
    expect(source).toContain("from('identity_assignments')")
  })
})

describe('UPWORK_HIDES_OTHER_REP_PROFILE', () => {
  it('the on-behalf loader scopes by rep_id and organization_id', () => {
    const source = read('src/lib/profiles/assigned-profiles.ts')
    expect(source).toContain('listAssignedProfilesForRep')
    expect(source).toContain(".eq('rep_id', repId)")
    expect(source).toContain(".eq('organization_id', orgId)")
  })

  it('the generate API rejects a repId the caller may not act for', () => {
    const source = read('src/app/api/upwork/jobs/[id]/generate/route.ts')
    expect(source).toContain('Not authorized to generate for another rep.')
    expect(source).toContain('.eq(' + "'organization_id', authCtx.orgId")
  })
})

describe('UPWORK_HIDES_CROSS_ORG_PROFILE', () => {
  it('profile reads are organization-scoped', () => {
    const source = read('src/lib/store/supabase-store.ts')
    expect(source).toContain(".eq('organization_id', this.orgId)")
  })

  it('the on-behalf rep must belong to the caller organization', () => {
    const source = read('src/app/api/upwork/jobs/[id]/generate/route.ts')
    expect(source).toContain('That rep is not in your organization.')
  })
})

describe('UPWORK_GENERATE_REAUTHORIZES_PROFILE', () => {
  it('an ineligible client-supplied profileId is rejected, never silently replaced', () => {
    const source = read('src/app/api/upwork/jobs/[id]/generate/route.ts')
    // The old behaviour was `?? profiles[0] ?? null` — a forged id produced a
    // proposal in a profile the rep never chose.
    expect(source).not.toContain('?? profiles[0] ?? null')
    expect(source).toContain('status: 403')
  })

  it('draft and apply reauthorize through the same helper', () => {
    for (const route of [
      'src/app/api/upwork/jobs/[id]/draft/route.ts',
      'src/app/api/upwork/jobs/[id]/apply/route.ts',
    ]) {
      const source = read(route)
      expect(source).toContain('filterAssignedProfilesByChannel')
      expect(source).toContain('not assigned to you for Upwork')
    }
  })
})

describe('UPWORK_GENERATION_PROFILE_ATTRIBUTION_PARITY', () => {
  it('generate returns the profile actually used', () => {
    const source = read('src/app/api/upwork/jobs/[id]/generate/route.ts')
    expect(source).toContain('profileId: profile.id')
  })

  it('the draft persists the sender profile', () => {
    const route = read('src/app/api/upwork/jobs/[id]/draft/route.ts')
    expect(route).toContain('senderProfileId: senderProfile.profile.id')
    const store = read('src/lib/store/supabase-store.ts')
    expect(store).toContain('payload.sender_profile_id = input.senderProfileId')
  })

  it('apply persists the same sender instead of reading an unwritten job column', () => {
    const route = read('src/app/api/upwork/jobs/[id]/apply/route.ts')
    expect(route).toContain('senderProfile?.profile.id')
    const store = read('src/lib/store/supabase-store.ts')
    // The job's sender_profile_id is a fallback, not the primary source: the
    // draft row is where the sender was persisted.
    expect(store).toContain('senderProfileIdOverride')
    const appliedAt = store.indexOf('async markUpworkApplied')
    const draftFallbackAt = store.indexOf("from('upwork_messages')", appliedAt)
    expect(draftFallbackAt).toBeGreaterThan(appliedAt)
  })
})

describe('UPWORK_PROFILE_LOAD_ERROR_NOT_EMPTY_STATE', () => {
  it('the page catches an eligibility load failure instead of rendering empty', () => {
    const source = read('src/app/(app)/upwork/[id]/page.tsx')
    expect(source).toContain('profilesLoadFailed = true')
    expect(source).toContain('A load failure is a data problem')
  })

  it('the workspace renders a distinct message with a Retry action', () => {
    const source = read('src/components/upwork-job-actions.tsx')
    expect(source).toContain('Profiles could not be loaded')
    expect(source).toContain('router.refresh()')
    expect(source).toContain('No Upwork profile assigned')
  })
})

describe('ADMIN_UPWORK_PROFILE_ASSIGNMENT_FLOW', () => {
  it('an admin can act for a rep, and the acting rep scopes eligibility', () => {
    const page = read('src/app/(app)/upwork/[id]/page.tsx')
    expect(page).toContain('listAssignedProfilesForRep')

    const ui = read('src/components/upwork-job-actions.tsx')
    expect(ui).toContain('Generate proposal for')
    expect(ui).toContain('upwork-acting-rep')
    expect(ui).toContain('actingRepId')
  })

  it('the blocked state links to the canonical profile management flow', () => {
    const ui = read('src/components/upwork-job-actions.tsx')
    expect(ui).toContain('href="/team/profiles"')
    expect(ui).toContain('href="/team/profiles?add=1"')
    expect(ui).toContain('href="/rep/assigned-profiles"')
  })

  it('Team Profiles opens the add-profile wizard from the deep link', () => {
    const source = read('src/components/team/team-profiles-table.tsx')
    expect(source).toContain("searchParams.get('add') === '1'")
  })

  it('assignment changes reach the Upwork surface without a second model', () => {
    const canonical = read('src/lib/profiles/assigned-profiles.ts')
    expect(canonical).toContain("from('identity_assignments')")
    expect(canonical).not.toContain('profile_assignments')
  })
})

describe('PROFILE_ASSIGNMENT_SURFACE_PARITY', () => {
  it('every Upwork surface reads the one canonical module', () => {
    const canonical = read('src/lib/profiles/assigned-profiles.ts')
    expect(canonical).toContain('identity.channel')

    for (const surface of [
      'src/app/(app)/upwork/[id]/page.tsx',
      'src/app/api/upwork/jobs/[id]/generate/route.ts',
      'src/app/api/upwork/jobs/[id]/draft/route.ts',
      'src/app/api/upwork/jobs/[id]/apply/route.ts',
    ]) {
      expect(read(surface)).toContain('listAssignedProfiles')
    }
  })

  it('capability never comes from profiles.platform', () => {
    const canonical = read('src/lib/profiles/assigned-profiles.ts')
    expect(canonical).not.toContain('profile.platform')
  })

  it('an archived identity never becomes eligible', () => {
    const rows = filterAssignedProfilesByChannel(
      assigned(
        [identity({ revenueIdentityId: 'ri-u', profileId: 'p1', channel: 'upwork', status: 'archived' })],
        [profile({ id: 'p1' })],
      ),
      'upwork',
    )
    expect(rows).toEqual([])
  })
})

describe('LINKEDIN_PROFILE_FILTER_UNCHANGED', () => {
  it('LinkedIn eligibility still filters on the linkedin channel', () => {
    const rows = filterAssignedProfilesByChannel(
      assigned(
        [
          identity({ revenueIdentityId: 'ri-l', profileId: 'p-l', channel: 'linkedin' }),
          identity({ revenueIdentityId: 'ri-u', profileId: 'p-u', channel: 'upwork' }),
        ],
        [profile({ id: 'p-l', platform: 'linkedin' }), profile({ id: 'p-u', platform: 'upwork' })],
      ),
      'linkedin',
    )
    expect(rows.map((row) => row.profile.id)).toEqual(['p-l'])
  })

  it('the prospect route still reads the canonical loader', () => {
    const source = read('src/app/api/prospect/analyze/route.ts')
    expect(source).toContain('listAssignedProfiles')
    expect(source).toContain("filterAssignedProfilesByChannel(assigned, 'linkedin')")
  })

  it('the Upwork selector labels by capability, not by profiles.platform', () => {
    const source = read('src/components/upwork-job-actions.tsx')
    expect(source).toContain('channelLabel(profile.channels)')
    expect(source).not.toContain("p.platform === 'linkedin'")
  })
})

describe('channel filter is exhaustive over the canonical union', () => {
  it('every RevenueIdentityChannel value is comparable', () => {
    const channels: RevenueIdentityChannel[] = ['linkedin', 'email', 'upwork', 'other']
    for (const channel of channels) {
      expect(filterAssignedProfilesByChannel([], channel)).toEqual([])
    }
  })
})
