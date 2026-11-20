import { describe, expect, it } from 'vitest'
import { assessResume, type AtsContact, type AtsInput } from '@/lib/job-discovery/ats-score'
import type { JobRequirements } from '@/lib/job-discovery/requirements'
import type { ResumeData } from '@/lib/bd/resume-engine'

const resume: ResumeData = {
  name: 'Ayesha Khan',
  title: 'Senior Full-Stack Engineer',
  summary: 'Builds Rails, React and PostgreSQL products for logistics clients.',
  skills: ['Ruby on Rails', 'React', 'PostgreSQL', 'TypeScript', 'Node.js'],
  experience: [
    {
      company: 'Analytical Engines',
      role: 'Senior Full-Stack Engineer',
      period: '2020-01 – Present',
      bullets: [
        'Built a Rails and React operations dashboard used by 40 engineers.',
        'Migrated a PostgreSQL reporting pipeline, reducing runtime by 35%.',
      ],
    },
  ],
  projects: [
    { name: 'Realtime dashboard', description: 'Operations metrics', technologies: ['React', 'Node.js', 'PostgreSQL'], outcome: 'Adopted by the operations team' },
  ],
  education: [],
  certifications: [],
}

const requirements: JobRequirements = {
  version: 1,
  sourceHash: null,
  requiredSkills: ['Rails', 'React', 'PostgreSQL'],
  preferredSkills: [],
  seniority: 'senior',
  yearsExperience: { min: 5, max: null },
  stack: ['Rails', 'React', 'PostgreSQL'],
  responsibilities: ['Build a Rails and React operations dashboard'],
  domains: ['saas'],
  languages: ['English'],
  certifications: [],
  portfolioExpected: false,
  employmentType: 'full-time',
  hardRequirements: ['Must have 5+ years of Rails experience.'],
  preferredQualifications: [],
  evidence: [],
  confidence: 'high',
}

const contact: AtsContact = {
  name: 'Ayesha Khan',
  title: 'Senior Full-Stack Engineer',
  location: 'Karachi, Pakistan',
  links: ['https://github.com/ayeshakhan'],
  email: 'ayesha@example.com',
  phone: null,
}

describe('assessResume', () => {
  it('scores a complete, truthful document at 95+ document quality', () => {
    const result = assessResume({
      resume,
      requirements,
      contact,
      extraction: { coverage: 1, pages: 1, overflow: false, missingSections: [] },
    })
    expect(result.documentQuality.score).toBeGreaterThanOrEqual(95)
    expect(result.jobMatch.missing).toEqual([])
    expect(result.jobMatch.strengths).toEqual(expect.arrayContaining(['Rails', 'React', 'PostgreSQL']))
  })

  it('matches skill aliases instead of demanding exact strings', () => {
    const result = assessResume({ resume, requirements: { ...requirements, requiredSkills: ['Ruby on Rails', 'Node.js'] }, contact, extraction: { coverage: 1, pages: 1, overflow: false, missingSections: [] } })
    expect(result.jobMatch.missing).toEqual([])
  })

  it('reports honest gaps rather than hiding them', () => {
    const result = assessResume({ resume, requirements: { ...requirements, requiredSkills: ['Rails', 'Kubernetes'] }, contact, extraction: { coverage: 1, pages: 1, overflow: false, missingSections: [] } })
    expect(result.jobMatch.missing).toContain('Kubernetes')
    expect(result.notes.join(' ')).toMatch(/Kubernetes/)
    const requiredDimension = result.jobMatch.dimensions.find((dimension) => dimension.label === 'Required skill coverage')
    expect(requiredDimension?.score).toBe(15)
  })

  it('penalises a broken extraction and missing contact channels', () => {
    const result = assessResume({
      resume,
      requirements,
      contact: { name: 'Ayesha Khan', title: 'Engineer', location: null, links: [], email: null, phone: null },
      extraction: { coverage: 0.6, pages: 3, overflow: true, missingSections: ['Experience'] },
    })
    expect(result.documentQuality.score).toBeLessThan(80)
    expect(result.documentQuality.issues.join(' ')).toMatch(/overflow/i)
    expect(result.documentQuality.issues.join(' ')).toMatch(/extraction coverage/i)
  })

  it('keeps document quality and job match as separate scores', () => {
    const result = assessResume({ resume, requirements, contact, extraction: { coverage: 1, pages: 1, overflow: false, missingSections: [] } })
    expect(result.readiness).toBe(Math.round(result.documentQuality.score * 0.45 + result.jobMatch.score * 0.55))
    expect(result.notes[0]).toMatch(/never an employer ATS ranking/i)
  })
})
