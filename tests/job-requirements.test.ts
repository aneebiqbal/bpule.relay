import { describe, expect, it } from 'vitest'
import { extractJobRequirements } from '@/lib/job-discovery/requirements'
import type { DiscoveryJob } from '@/lib/job-discovery/types'

function job(overrides: Partial<DiscoveryJob> = {}): DiscoveryJob {
  return {
    id: 'j1',
    sourceId: 'remoteok',
    sourceJobId: '1',
    title: 'Senior Backend Engineer',
    company: 'Acme',
    locationRaw: 'Remote',
    remote: true,
    description: 'Build APIs.',
    skills: ['Node.js', 'PostgreSQL'],
    ...overrides,
  }
}

describe('extractJobRequirements', () => {
  it('separates hard requirements from preferred qualifications', () => {
    const result = extractJobRequirements(job({
      description: [
        'You will design and build our payments platform.',
        'Must have 5+ years of Node.js experience.',
        'Nice to have: Kubernetes and Terraform.',
        'Preferred: experience with fintech.',
      ].join('\n'),
    }))
    expect(result.hardRequirements.some((line) => /Must have/i.test(line))).toBe(true)
    expect(result.preferredQualifications.some((line) => /Nice to have/i.test(line))).toBe(true)
    expect(result.preferredQualifications.some((line) => /Preferred/i.test(line))).toBe(true)
    expect(result.responsibilities.some((line) => /design and build/i.test(line))).toBe(true)
    expect(result.confidence).toBe('high')
  })

  it('extracts years of experience and seniority', () => {
    const result = extractJobRequirements(job({
      title: 'Staff Platform Engineer',
      description: 'At least 8 years of experience building distributed systems.',
    }))
    expect(result.yearsExperience.min).toBe(8)
    expect(result.seniority).toBe('senior')
  })

  it('detects domain, language and portfolio signals', () => {
    const result = extractJobRequirements(job({
      title: 'Senior AI Engineer',
      description: 'Fluency in English is required. A strong portfolio of shipped work helps.',
    }))
    expect(result.languages).toContain('English')
    expect(result.portfolioExpected).toBe(true)
    expect(result.domains).toContain('ai')
  })

  it('does not promote noisy feed tags into the technical stack', () => {
    const result = extractJobRequirements(job({
      skills: ['dev', 'marketing', 'medical', 'TypeScript', 'Kubernetes'],
    }))
    expect(result.requiredSkills).not.toContain('marketing')
    expect(result.requiredSkills).not.toContain('medical')
    expect(result.requiredSkills).toEqual(expect.arrayContaining(['TypeScript', 'Kubernetes']))
  })

  it('keeps the evidence trail and never invents requirements', () => {
    const result = extractJobRequirements(job({ description: 'A great place to work with competitive benefits.' }))
    expect(result.hardRequirements).toEqual([])
    expect(result.preferredQualifications).toEqual([])
    expect(result.confidence).toBe('low')
    expect(result.requiredSkills).toEqual(['Node.js', 'PostgreSQL'])
  })
})
