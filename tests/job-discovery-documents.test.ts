import { describe, expect, it } from 'vitest'
import type { Profile } from '@/lib/domain/types'
import type { ProfileEvidence } from '@/lib/generation/sales-context'
import {
  buildLinkedInNote,
  buildResumeData,
  extractResponsibilities,
  resumeToText,
  tailorResumeForJob,
} from '@/lib/job-discovery/documents'
import { renderResumePdf, extractPdfText } from '@/lib/job-discovery/pdf'
import { renderResumeDocx } from '@/lib/job-discovery/docx'
import { evaluateResumeAgainstJob } from '@/lib/job-discovery/ats'
import type { DiscoveryJob } from '@/lib/job-discovery/types'

const profile: Profile = {
  id: 'p1',
  repId: 'r1',
  organizationId: 'o1',
  platform: 'linkedin',
  label: 'Ada Lovelace',
  profileUrl: 'https://www.linkedin.com/in/ada',
  headline: 'Senior Backend Engineer',
  cvPath: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  fullName: 'Ada Lovelace',
  currentRole: 'Senior Backend Engineer',
  location: 'Berlin, Germany',
  professionalSummary: 'Backend engineer focused on Postgres and APIs.',
  primarySkills: ['Node.js', 'PostgreSQL'],
  technologies: ['TypeScript'],
  yearsExperience: 7,
  seniority: 'senior',
}

const evidence: ProfileEvidence = {
  proofCards: [
    {
      id: 'c1',
      organizationId: 'o1',
      profileId: 'p1',
      capability: 'Built a payments integration',
      strength: 'strong',
      safeClaim: 'Integrated a payment provider and reduced failed payments.',
      sourceType: 'client_work',
      sourceReference: 'https://example.com/case',
      tags: ['Stripe', 'Node.js'],
      verified: true,
      forbiddenClaims: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  proofItems: [],
  portfolioProjects: [
    {
      id: 'proj1',
      title: 'Realtime dashboard',
      role: 'Backend Engineer',
      description: 'A dashboard for operational metrics.',
      technologies: ['React', 'Node.js'],
      clientCompany: null,
      outcome: 'Used by the operations team.',
      startDate: '2025-01-01',
      endDate: '2025-06-01',
    },
  ],
  experience: [
    { id: 'e1', role: 'Backend Engineer', company: 'Analytical Engines', startDate: '2020-01-01', endDate: '2024-01-01', isCurrent: false },
  ],
  reviews: [],
  claims: [],
}

const job: DiscoveryJob = {
  id: 'j1',
  sourceId: 'greenhouse',
  sourceJobId: '77',
  title: 'Senior Backend Engineer',
  company: 'Acme',
  locationRaw: 'Remote',
  remote: true,
  description: 'You will build APIs with Node.js and PostgreSQL. Requirements: 5+ years experience. Must have the right to work.',
  skills: ['Node.js', 'PostgreSQL', 'Kubernetes'],
  postedAt: '2026-04-01T00:00:00.000Z',
  applyUrl: 'https://boards.greenhouse.io/acme/jobs/77',
}

describe('ATS Resume Studio documents', () => {
  it('builds a truthful resume from verified evidence', () => {
    const resume = buildResumeData(profile, evidence)
    expect(resume.name).toBe('Ada Lovelace')
    expect(resume.title).toBe('Senior Backend Engineer')
    expect(resume.skills).toEqual(expect.arrayContaining(['Node.js', 'PostgreSQL', 'TypeScript']))
    expect(resume.experience[0].company).toBe('Analytical Engines')
    expect(resume.projects[0].name).toBe('Realtime dashboard')
    expect(resume.certifications).toEqual([])
  })

  it('populates experience bullets from approved proof claims only', () => {
    const resume = buildResumeData(profile, evidence)
    expect(resume.experience[0].bullets).toContain('Integrated a payment provider and reduced failed payments.')
    expect(resumeToText(resume)).not.toMatch(/\d+\+?\s*years/)
  })

  it('never leaks another profile evidence into the resume', () => {
    const other: ProfileEvidence = {
      ...evidence,
      proofCards: [{ ...evidence.proofCards[0], id: 'c2', safeClaim: 'Secret other claim.' }],
    }
    const resume = buildResumeData(profile, evidence)
    expect(resumeToText(resume)).not.toContain('Secret other claim.')
    expect(resumeToText(buildResumeData(profile, other))).toContain('Secret other claim.')
  })

  it('tailors by reordering existing evidence, not by inventing skills', () => {
    const base = buildResumeData(profile, evidence)
    const tailored = tailorResumeForJob(base, job)
    expect(tailored.skills.slice(0, 2)).toEqual(['Node.js', 'PostgreSQL'])
    expect(tailored.skills).not.toContain('Kubernetes')
    expect(extractResponsibilities(job.description)).toEqual(
      expect.arrayContaining([expect.stringContaining('You will build APIs')]),
    )
  })

  it('renders a PDF with a real text layer and re-extracts it', async () => {
    const resume = tailorResumeForJob(buildResumeData(profile, evidence), job)
    const text = resumeToText(resume)
    const pdf = renderResumePdf(text)
    expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
    const extracted = await extractPdfText(pdf)
    expect(extracted).toContain('Ada Lovelace')
    expect(extracted).toContain('Senior Backend Engineer')
    expect(extracted).toContain('Realtime dashboard')
  })

  it('renders A4 with the correct media box and clickable links', () => {
    const resume = tailorResumeForJob(buildResumeData(profile, evidence), job)
    const withLinks = { ...resume, links: ['https://github.com/ada'] }
    const pdf = renderResumePdf(resumeToText(withLinks), 'ultra', 'a4')
    const raw = pdf.toString('latin1')
    expect(raw).toContain('/MediaBox [0 0 595 842]')
    expect(raw).toContain('/Subtype /Link')
    expect(raw).toContain('https://github.com/ada')
  })

  it('renders a DOCX zip that contains the OOXML parts', () => {
    const docx = renderResumeDocx('Ada Lovelace\nSenior Backend Engineer')
    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK')
    const xml = docx.toString('utf8')
    expect(xml).toContain('[Content_Types].xml')
    expect(xml).toContain('word/document.xml')
    expect(xml).toContain('Ada Lovelace')
  })

  it('evaluates ATS readiness and separates matched, missing and unverified', async () => {
    const resume = tailorResumeForJob(buildResumeData(profile, evidence), job)
    const pdf = renderResumePdf(resumeToText(resume))
    const evaluation = await evaluateResumeAgainstJob(resume, job, pdf)
    expect(evaluation.matchedRequirements.map((item) => item.text)).toEqual(expect.arrayContaining(['Node.js', 'PostgreSQL']))
    expect(evaluation.missingRequirements.map((item) => item.text)).toContain('Kubernetes')
    expect(evaluation.unverifiedRequirements.length).toBeGreaterThan(0)
    expect(evaluation.extraction.attempted).toBe(true)
    expect(evaluation.extraction.readable).toBe(true)
    expect(evaluation.extraction.coverage).toBeGreaterThan(0.7)
    expect(evaluation.heuristicVersion).toBe('job-ats-v1')
  })

  it('builds a LinkedIn note without invented claims', () => {
    const note = buildLinkedInNote(profile, job)
    expect(note).toContain('Ada Lovelace')
    expect(note).toContain('Senior Backend Engineer')
    expect(note).not.toMatch(/\d+\+?\s*years/)
  })
})
