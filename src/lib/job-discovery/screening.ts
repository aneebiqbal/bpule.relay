import type { ProfileEvidence } from '@/lib/generation/sales-context'
import type { JobRequirements } from './requirements'

/**
 * Evidence-grounded screening answers.
 *
 * A screening answer is either a draft built ONLY from canonical profile
 * evidence, or explicitly marked `needs_human`. Availability, salary and work
 * authorization are never guessed — Relay does not hold that data, so the
 * operator must supply it.
 */

export type ScreeningStatus = 'draft' | 'needs_human'

export interface ScreeningAnswer {
  id: string
  question: string
  answer: string | null
  status: ScreeningStatus
  evidence: Array<{ id: string; claim: string }>
  confidence: 'high' | 'medium' | 'low'
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]/g, '')
}

function skillCovered(skill: string, evidence: ProfileEvidence): boolean {
  const target = normalize(skill)
  const haystack = [
    ...evidence.proofCards.flatMap((card) => [card.capability, card.safeClaim ?? '', ...card.tags]),
    ...evidence.experience.flatMap((row) => [row.role ?? '', row.company ?? '']),
    ...evidence.portfolioProjects.flatMap((row) => [row.title, row.description ?? '', ...row.technologies]),
  ]
  return haystack.some((text) => normalize(text).includes(target))
}

export function buildScreeningAnswers(input: {
  requirements: JobRequirements
  evidence: ProfileEvidence
  jobTitle: string
  company: string | null
}): ScreeningAnswer[] {
  const { requirements, evidence } = input
  const answers: ScreeningAnswer[] = []

  const covered = requirements.requiredSkills.filter((skill) => skillCovered(skill, evidence))
  answers.push({
    id: 'required-technologies',
    question: `Which of the required technologies (${requirements.requiredSkills.slice(0, 6).join(', ')}) have you worked with?`,
    answer: covered.length > 0
      ? `Verified work covers ${covered.join(', ')}.`
      : null,
    status: covered.length > 0 ? 'draft' : 'needs_human',
    evidence: evidence.proofCards
      .filter((card) =>
        card.safeClaim && card.tags.some((tag) => requirements.requiredSkills.some((skill) => normalize(tag) === normalize(skill))),
      )
      .slice(0, 3)
      .map((card) => ({ id: card.id, claim: card.safeClaim as string })),
    confidence: covered.length > 0 ? 'high' : 'low',
  })

  const project = evidence.portfolioProjects[0] ?? null
  answers.push({
    id: 'relevant-project',
    question: 'Describe a relevant project.',
    answer: project
      ? `${project.title}${project.role ? ` — ${project.role}` : ''}. ${project.outcome ?? project.description ?? ''}`.trim()
      : evidence.proofCards.find((card) => card.safeClaim)?.safeClaim ?? null,
    status: project || evidence.proofCards.some((card) => card.safeClaim) ? 'draft' : 'needs_human',
    evidence: (project ? [{ id: project.id, claim: project.outcome ?? project.title }] : [])
      .concat(evidence.proofCards.filter((card) => card.safeClaim).slice(0, 2).map((card) => ({ id: card.id, claim: card.safeClaim as string }))),
    confidence: project ? 'high' : 'medium',
  })

  const links = evidence.portfolioProjects
    .map((row) => (row as unknown as { url?: string | null }).url)
    .filter((url): url is string => Boolean(url))
  answers.push({
    id: 'portfolio-links',
    question: 'Portfolio or profile links?',
    answer: links.length > 0 ? links.join(', ') : null,
    status: links.length > 0 ? 'draft' : 'needs_human',
    evidence: links.map((url, index) => ({ id: `link-${index}`, claim: url })),
    confidence: links.length > 0 ? 'high' : 'low',
  })

  const roles = evidence.experience
    .filter((row) => row.role)
    .slice(0, 4)
    .map((row) => `${row.role} at ${row.company ?? 'an unnamed company'}${row.isCurrent ? ' (current)' : ''}`)
  answers.push({
    id: 'professional-background',
    question: 'Summarize your professional background.',
    answer: roles.length > 0 ? roles.join('; ') + '.' : null,
    status: roles.length > 0 ? 'draft' : 'needs_human',
    evidence: evidence.experience.filter((row) => row.role).slice(0, 3).map((row) => ({ id: row.id, claim: `${row.role} at ${row.company ?? 'unlisted'}` })),
    confidence: roles.length > 0 ? 'high' : 'low',
  })

  // Never inferred — Relay holds no availability, compensation or authorization data.
  answers.push({
    id: 'availability',
    question: 'When can you start, and what is your availability?',
    answer: null,
    status: 'needs_human',
    evidence: [],
    confidence: 'low',
  })
  answers.push({
    id: 'salary-expectations',
    question: 'What are your salary expectations?',
    answer: null,
    status: 'needs_human',
    evidence: [],
    confidence: 'low',
  })
  answers.push({
    id: 'work-authorization',
    question: 'Are you authorized to work in the required location?',
    answer: null,
    status: 'needs_human',
    evidence: [],
    confidence: 'low',
  })
  answers.push({
    id: 'timezone',
    question: 'What is your working timezone?',
    answer: null,
    status: 'needs_human',
    evidence: [],
    confidence: 'low',
  })

  return answers
}
