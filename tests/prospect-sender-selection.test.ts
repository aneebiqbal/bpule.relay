import { describe, expect, it } from 'vitest'
import { resolveAnalysisSender, type SenderCandidate } from '@/lib/prospect/sender-selection'
import { buildProfileIntelligence } from '@/lib/relay/profile-intelligence'
import type { Profile } from '@/lib/domain/types'

/**
 * BUG-38 — Analyzer used Mehak's profile when Aneeb was selected.
 *
 * Two deliberately different sender accounts: the selection must resolve to
 * exactly the account the rep picked, and an unusable selection must be an
 * error rather than a fallback to whichever profile happens to be first.
 */
const ANEEB: SenderCandidate = {
  profileId: 'profile-aneeb',
  platform: 'linkedin',
  identities: [{ id: 'identity-aneeb-linkedin', channel: 'linkedin' }],
}

const MEHAK: SenderCandidate = {
  profileId: 'profile-mehak',
  platform: 'linkedin',
  identities: [{ id: 'identity-mehak-linkedin', channel: 'linkedin' }],
}

describe('resolveAnalysisSender (BUG-38)', () => {
  it('uses the selected profile, not the first candidate', () => {
    const result = resolveAnalysisSender({
      requestedProfileId: ANEEB.profileId,
      requestedIdentityId: ANEEB.identities[0].id,
      candidates: [MEHAK, ANEEB],
    })
    expect(result.error).toBeNull()
    expect(result.sender?.profileId).toBe(ANEEB.profileId)
    expect(result.sender?.identityId).toBe('identity-aneeb-linkedin')
  })

  it('rejects a profile the rep cannot execute instead of falling back', () => {
    const result = resolveAnalysisSender({
      requestedProfileId: 'profile-not-assigned',
      requestedIdentityId: null,
      candidates: [MEHAK, ANEEB],
    })
    expect(result.sender).toBeNull()
    expect(result.error).toBe('PROFILE_NOT_ACCESSIBLE')
  })

  it('rejects a profile with no channel identity', () => {
    const result = resolveAnalysisSender({
      requestedProfileId: 'profile-orphan',
      requestedIdentityId: null,
      candidates: [{ profileId: 'profile-orphan', platform: 'linkedin', identities: [] }],
    })
    expect(result.error).toBe('PROFILE_NOT_EXECUTABLE')
  })

  it('rejects an identity that belongs to a different profile', () => {
    const result = resolveAnalysisSender({
      requestedProfileId: ANEEB.profileId,
      requestedIdentityId: MEHAK.identities[0].id,
      candidates: [MEHAK, ANEEB],
    })
    expect(result.error).toBe('IDENTITY_PROFILE_MISMATCH')
  })

  it('resolves the owning profile when only the identity is supplied', () => {
    const result = resolveAnalysisSender({
      requestedProfileId: null,
      requestedIdentityId: MEHAK.identities[0].id,
      candidates: [ANEEB, MEHAK],
    })
    expect(result.error).toBeNull()
    expect(result.sender?.profileId).toBe(MEHAK.profileId)
  })

  it('rejects an identity outside the authorized set', () => {
    const result = resolveAnalysisSender({
      requestedProfileId: null,
      requestedIdentityId: 'identity-someone-else',
      candidates: [ANEEB, MEHAK],
    })
    expect(result.error).toBe('IDENTITY_NOT_ACCESSIBLE')
  })

  it('leaves the choice to the caller when nothing was selected', () => {
    const result = resolveAnalysisSender({
      requestedProfileId: null,
      requestedIdentityId: null,
      candidates: [MEHAK, ANEEB],
    })
    expect(result.sender).toBeNull()
    expect(result.error).toBeNull()
  })
})

/** The sender's own skills and industries must drive proof, not a default. */
function profileWith(overrides: Partial<Profile>): Profile {
  return {
    id: 'p',
    organizationId: 'org',
    platform: 'linkedin',
    label: 'L',
    displayName: 'D',
    fullName: 'F',
    profileUrl: 'https://www.linkedin.com/in/x',
    headline: null,
    primarySkills: [],
    serviceCapabilities: [],
    technologies: [],
    industries: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Profile
}

describe('sender profile context (BUG-38 leakage)', () => {
  const aneeb = profileWith({
    id: 'profile-aneeb',
    primarySkills: ['Kubernetes', 'Terraform'],
    industries: ['Cloud infrastructure'],
  })
  const mehak = profileWith({
    id: 'profile-mehak',
    primarySkills: ['React', 'Design systems'],
    industries: ['E-commerce'],
  })

  it('builds different intelligence for different senders', () => {
    const a = buildProfileIntelligence(aneeb, [])
    const m = buildProfileIntelligence(mehak, [])
    expect(a.capabilities).toContain('Kubernetes')
    expect(a.industries).toContain('cloud infrastructure')
    expect(m.capabilities).toContain('React')
    expect(m.industries).toContain('e-commerce')
    expect(a.capabilities).not.toEqual(m.capabilities)
  })

  it('attributes proof to the selected profile id', () => {
    const a = buildProfileIntelligence(aneeb, [])
    expect(a.profile.id).toBe('profile-aneeb')
  })
})
