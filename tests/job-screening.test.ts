import { describe, expect, it } from 'vitest'
import { buildScreeningAnswers } from '@/lib/job-discovery/screening'
import type { JobRequirements } from '@/lib/job-discovery/requirements'
import type { ProfileEvidence } from '@/lib/generation/sales-context'

const requirements: JobRequirements = {
  version: 1,
  sourceHash: null,
  requiredSkills: ['React', 'Kubernetes'],
  preferredSkills: [],
  seniority: 'senior',
  yearsExperience: { min: 5, max: null },
  stack: ['React'],
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
  proofCards: [
    {
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
    },
  ],
  proofItems: [],
  portfolioProjects: [],
  experience: [{ id: 'e1', role: 'Senior Engineer', company: 'Analytical Engines', startDate: '2020-01-01', endDate: null, isCurrent: true }],
  reviews: [],
  claims: [],
}

describe('buildScreeningAnswers', () => {
  const answers = buildScreeningAnswers({ requirements, evidence, jobTitle: 'Full-Stack Developer', company: 'Fluence' })

  it('answers only from evidence and names the supporting proof', () => {
    const tech = answers.find((row) => row.id === 'required-technologies')!
    expect(tech.status).toBe('draft')
    expect(tech.answer).toContain('React')
    expect(tech.evidence[0].id).toBe('c1')
  })

  it('marks an unsupported required skill as a human gap without inventing it', () => {
    const tech = answers.find((row) => row.id === 'required-technologies')!
    expect(tech.answer).not.toContain('Kubernetes')
  })

  it('never guesses availability, salary, authorization or timezone', () => {
    for (const id of ['availability', 'salary-expectations', 'work-authorization', 'timezone']) {
      const row = answers.find((answer) => answer.id === id)!
      expect(row.status).toBe('needs_human')
      expect(row.answer).toBeNull()
    }
  })

  it('summarizes verified experience for the background question', () => {
    const background = answers.find((row) => row.id === 'professional-background')!
    expect(background.status).toBe('draft')
    expect(background.answer).toContain('Senior Engineer')
  })
})
