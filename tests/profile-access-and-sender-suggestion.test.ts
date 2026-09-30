import { describe, expect, it } from 'vitest'
import { profileAccess, visibleProfileIds } from '@/lib/profile-intelligence/access'
import { pickSuggestion, scoreSender, type SenderCandidate } from '@/lib/relay/sender-suggestion'
import type { AuthContext } from '@/lib/auth/organization'

const auth = (over: Partial<AuthContext> = {}): AuthContext => ({
  repId: 'rep-1', orgId: 'org-1', orgName: 'Org', organizationRole: 'MEMBER', teamMemberships: [], managedTeamIds: [],
  memberTeamIds: [], capabilities: new Set(), isOwner: false, isAdmin: false, isManager: false, isMember: true, ...over,
})

describe('profile access by role', () => {
  it('reps are read-only and scoped to assigned profiles', () => {
    expect(profileAccess(auth())).toEqual({ canManage: false, canMerge: false, scope: 'assigned' })
  })
  it('managers can manage but not merge', () => {
    expect(profileAccess(auth({ isManager: true, organizationRole: 'MANAGER' }))).toEqual({ canManage: true, canMerge: false, scope: 'org' })
  })
  it('admins and owners can manage and merge', () => {
    expect(profileAccess(auth({ isAdmin: true, isManager: true }))).toMatchObject({ canManage: true, canMerge: true })
    expect(profileAccess(auth({ isOwner: true, isAdmin: true }))).toMatchObject({ canManage: true, canMerge: true })
  })
  it('the MANAGE_REVENUE_IDENTITIES capability grants management', () => {
    expect(profileAccess(auth({ capabilities: new Set(['MANAGE_REVENUE_IDENTITIES']) })).canManage).toBe(true)
  })

  it('a rep sees only owned ∪ assigned profiles; managers are unrestricted', async () => {
    const fake = {
      from: (table: string) => {
        const rows = table === 'profiles' ? [{ id: 'owned-1' }] : [{ profile_id: 'assigned-1' }, { profile_id: 'owned-1' }]
        const q: any = { select: () => q, eq: () => q, then: (r: any) => Promise.resolve({ data: rows, error: null }).then(r) }
        return q
      },
    } as any
    expect((await visibleProfileIds(fake, auth()))?.sort()).toEqual(['assigned-1', 'owned-1'])
    expect(await visibleProfileIds(fake, auth({ isAdmin: true }))).toBeNull()
  })
})

const cand = (over: Partial<SenderCandidate>): SenderCandidate => ({
  id: 'x', name: 'X', role: null, platform: 'linkedin', skills: [], proof: [], holders: [], accessibleToRep: false, ...over,
})

describe('org-wide sender suggestion', () => {
  const lead = ['kubernetes', 'terraform', 'aws', 'devops']
  const mine = cand({ id: 'mine', name: 'Hassan (mine)', accessibleToRep: true, skills: ['React'], proof: [{ text: 'Built a React dashboard', tags: ['react'], strong: false, verified: false }] })
  const devops = cand({
    id: 'devops', name: 'Dawood', role: 'Senior DevOps Engineer', holders: [{ repId: 'r2', name: 'Dawood' }],
    skills: ['Kubernetes', 'Terraform', 'AWS'],
    proof: [{ text: 'Owned Terraform + Kubernetes CI/CD on AWS for a healthcare platform', tags: ['devops'], strong: true, verified: true }],
  })

  it('proof counts more than self-declared skills', () => {
    const skillsOnly = scoreSender(cand({ skills: ['Kubernetes'] }), lead).score
    const withProof = scoreSender(cand({ proof: [{ text: 'Ran Kubernetes clusters', tags: [], strong: false, verified: false }] }), lead).score
    expect(withProof).toBeGreaterThan(skillsOnly)
  })

  it('suggests a clearly stronger profile the rep does not hold, naming who holds it', () => {
    const s = pickSuggestion([mine, devops], lead, { platform: 'linkedin', currentProfileId: 'mine' })
    expect(s?.profileId).toBe('devops')
    expect(s?.holders).toEqual(['Dawood'])
    expect(s?.reason).toMatch(/ask Dawood/)
    expect(s?.topProof).toMatch(/Terraform/)
  })

  it('stays quiet when the rep already has a comparable profile', () => {
    const strongMine = { ...devops, id: 'mine2', accessibleToRep: true }
    expect(pickSuggestion([strongMine, devops], lead, { platform: 'linkedin' })).toBeNull()
  })

  it('never suggests a profile on the wrong channel', () => {
    expect(pickSuggestion([mine, { ...devops, platform: 'upwork' }], lead, { platform: 'linkedin' })).toBeNull()
  })

  it('never suggests a profile with no relevant evidence', () => {
    expect(pickSuggestion([mine, cand({ id: 'o', skills: ['Figma'] })], lead)).toBeNull()
  })
})
