import { describe, expect, it } from 'vitest'
import { buildJobSuggestions } from '@/lib/job-discovery/suggestions'
import type { ResumeData } from '@/lib/bd/resume-engine'
import type { JobRequirements } from '@/lib/job-discovery/requirements'
import type { ProfileEvidence } from '@/lib/generation/sales-context'

const resume: ResumeData = {
  name: 'Ayesha Khan',
  title: 'Senior Full-Stack Engineer',
  summary: 'Senior engineer.',
  skills: ['TypeScript', 'React', 'AWS'],
  experience: [{ company: 'Analytical Engines', role: 'Senior Engineer', period: '2020-01 – Present', bullets: ['Built the backend.'] }],
  projects: [],
  education: [],
  certifications: [],
}

const requirements: JobRequirements = {
  version: 1,
  sourceHash: null,
  requiredSkills: ['React', 'Kubernetes'],
  preferredSkills: [],
  seniority: 'senior',
  yearsExperience: { min: 5, max: null },
  stack: ['React', 'Kubernetes'],
  responsibilities: ['Build the backend'],
  domains: [],
  languages: [],
  certifications: [],
  portfolioExpected: false,
  employmentType: 'full-time',
  hardRequirements: [],
  preferredQualifications: [],
  evidence: [],
  confidence: 'high',
}

const evidence: ProfileEvidence = {
  proofCards: [{
    id: 'c1',
    organizationId: 'o1',
    profileId: 'p1',
    capability: 'Built a React product',
    strength: 'strong',
    safeClaim: 'Built and shipped a React B2B application.',
    sourceType: 'client_work',
    sourceReference: null,
    tags: ['React'],
    verified: true,
    forbiddenClaims: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }],
  proofItems: [],
  portfolioProjects: [],
  experience: [],
  reviews: [],
  claims: [],
}

describe('buildJobSuggestions', () => {
  it('only reuses existing wording or verbatim proof claims', () => {
    const suggestions = buildJobSuggestions(resume, requirements, evidence)
    const bullet = suggestions.find((item) => item.section === 'bullet')
    expect(bullet?.suggested).toBe('Built and shipped a React B2B application.')
    expect(bullet?.evidence.id).toBe('c1')
    expect(bullet?.requirement).toMatch(/React/)
  })

  it('names the requirement and the supporting evidence for every suggestion', () => {
    for (const suggestion of buildJobSuggestions(resume, requirements, evidence)) {
      expect(suggestion.requirement.length).toBeGreaterThan(3)
      expect(suggestion.evidence.id).toBeTruthy()
      expect(suggestion.rationale.length).toBeGreaterThan(10)
    }
  })

  it('never invents a skill the profile does not have', () => {
    const suggestions = buildJobSuggestions(resume, requirements, evidence)
    const skills = suggestions.find((item) => item.section === 'skills')
    expect(skills?.suggested).not.toContain('Kubernetes')
    expect(skills?.suggested?.split(', ')).toEqual(['React', 'TypeScript', 'AWS'])
  })
})
