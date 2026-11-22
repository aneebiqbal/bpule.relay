/**
 * Transparent ATS-readiness evaluation.
 *
 * This is an internal heuristic, never an official employer ATS score. It
 * reports matched / missing / unverified requirements, format issues and
 * truthful improvements, and it re-extracts the generated PDF to prove the
 * text layer survived rendering.
 */

import { scoreResume, type ResumeData } from '@/lib/bd/resume-engine'
import type { DiscoveryJob } from './types'
import { extractPdfText } from './pdf'

export interface AtsRequirement {
  text: string
  status: 'matched' | 'missing' | 'unverified'
  evidence?: string
}

export interface AtsEvaluation {
  /** Internal 0-100 heuristic. Never an employer score. */
  score: number
  maxScore: 100
  heuristicVersion: string
  dimensions: Array<{ label: string; score: number; max: number; note: string }>
  matchedRequirements: AtsRequirement[]
  missingRequirements: AtsRequirement[]
  unverifiedRequirements: AtsRequirement[]
  formatIssues: string[]
  recommendations: string[]
  extraction: {
    attempted: boolean
    readable: boolean
    extractedLength: number
    /** Share of source resume lines found in the extracted PDF text. */
    coverage: number
    missingLines: string[]
  }
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function resumeText(resume: ResumeData): string {
  return [
    resume.name,
    resume.title,
    resume.summary,
    resume.skills.join(', '),
    ...resume.experience.flatMap((item) => [`${item.role} ${item.company} ${item.period}`, ...item.bullets]),
    ...resume.projects.flatMap((project) => [project.name, project.description, ...project.technologies, project.outcome ?? '']),
    ...(resume.achievements ?? []),
    ...resume.education,
    ...resume.certifications,
  ].join('\n')
}

function extractUnverifiedRequirements(job: DiscoveryJob): AtsRequirement[] {
  const text = job.description ?? ''
  const out: AtsRequirement[] = []
  const years = text.match(/\b(\d{1,2})\s*\+?\s*years?\b/i)
  if (years) out.push({ text: `${years[1]}+ years experience`, status: 'unverified', evidence: 'Experience length is not a profile fact Relay can confirm.' })
  if (/\b(bachelor|master|phd|doctorate|degree)\b/i.test(text)) {
    out.push({ text: 'Degree requirement', status: 'unverified', evidence: 'Relay has no verified education entry for this profile.' })
  }
  if (/\b(clearance|citizen|security)\b/i.test(text)) {
    out.push({ text: 'Clearance / citizenship requirement', status: 'unverified', evidence: 'Never inferred from a profile.' })
  }
  return out
}

export async function evaluateResumeAgainstJob(
  resume: ResumeData,
  job: DiscoveryJob,
  pdf?: Buffer,
): Promise<AtsEvaluation> {
  const target = {
    title: job.title,
    company: job.company ?? null,
    requiredSkills: job.skills ?? [],
    responsibilities: [],
    technologies: job.skills ?? [],
  }
  const scored = scoreResume(resume, target)
  const formatIssues: string[] = []
  const recommendations: string[] = []

  const resumeSkills = new Set(resume.skills.map((skill) => normalise(skill)))
  const matchedRequirements: AtsRequirement[] = []
  const missingRequirements: AtsRequirement[] = []
  for (const skill of job.skills ?? []) {
    const key = normalise(skill)
    const hit = [...resumeSkills].find((candidate) => candidate === key || candidate.includes(key) || key.includes(candidate))
    if (hit) matchedRequirements.push({ text: skill, status: 'matched', evidence: 'Present in verified profile skills.' })
    else missingRequirements.push({ text: skill, status: 'missing', evidence: 'Not present in the profile evidence used for this CV.' })
  }
  const unverifiedRequirements = extractUnverifiedRequirements(job)

  if (resume.experience.length === 0) formatIssues.push('No employment history sections were rendered.')
  if (resume.projects.length === 0) formatIssues.push('No project evidence sections were rendered.')
  if (!resume.name || resume.name === 'Candidate') formatIssues.push('The resume has no verified name.')
  if (resume.experience.some((item) => !item.period)) formatIssues.push('One or more roles have no date range.')
  if (resume.skills.length === 0) formatIssues.push('The skills section is empty.')

  if (missingRequirements.length > 0) {
    recommendations.push(
      `Do not claim ${missingRequirements.map((item) => item.text).join(', ')}. Either omit them or state the honest adjacent experience.`,
    )
  }
  if (resume.projects.length > 0 && missingRequirements.length > 0) {
    recommendations.push('If a verified project used a missing technology, surface that project higher rather than adding the skill in isolation.')
  }
  if (resume.experience.length > 0 && resume.experience.every((item) => item.bullets.length === 0)) {
    recommendations.push('Add a truthful bullet from verified proof to each role; an empty role reads as unsupported.')
  }

  const source = resumeText(resume)
  const sourceLines = source.split('\n').map(normalise).filter((line) => line.length > 2)
  let extraction: AtsEvaluation['extraction'] = {
    attempted: false,
    readable: false,
    extractedLength: 0,
    coverage: 0,
    missingLines: [],
  }
  if (pdf) {
    try {
      const extracted = await extractPdfText(pdf)
      const extractedNormalised = normalise(extracted)
      const missingLines = sourceLines.filter((line) => !extractedNormalised.includes(line)).slice(0, 8)
      const coverage = sourceLines.length === 0 ? 1 : (sourceLines.length - missingLines.length) / sourceLines.length
      extraction = {
        attempted: true,
        readable: extracted.trim().length > 0,
        extractedLength: extracted.trim().length,
        coverage: Math.round(coverage * 100) / 100,
        missingLines,
      }
      if (!extraction.readable) formatIssues.push('The generated PDF has no extractable text layer.')
      else if (coverage < 0.7) formatIssues.push('Text extraction missed more than 30% of the resume lines.')
    } catch {
      formatIssues.push('The generated PDF could not be re-read for text extraction.')
      extraction = { attempted: true, readable: false, extractedLength: 0, coverage: 0, missingLines: [] }
    }
  }

  const penalty = formatIssues.length * 5
  const score = Math.max(0, scored.score - penalty)

  return {
    score,
    maxScore: 100,
    heuristicVersion: 'job-ats-v1',
    dimensions: scored.dimensions,
    matchedRequirements,
    missingRequirements,
    unverifiedRequirements,
    formatIssues,
    recommendations,
    extraction,
  }
}
