import { describe, expect, it } from 'vitest'
import { computeJobMatch, MATCH_SCORE_VERSION, type MatchProfile } from '@/lib/job-discovery/match'
import { tokenizeSkill } from '@/lib/jobs/rank-jobs'
import type { ProfileEvidence } from '@/lib/generation/sales-context'
import type { DiscoveryJob } from '@/lib/job-discovery/types'

const evidence: ProfileEvidence = {
  proofCards: [
    {
      id: 'c1',
      organizationId: 'o1',
      profileId: 'p1',
      capability: 'Node.js backend development',
      strength: 'strong',
      safeClaim: 'Built Node.js APIs for a logistics client.',
      sourceType: 'client_work',
      sourceReference: null,
      tags: ['Node.js', 'PostgreSQL'],
      verified: true,
      forbiddenClaims: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  proofItems: [],
  portfolioProjects: [],
  experience: [{ id: 'e1', role: 'Backend Engineer', company: 'Acme', startDate: '2021-01-01', endDate: null, isCurrent: true }],
  reviews: [],
  claims: [],
}

const profile: MatchProfile = {
  profileId: 'p1',
  headline: 'Senior Backend Engineer',
  location: 'Berlin, Germany',
  timezone: 'UTC+1',
  evidence,
}

function job(overrides: Partial<DiscoveryJob>): DiscoveryJob {
  return {
    id: 'j1',
    sourceId: 'greenhouse',
    sourceJobId: '1',
    title: 'Senior Backend Engineer',
    company: 'Acme',
    locationRaw: 'Remote',
    remote: true,
    description: 'Node.js, PostgreSQL, REST APIs.',
    skills: ['Node.js', 'PostgreSQL'],
    postedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    ...overrides,
  }
}

describe('computeJobMatch', () => {
  it('scores a strong, eligible match', () => {
    const match = computeJobMatch(job({}), profile)
    expect(match.score).toBeGreaterThanOrEqual(65)
    expect(['excellent', 'strong']).toContain(match.category)
    expect(match.evidence.matchedSkills).toEqual(expect.arrayContaining(['Node.js', 'PostgreSQL']))
    expect(match.breakdown.skills).toBeGreaterThan(0.8)
  })

  it('caps a confidently ineligible job regardless of semantic similarity', () => {
    const match = computeJobMatch(
      job({
        eligibility: {
          classification: 'country_restricted',
          remote: true,
          countries: ['US'],
          regions: [],
          timezones: [],
          confidence: 'confirmed',
          explanation: 'US only',
          evidence: [],
        },
      }),
      { ...profile, location: 'Karachi, Pakistan', timezone: 'UTC+5' },
    )
    expect(match.category).toBe('not_eligible')
    expect(match.score).toBeLessThanOrEqual(15)
    expect(match.explanation).toMatch(/restricted to US/i)
  })

  it('marks an unstated geographic policy as requires_verification', () => {
    const match = computeJobMatch(
      job({
        eligibility: {
          classification: 'unknown',
          remote: true,
          countries: [],
          regions: [],
          timezones: [],
          confidence: 'unknown',
          explanation: 'No geographic statement.',
          evidence: [],
        },
      }),
      profile,
    )
    expect(match.category).toBe('requires_verification')
    expect(match.score).toBeLessThanOrEqual(45)
  })

  it('normalizes Rails/React punctuation and aliases', () => {
    expect(tokenizeSkill('Rails/React')).toEqual(expect.arrayContaining(['ruby on rails', 'react']))
    expect(tokenizeSkill('Node.js')).toEqual(expect.arrayContaining(['node.js', 'node']))
  })

  it('matches a job requiring Node.js/PostgreSQL to a profile with those skills', () => {
    const match = computeJobMatch(job({ skills: ['Node.js/PostgreSQL'] }), profile)
    expect(match.evidence.matchedSkills).toContain('Node.js/PostgreSQL')
    expect(match.evidence.missingSkills).toEqual([])
  })

  it('exposes a versioned, explainable breakdown', () => {
    const match = computeJobMatch(job({}), profile)
    expect(MATCH_SCORE_VERSION).toBe(2)
    expect(Object.keys(match.breakdown)).toContain('freshness')
    expect(match.explanation.length).toBeGreaterThan(20)
  })
})
