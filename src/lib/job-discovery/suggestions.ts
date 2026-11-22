import type { ResumeData } from '@/lib/bd/resume-engine'
import type { JobRequirements } from './requirements'
import type { ProfileEvidence } from '@/lib/generation/sales-context'

/**
 * Explainable, evidence-grounded resume suggestions.
 *
 * A suggestion never invents wording: the "suggested" text is either the
 * profile's own existing sentence or a verbatim approved proof claim. Every
 * suggestion names the job requirement it addresses and the proof that
 * supports it.
 */

export interface ResumeSuggestion {
  id: string
  section: 'summary' | 'skills' | 'bullet'
  existing: string
  suggested: string
  requirement: string
  evidence: { id: string; capability: string; claim: string }
  rationale: string
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]/g, '')
}

function skillPresent(resumeSkills: string[], required: string): boolean {
  const target = normalize(required)
  return resumeSkills.some((skill) => {
    const candidate = normalize(skill)
    return candidate === target || candidate.includes(target) || target.includes(candidate)
  })
}

export function buildJobSuggestions(
  resume: ResumeData,
  requirements: JobRequirements,
  evidence: ProfileEvidence,
): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = []
  const required = requirements.requiredSkills

  // 1. Summary: reference the required skills the profile actually has.
  const summary = resume.summary ?? ''
  const mentioned = required.filter((skill) => summary.toLowerCase().includes(skill.toLowerCase()))
  const missingFromSummary = required.filter((skill) => !mentioned.includes(skill) && skillPresent(resume.skills, skill))
  if (missingFromSummary.length > 0 && summary) {
    suggestions.push({
      id: 'summary-required-skills',
      section: 'summary',
      existing: summary,
      suggested: `${summary} Verified work includes ${missingFromSummary.slice(0, 3).join(', ')}.`,
      requirement: `Role requires ${missingFromSummary.join(', ')}`,
      evidence: { id: 'profile-summary', capability: 'Profile summary', claim: summary },
      rationale: 'Names the required skills already supported by the profile so the reader sees the fit immediately.',
      confidence: 'high',
      warnings: [],
    })
  }

  // 2. Skills: surface required skills first (reorder only, never invent).
  const ordered = [
    ...resume.skills.filter((skill) => required.some((req) => skillPresent([skill], req))),
    ...resume.skills.filter((skill) => !required.some((req) => skillPresent([skill], req))),
  ]
  if (ordered.join('|') !== resume.skills.join('|') && ordered.length > 0) {
    suggestions.push({
      id: 'skills-reorder',
      section: 'skills',
      existing: resume.skills.join(', '),
      suggested: ordered.join(', '),
      requirement: `Required skills: ${required.join(', ')}`,
      evidence: { id: 'profile-skills', capability: 'Verified skills', claim: resume.skills.join(', ') },
      rationale: 'Moves the required skills to the front without adding anything unsupported.',
      confidence: 'high',
      warnings: [],
    })
  }

  // 3. Bullets: attach a verbatim proof claim for a required skill that the
  //    current role bullets do not already cover.
  const usedClaims = new Set(resume.experience.flatMap((item) => item.bullets))
  const bulletText = resume.experience.flatMap((item) => item.bullets).join(' ').toLowerCase()
  for (const card of evidence.proofCards) {
    if (!card.safeClaim || usedClaims.has(card.safeClaim)) continue
    if (!card.verified && card.strength !== 'strong') continue
    const covers = required.find((skill) => card.tags.some((tag) => skillPresent([tag], skill)))
    if (!covers) continue
    if (bulletText.includes(card.safeClaim.toLowerCase())) continue
    const target = resume.experience[resume.experience.length - 1]
    if (!target) continue
    suggestions.push({
      id: `bullet-${card.id}`,
      section: 'bullet',
      existing: target.bullets[0] ?? `${target.role} at ${target.company}`,
      suggested: card.safeClaim,
      requirement: `Role requires ${covers}; supported by verified proof "${card.capability}".`,
      evidence: { id: card.id, capability: card.capability, claim: card.safeClaim },
      rationale: 'Uses a verbatim approved achievement instead of new wording, so nothing is invented.',
      confidence: card.verified ? 'high' : 'medium',
      warnings: card.verified ? [] : ['This proof is not marked verified.'],
    })
  }

  return suggestions.slice(0, 12)
}
