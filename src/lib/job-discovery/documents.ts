/**
 * Job Intelligence v2 — ATS Resume Studio.
 *
 * Every document is built from canonical profile evidence. Tailoring selects,
 * reorders and accurately rewrites existing facts; it never adds an employer,
 * year, degree, certification, outcome or number the profile cannot support.
 */

import { generate } from '@/lib/ai/runtime'
import { generateResume, scoreResume, type ResumeData, type ResumeProject, type ResumeTarget } from '@/lib/bd/resume-engine'
import type { Profile } from '@/lib/domain/types'
import type { ProfileEvidence } from '@/lib/generation/sales-context'
import {
  buildSalesGenerationContext,
  findUnsupportedClaims,
  formatEvidenceBlock,
  formatProfileBlock,
  formatTargetBlock,
  toAllowedNumbers,
  toClaimableText,
  type GenerationChannel,
} from '@/lib/generation/sales-context'
import { evaluateCoverLetter } from '@/lib/upwork/application-gate'
import type { DiscoveryJob } from './types'

export interface GeneratedDocument {
  kind: 'cv' | 'cover_letter' | 'upwork_proposal' | 'linkedin_note' | 'portfolio'
  text: string
  content: Record<string, unknown>
  ats?: unknown
  warnings: string[]
  unsupportedClaims: string[]
  evidenceUsed: Array<{ id: string; title: string; url?: string | null }>
  attachments: Array<{ id: string; title: string; url: string }>
}

function formatPeriod(start: string | null, end: string | null): string {
  const s = start ? start.slice(0, 7) : ''
  const e = end ? end.slice(0, 7) : 'Present'
  if (!s) return e
  return `${s} – ${e}`
}

export function buildResumeData(profile: Profile, evidence: ProfileEvidence): ResumeData {
  const name = profile.displayName ?? profile.fullName ?? profile.label ?? 'Candidate'
  const title = profile.currentRole ?? profile.headline ?? evidence.proofCards[0]?.capability ?? 'Professional'
  const skills = [
    ...(profile.primarySkills ?? []),
    ...(profile.secondarySkills ?? []),
    ...(profile.technologies ?? []),
    ...evidence.proofCards.flatMap((card) => card.tags),
    ...evidence.portfolioProjects.flatMap((project) => project.technologies),
  ]
  const experience = evidence.experience.map((item) => ({
    company: item.company ?? 'Independent',
    role: item.role ?? title,
    period: formatPeriod(item.startDate, item.endDate),
    bullets: [],
  }))
  const projects: ResumeProject[] = evidence.portfolioProjects.map((project) => ({
    name: project.title,
    description: project.description ?? '',
    technologies: project.technologies,
    outcome: project.outcome,
  }))
  const certifications = evidence.proofCards
    .filter((card) => card.sourceType === 'certification')
    .map((card) => card.capability)
  const summary = profile.professionalSummary
    ?? profile.bio
    ?? `${title} with verified evidence in ${[...new Set(skills)].slice(0, 5).join(', ')}.`

  return {
    name,
    title,
    summary,
    skills: [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))].slice(0, 40),
    experience,
    projects,
    education: [],
    certifications,
  }
}

/** Pull responsibility-like lines from a job description without inventing any. */
export function extractResponsibilities(description: string, limit = 8): string[] {
  const lines = description
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-•*▪◦\d.)\]]+/, '').trim())
    .filter((line) => line.length > 20)
  const picked: string[] = []
  for (const line of lines) {
    if (/\b(you will|you'll|responsible for|requirements?|must have|we need|looking for|your role)\b/i.test(line)) {
      picked.push(line.replace(/\s+/g, ' ').slice(0, 220))
    }
    if (picked.length >= limit) break
  }
  if (picked.length === 0) {
    for (const line of lines.slice(0, limit)) picked.push(line.replace(/\s+/g, ' ').slice(0, 220))
  }
  return picked
}

export function tailorResumeForJob(base: ResumeData, job: DiscoveryJob): ResumeData {
  const target: ResumeTarget = {
    title: job.title,
    company: job.company ?? null,
    requiredSkills: job.skills ?? [],
    responsibilities: extractResponsibilities(job.description ?? ''),
    technologies: job.skills ?? [],
  }
  return generateResume(base, target)
}

export function buildLinkedInNote(profile: Profile, job: DiscoveryJob): string {
  const name = profile.displayName ?? profile.fullName ?? profile.label ?? 'there'
  const role = profile.currentRole ?? profile.headline ?? 'engineering professional'
  const skills = [...(profile.primarySkills ?? []), ...(profile.technologies ?? [])].filter(Boolean).slice(0, 3)
  const skillText = skills.length > 0 ? ` My recent work focuses on ${skills.join(', ')}.` : ''
  return `Hi, I'm ${name}. I'm a ${role}.${skillText} I saw the ${job.title} role at ${job.company ?? 'your company'} and would be glad to connect about it.`
}

export function extractPortfolioLinks(profile: Profile, evidence: ProfileEvidence): Array<{ id: string; title: string; url: string }> {
  const links: Array<{ id: string; title: string; url: string }> = []
  if (profile.profileUrl && /^https?:\/\//i.test(profile.profileUrl)) {
    links.push({ id: `profile:${profile.id}`, title: 'Profile', url: profile.profileUrl })
  }
  for (const card of evidence.proofCards) {
    if (card.sourceReference && /^https?:\/\//i.test(card.sourceReference)) {
      links.push({ id: card.id, title: card.capability, url: card.sourceReference })
    }
  }
  return links
}

interface AiDocumentOptions {
  profile: Profile
  evidence: ProfileEvidence
  job: DiscoveryJob
  channel: GenerationChannel
  wordBand: [number, number]
  kind: 'cover_letter' | 'upwork_proposal'
}

async function generateAiDocument(options: AiDocumentOptions): Promise<GeneratedDocument> {
  const { profile, evidence, job, channel, wordBand, kind } = options
  const context = buildSalesGenerationContext({
    profile,
    evidence,
    channel,
    target: {
      channel,
      title: job.title,
      description: job.description,
      requiredSkills: job.skills ?? [],
      company: job.company ?? null,
      tags: job.categories ?? [],
    },
  })
  const profileBlock = formatProfileBlock(context)
  const evidenceBlock = formatEvidenceBlock(context)
  const targetBlock = formatTargetBlock(context)
  const isProposal = kind === 'upwork_proposal'

  const system = [
    isProposal
      ? 'You are a senior proposal writer. The human sends the proposal themselves; you never send anything.'
      : 'You are a senior cover letter writer. The human sends the letter themselves; you never send anything.',
    '',
    '## HARD RULES',
    '- Use ONLY facts from the SENDER PROFILE and RELEVANT PROOF blocks.',
    '- Never invent employers, years of experience, degrees, certifications, project outcomes, clients, metrics or links.',
    '- Do not restate the whole job description. Reference 1-3 specific signals from it.',
    '- No banned marketing phrases, no emojis, no em dashes, no formal sign-off.',
    '- If a required skill is missing from the profile, acknowledge it honestly.',
    '- Return JSON: {"text": "the document body only"}',
    '',
    profileBlock,
    '',
    evidenceBlock,
    '',
    targetBlock,
  ].filter(Boolean).join('\n\n')

  const user = [
    `Write the ${isProposal ? 'proposal' : 'cover letter'} for this job.`,
    `Aim for ${wordBand[0]}-${wordBand[1]} words.`,
    'Return only the JSON object.',
  ].join('\n')

  try {
    const result = await generate<{ text: string }>({
      task: 'DEEP_WRITING',
      system,
      user,
      schema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
        additionalProperties: false,
      },
      maxTokens: 1200,
      temperature: 0.5,
      feature: `job_${kind}`,
      callSite: `job-discovery:${kind}`,
      jobId: job.id,
      repId: profile.repId,
      organizationId: profile.organizationId,
    })
    const raw = (result.data?.text ?? '').trim()
    const evaluation = evaluateCoverLetter(
      raw,
      { title: job.title, description: job.description, skills: job.skills ?? [], screeningQuestions: [] },
      {
        claimableText: toClaimableText(context),
        proof: context.rankedProof.map((item) => `${item.title}: ${item.claim}`),
        allowedNumbers: [...toAllowedNumbers(context)],
      },
      wordBand,
    )
    const unsupportedClaims = findUnsupportedClaims(evaluation.text, context)
    return {
      kind,
      text: evaluation.text,
      content: { text: evaluation.text, wordCount: evaluation.wordCount },
      warnings: evaluation.issues.map((issue) => issue.message),
      unsupportedClaims,
      evidenceUsed: context.rankedProof.map((item) => ({ id: item.id, title: item.title, url: item.url })),
      attachments: extractPortfolioLinks(profile, evidence),
    }
  } catch {
    return {
      kind,
      text: '',
      content: {},
      warnings: ['Generation failed. Check the AI provider status and try again.'],
      unsupportedClaims: [],
      evidenceUsed: [],
      attachments: extractPortfolioLinks(profile, evidence),
    }
  }
}

export function buildCvDocument(profile: Profile, evidence: ProfileEvidence, job: DiscoveryJob): GeneratedDocument {
  const base = buildResumeData(profile, evidence)
  const tailored = tailorResumeForJob(base, job)
  const ats = scoreResume(tailored, {
    title: job.title,
    company: job.company ?? null,
    requiredSkills: job.skills ?? [],
    responsibilities: extractResponsibilities(job.description ?? ''),
    technologies: job.skills ?? [],
  })
  return {
    kind: 'cv',
    text: resumeToText(tailored),
    content: tailored as unknown as Record<string, unknown>,
    ats,
    warnings: ats.missing.length > 0 ? [`Missing required skills: ${ats.missing.join(', ')}`] : [],
    unsupportedClaims: [],
    evidenceUsed: evidence.proofCards.slice(0, 6).map((card) => ({ id: card.id, title: card.capability, url: card.sourceReference })),
    attachments: extractPortfolioLinks(profile, evidence),
  }
}

export function resumeToText(resume: ResumeData): string {
  const lines: string[] = [resume.name, resume.title, '']
  if (resume.summary) lines.push(resume.summary, '')
  if (resume.skills.length > 0) lines.push(`Skills: ${resume.skills.join(', ')}`, '')
  if (resume.experience.length > 0) {
    lines.push('Experience')
    for (const item of resume.experience) {
      lines.push(`${item.role} — ${item.company} (${item.period})`)
      for (const bullet of item.bullets) lines.push(`- ${bullet}`)
    }
    lines.push('')
  }
  if (resume.projects.length > 0) {
    lines.push('Projects')
    for (const project of resume.projects) {
      lines.push(`${project.name}${project.technologies.length > 0 ? ` — ${project.technologies.join(', ')}` : ''}`)
      if (project.description) lines.push(`- ${project.description}`)
      if (project.outcome) lines.push(`- Outcome: ${project.outcome}`)
    }
    lines.push('')
  }
  if (resume.certifications.length > 0) lines.push(`Certifications: ${resume.certifications.join(', ')}`, '')
  return lines.join('\n').trim()
}

export async function generateJobDocuments(
  profile: Profile,
  evidence: ProfileEvidence,
  job: DiscoveryJob,
): Promise<GeneratedDocument[]> {
  const documents = [buildCvDocument(profile, evidence, job)]
  const linkedinNote = buildLinkedInNote(profile, job)
  documents.push({
    kind: 'linkedin_note',
    text: linkedinNote,
    content: { text: linkedinNote },
    warnings: [],
    unsupportedClaims: [],
    evidenceUsed: [],
    attachments: extractPortfolioLinks(profile, evidence),
  })
  const [coverLetter, proposal] = await Promise.all([
    generateAiDocument({ profile, evidence, job, channel: 'email', wordBand: [80, 220], kind: 'cover_letter' }),
    generateAiDocument({ profile, evidence, job, channel: 'upwork', wordBand: [60, 180], kind: 'upwork_proposal' }),
  ])
  documents.push(coverLetter, proposal)
  return documents
}
