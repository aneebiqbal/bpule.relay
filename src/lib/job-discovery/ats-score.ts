import type { ResumeData } from '@/lib/bd/resume-engine'
import type { JobRequirements } from './requirements'

/**
 * Transparent ATS assessment.
 *
 * Two independent scores, never merged into a fake "employer ATS" number:
 *   - Document Quality: how readable, complete and extractable the resume is.
 *   - Job Match: how genuinely aligned the candidate is with THIS posting.
 *
 * Scores are additive and explainable. Nothing here is an employer ranking.
 */

export interface ScoreDimension {
  label: string
  score: number
  max: number
  note: string
}

export interface AtsContact {
  name: string
  title: string
  location: string | null
  links: string[]
  email: string | null
  phone: string | null
}

export interface ExtractionStats {
  /** Fraction of approved resume text found in the extracted PDF text (0..1). */
  coverage: number
  pages: number
  overflow: boolean
  missingSections: string[]
}

export interface AtsInput {
  resume: ResumeData
  requirements: JobRequirements
  contact: AtsContact
  extraction: ExtractionStats | null
}

export interface AtsAssessment {
  documentQuality: { score: number; dimensions: ScoreDimension[]; issues: string[] }
  jobMatch: { score: number; dimensions: ScoreDimension[]; missing: string[]; strengths: string[] }
  /** 0..100 ATS-readiness for a genuinely suitable application. */
  readiness: number
  notes: string[]
}

const BANNED = /\b(synergy|guru|ninja|rockstar|wizard|thought leader|results[- ]driven|go[- ]getter|detail[- ]oriented|self[- ]starter)\b/i
const ACTION = /\b(built|led|designed|launched|shipped|scaled|reduced|improved|automated|delivered|migrated|owned|drove|created|implemented|optimized)\b/i

function clamp(value: number, max: number): number
function clamp(value: number, min: number, max: number): number
function clamp(value: number, a: number, b?: number): number {
  const min = b === undefined ? 0 : a
  const max = b === undefined ? a : b
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]/g, '')
}

function tokens(value: string): string[] {
  return normalize(value).split(' ').filter(Boolean)
}

function skillMatches(resumeSkill: string, requiredSkill: string): boolean {
  const a = normalize(resumeSkill)
  const b = normalize(requiredSkill)
  if (!a || !b) return false
  if (a === b) return true
  const at = new Set(tokens(resumeSkill))
  const bt = new Set(tokens(requiredSkill))
  for (const token of bt) if (at.has(token)) return true
  // Common aliases.
  const aliases: Record<string, string[]> = {
    rails: ['ruby', 'rails'], nodejs: ['node'], 'node.js': ['node'], k8s: ['kubernetes'],
    reactjs: ['react'], vuejs: ['vue'], js: ['javascript'], ts: ['typescript'],
    postgres: ['postgresql'], gcp: ['google', 'cloud'], mongo: ['mongodb'],
  }
  for (const [key, values] of Object.entries(aliases)) {
    if (a === key && values.some((v) => b.includes(v))) return true
    if (b === key && values.some((v) => a.includes(v))) return true
  }
  return false
}

export function scoreDocumentQuality(input: AtsInput): AtsAssessment['documentQuality'] {
  const { resume, contact, extraction } = input
  const dimensions: ScoreDimension[] = []
  const issues: string[] = []

  const identity = [resume.name, resume.title, resume.summary].filter((value) => Boolean(value && value.trim())).length
  const identityScore = clamp((identity / 3) * 10 + (resume.skills.length > 0 ? 7 : 0) + (resume.experience.length > 0 ? 8 : 0), 25)
  dimensions.push({
    label: 'Identity & completeness',
    score: identityScore,
    max: 25,
    note: `${identity}/3 identity fields · ${resume.skills.length} skills · ${resume.experience.length} roles`,
  })
  if (identity < 3) issues.push('Add a name, professional title and summary.')

  const dated = resume.experience.filter((item) => /\d{4}/.test(item.period)).length
  const chronologyScore = resume.experience.length === 0
    ? 8
    : clamp((dated / resume.experience.length) * 20, 0, 20)
  dimensions.push({
    label: 'Chronology & accuracy',
    score: chronologyScore,
    max: 20,
    note: `${dated}/${resume.experience.length} roles carry a dated period`,
  })
  if (resume.experience.length > 0 && dated < resume.experience.length) issues.push('Every role needs a dated period.')

  const bullets = resume.experience.flatMap((item) => item.bullets)
  const actionBullets = bullets.filter((bullet) => ACTION.test(bullet)).length
  const bannedHits = bullets.filter((bullet) => BANNED.test(bullet)).length
  const readabilityScore = bullets.length === 0
    ? 5
    : clamp(((actionBullets / bullets.length) * 18) + (bannedHits === 0 ? 2 : 0), 0, 20)
  dimensions.push({
    label: 'Readability & action wording',
    score: readabilityScore,
    max: 20,
    note: `${actionBullets}/${bullets.length} bullets start with an action verb`,
  })
  if (bullets.length > 0 && actionBullets < bullets.length / 2) issues.push('Rewrite bullets to start with action verbs.')

  const contactScore = (contact.email ? 5 : 0) + (contact.phone ? 3 : 0) + (contact.links.length > 0 ? 4 : 0) + (contact.location ? 3 : 0)
  dimensions.push({
    label: 'Contact & links',
    score: clamp(contactScore, 0, 15),
    max: 15,
    note: `${contact.email ? 'email' : 'no email'} · ${contact.phone ? 'phone' : 'no phone'} · ${contact.links.length} links`,
  })
  if (!contact.email && !contact.phone && contact.links.length === 0) issues.push('Add a valid contact channel or portfolio link.')

  let extractionScore = 12
  if (extraction) {
    const coverage = Math.max(0, Math.min(1, extraction.coverage))
    extractionScore = clamp(coverage * 12 + (extraction.pages >= 1 && extraction.pages <= 2 ? 4 : 2) + (extraction.overflow ? 0 : 4), 0, 20)
    if (coverage < 0.9) issues.push(`PDF extraction coverage ${(coverage * 100).toFixed(0)}%.`)
    if (extraction.overflow) issues.push('The rendered PDF overflows its page bounds.')
    if (extraction.missingSections.length > 0) issues.push(`Missing sections after extraction: ${extraction.missingSections.join(', ')}.`)
  } else {
    issues.push('Render and extract the PDF to verify parseability.')
  }
  dimensions.push({ label: 'PDF extraction & format', score: extractionScore, max: 20, note: extraction ? `${(extraction.coverage * 100).toFixed(0)}% coverage · ${extraction.pages} page(s)` : 'not extracted' })

  return { score: dimensions.reduce((sum, d) => sum + d.score, 0), dimensions, issues }
}

export function scoreJobMatch(input: AtsInput): AtsAssessment['jobMatch'] {
  const { resume, requirements } = input
  const dimensions: ScoreDimension[] = []
  const missing: string[] = []
  const strengths: string[] = []

  const required = requirements.requiredSkills
  const matchedRequired = required.filter((skill) => resume.skills.some((candidate) => skillMatches(candidate, skill)))
  const coverage = required.length > 0 ? matchedRequired.length / required.length : 1
  const requiredScore = clamp(coverage * 30, 0, 30)
  dimensions.push({ label: 'Required skill coverage', score: requiredScore, max: 30, note: `${matchedRequired.length}/${required.length} required skills` })
  for (const skill of required) {
    if (!resume.skills.some((candidate) => skillMatches(candidate, skill))) missing.push(skill)
    else strengths.push(skill)
  }

  const experienceText = resume.experience.flatMap((item) => [item.role, item.company, ...item.bullets]).join(' ').toLowerCase()
  const responsibilityHits = requirements.responsibilities.filter((line) => {
    const words = line.toLowerCase().split(/\s+/).filter((word) => word.length > 4)
    return words.length > 0 && words.filter((word) => experienceText.includes(word)).length / words.length >= 0.25
  }).length
  const responsibilityCoverage = requirements.responsibilities.length > 0 ? responsibilityHits / requirements.responsibilities.length : 0.6
  const experienceScore = clamp(responsibilityCoverage * 20, 0, 20)
  dimensions.push({ label: 'Relevant experience', score: experienceScore, max: 20, note: `${responsibilityHits}/${requirements.responsibilities.length} responsibilities supported by evidence` })

  const preferredHits = requirements.preferredQualifications.filter((line) => {
    const words = line.toLowerCase().split(/\s+/).filter((word) => word.length > 4)
    return words.length > 0 && words.some((word) => experienceText.includes(word))
  }).length
  const preferredCoverage = requirements.preferredQualifications.length > 0 ? preferredHits / requirements.preferredQualifications.length : 0.5
  dimensions.push({ label: 'Preferred qualifications', score: clamp(preferredCoverage * 15, 0, 15), max: 15, note: `${preferredHits}/${requirements.preferredQualifications.length} preferred signals present` })

  const evidencedRoles = resume.experience.filter((item) => item.bullets.length > 0).length
  const projectsWithOutcome = resume.projects.filter((project) => Boolean(project.outcome)).length
  const evidenceScore = clamp((resume.experience.length > 0 ? (evidencedRoles / resume.experience.length) * 9 : 0) + Math.min(projectsWithOutcome, 3) * 2, 0, 15)
  dimensions.push({ label: 'Evidence quality', score: evidenceScore, max: 15, note: `${evidencedRoles} evidenced roles · ${projectsWithOutcome} projects with outcomes` })

  const domainHits = requirements.domains.filter((domain) => experienceText.includes(domain)).length
  const domainScore = requirements.domains.length > 0 ? clamp((domainHits / requirements.domains.length) * 10, 0, 10) : 5
  dimensions.push({ label: 'Domain relevance', score: domainScore, max: 10, note: requirements.domains.length > 0 ? `${domainHits}/${requirements.domains.length} domains` : 'no domain stated' })

  const seniorityScore = requirements.seniority ? 7 : 5
  dimensions.push({ label: 'Seniority fit', score: seniorityScore, max: 10, note: requirements.seniority ? `requires ${requirements.seniority}` : 'not stated' })

  return { score: dimensions.reduce((sum, d) => sum + d.score, 0), dimensions, missing, strengths }
}

export function assessResume(input: AtsInput): AtsAssessment {
  const documentQuality = scoreDocumentQuality(input)
  const jobMatch = scoreJobMatch(input)
  const readiness = Math.round(documentQuality.score * 0.45 + jobMatch.score * 0.55)
  const notes = [
    'Internal assessment only — never an employer ATS ranking.',
    ...documentQuality.issues,
    ...(jobMatch.missing.length > 0 ? [`Honest gaps: ${jobMatch.missing.join(', ')}.`] : []),
  ]
  return { documentQuality, jobMatch, readiness, notes }
}
