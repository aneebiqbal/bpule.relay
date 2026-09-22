/**
 * Find Jobs — AI semantic matching.
 *
 * Runs only on the top-N deterministic candidates (bounded by
 * JOBS_AI_CANDIDATE_CAP) and only when an AI provider is configured. The
 * output is validated against a strict schema before it touches a job, and
 * every failure degrades to the deterministic score. The final price of a
 * "94% match" is never a black box: deterministic (60%) + AI (40%).
 */

import type { JobWithMatch, CvProfile } from './types'
import { aiMatchCandidateCap } from './config'
import { hasProvider } from '@/lib/ai/config'
import { generate } from '@/lib/ai/runtime'
import { reportError } from '@/lib/errors'

const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 200,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'score', 'summary', 'strengths', 'gaps'],
        properties: {
          id: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          summary: { type: 'string', maxLength: 160 },
          strengths: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 90 } },
          gaps: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 90 } },
          matchedSkills: { type: 'array', maxItems: 6, items: { type: 'string', maxLength: 40 } },
          missingSkills: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 40 } },
        },
      },
    },
  },
} as const

const MATCH_SYSTEM = `You are a precise job-match scoring agent. For every job id in the input, return an objective match score against the candidate profile. Judge role fit, required skills, seniority and location realistically. Score 0-100 integer; 100 means the job fits the profile almost perfectly. Never fabricate skills a job does not list. Summaries are one short sentence. Return a single JSON object with an "items" array containing ONE entry per job id, using the exact ids given.`

interface AiItem {
  id: string
  score: number
  summary: string
  strengths: string[]
  gaps: string[]
  matchedSkills?: string[]
  missingSkills?: string[]
}

export interface MatchResult {
  jobs: JobWithMatch[]
  /** True when at least one AI score was accepted for a candidate. */
  aiUsed: boolean
}

export async function matchWithAi(
  scored: JobWithMatch[],
  cv: CvProfile,
): Promise<MatchResult> {
  if (!hasProvider() || scored.length === 0) return { jobs: scored, aiUsed: false }

  const cap = aiMatchCandidateCap()
  const candidates = [...scored].sort((a, b) => b.match.deterministic - a.match.deterministic).slice(0, cap)
  if (candidates.length === 0) return { jobs: scored, aiUsed: false }

  const user = buildUserPrompt(cv, candidates)
  let items: AiItem[]
  try {
    const result = await generate<{ items: AiItem[] }>({
      task: 'FAST_STRUCTURED',
      system: MATCH_SYSTEM,
      user,
      schema: MATCH_SCHEMA,
      maxTokens: Math.min(4096, 1500 + candidates.length * 36),
    })
    items = validateItems(result.data?.items, candidates)
  } catch (err) {
    reportError(err, { context: 'job-match.ai' })
    return { jobs: scored, aiUsed: false }
  }

  if (items.length === 0) return { jobs: scored, aiUsed: false }

  const byId = new Map(items.map((i) => [i.id, i]))
  const jobs = scored.map((job) => {
    const ai = byId.get(job.id)
    if (!ai) return job
    const aiScore = clampScore(ai.score)
    const score = Math.round(job.match.deterministic * 0.6 + aiScore * 0.4)
    return {
      ...job,
      match: {
        ...job.match,
        score,
        aiScore,
        aiAvailable: true,
        summary: clean(ai.summary, 160) || job.match.summary,
        strengths: cleanList(ai.strengths, 4),
        gaps: cleanList(ai.gaps, 3),
        matchedSkills: cleanList(ai.matchedSkills ?? [], 6),
        missingSkills: cleanList(ai.missingSkills ?? [], 4),
      },
    }
  })
  return { jobs, aiUsed: true }
}

/** Deterministic + AI blend used on the client for effort-free previews. */
export function combineScores(deterministic: number, aiScore: number | undefined): number {
  return aiScore === undefined ? deterministic : Math.round(deterministic * 0.6 + clampScore(aiScore) * 0.4)
}

function buildUserPrompt(cv: CvProfile, candidates: JobWithMatch[]): string {
  const cvBlock = [
    `Candidate primary role: ${cv.primaryRole}`,
    cv.alternativeRoles?.length ? `Equivalent roles: ${cv.alternativeRoles.join(', ')}` : null,
    cv.skills?.length ? `Candidate skills: ${cv.skills.join(', ')}` : null,
    cv.seniority ? `Seniority: ${cv.seniority}` : null,
    cv.location ? `Location: ${cv.location}` : null,
    cv.summary ? `Profile summary: ${cv.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const jobLines = candidates.map((job) => {
    const skills = (job.skills ?? []).join(', ') || 'not listed'
    const excerpt = (job.excerpt ?? job.description ?? '').slice(0, 240).replace(/\s+/g, ' ')
    return `- id: ${job.id}\n  title: ${job.title} | company: ${job.company} | location: ${job.location} | remote: ${job.remote} | employmentType: ${job.employmentType ?? 'n/a'}\n  skills: ${skills}\n  detail: ${excerpt}`
  })

  return `${cvBlock}\n\nJobs to score:\n${jobLines.join('\n')}`
}

function validateItems(raw: unknown, candidates: JobWithMatch[]): AiItem[] {
  if (!Array.isArray(raw)) return []
  const allowedIds = new Set(candidates.map((c) => c.id))
  const items: AiItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    if (typeof row.id !== 'string' || !allowedIds.has(row.id)) continue
    const score = typeof row.score === 'number' ? Math.round(row.score) : NaN
    items.push({
      id: row.id,
      score: Number.isFinite(score) ? clampScore(score) : 0,
      summary: clean(row.summary, 160),
      strengths: cleanList(row.strengths, 4),
      gaps: cleanList(row.gaps, 3),
      matchedSkills: cleanList(row.matchedSkills, 6),
      missingSkills: cleanList(row.missingSkills, 4),
    })
  }
  return items
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function clean(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => clean(v, 90)).filter(Boolean).slice(0, max)
}