import { describe, it, expect } from 'vitest'
import { resolveIdentity } from '@/lib/profile-intelligence/identity-resolution'
import type { IdentityCandidate } from '@/lib/domain/types'

const candidate: IdentityCandidate = {
  normalizedName: 'Aneeb Khan',
  email: null,
  linkedinUrl: 'https://linkedin.com/in/aneeb',
  company: 'BPulse',
  role: 'CTO',
  aliases: ['Aneeb'],
  sourceEvidence: ['CTO at BPulse'],
}

describe('resolveIdentity', () => {
  it('creates new when no existing profiles', () => {
    const result = resolveIdentity(candidate, [])
    expect(result.resolution).toBe('create_new')
    expect(result.matchedProfileId).toBeNull()
  })

  it('matches existing on exact name', () => {
    const existing = [
      { id: 'p1', fullName: 'Aneeb Khan', displayName: null, label: null, headline: null, currentRole: null, company: null, profileUrl: null },
    ]
    const result = resolveIdentity(candidate, existing)
    expect(result.resolution).toBe('match_existing')
    expect(result.matchedProfileId).toBe('p1')
  })

  it('matches on linkedin URL', () => {
    const existing = [
      { id: 'p1', fullName: 'John Smith', displayName: null, label: null, headline: null, currentRole: null, company: null, profileUrl: 'https://linkedin.com/in/aneeb' },
    ]
    const result = resolveIdentity(candidate, existing)
    expect(result.resolution).toBe('match_existing')
    expect(result.matchedProfileId).toBe('p1')
  })

  it('flags possible duplicate when alias matches exactly', () => {
    const existing = [
      { id: 'p1', fullName: 'Aneeb', displayName: null, label: null, headline: null, currentRole: null, company: null, profileUrl: null },
    ]
    const result = resolveIdentity(candidate, existing)
    expect(result.resolution).toBe('possible_duplicate')
  })

  it('creates new for completely different name', () => {
    const existing = [
      { id: 'p1', fullName: 'Max Mustermann', displayName: null, label: null, headline: null, currentRole: null, company: null, profileUrl: null },
    ]
    const result = resolveIdentity(candidate, existing)
    expect(result.resolution).toBe('create_new')
  })

  it('does not silently merge similar names', () => {
    const existing = [
      { id: 'p1', fullName: 'Aneeb Khan Jr', displayName: null, label: null, headline: null, currentRole: null, company: null, profileUrl: null },
    ]
    const result = resolveIdentity(candidate, existing)
    expect(result.resolution).not.toBe('match_existing')
  })
})
