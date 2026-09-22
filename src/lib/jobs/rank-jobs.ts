/**
 * Find Jobs — deterministic matching (ranking).
 *
 * A transparent, reproducible score computed for every job without AI. It
 * powers the default ordering and, when AI is available, provides the base
 * signal the semantic pass refines. Weights are fully local so scores keep
 * meaning: a "94% match" here always decomposes to the eight visible factors,
 * including how recently the role was posted.
 */

import type { Job, JobSearchParams, JobMatch, CvProfile, ScoreBreakdown } from './types'
import { workPreferenceFromParams } from './filters'

const WEIGHTS = {
  role: 0.2,
  skills: 0.24,
  seniority: 0.08,
  location: 0.1,
  remote: 0.1,
  salary: 0.06,
  employment: 0.05,
  freshness: 0.17,
} as const

const SENIORITY_RANK: Record<string, number> = {
  intern: 0,
  internship: 0,
  'entry-level': 1,
  junior: 2,
  'mid-level': 3,
  senior: 4,
  lead: 5,
  principal: 6,
  staff: 7,
  manager: 6,
  director: 7,
  head: 7,
  executive: 8,
}

const nouns = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)

const slugify = (value: string): string => value.toLowerCase().replace(/[^a-z0-9+#]/g, '')

export function scoreJob(job: Job, cv: CvProfile, params: JobSearchParams): JobMatch {
  const breakdown = {
    role: roleScore(job, cv),
    skills: skillsScore(job, cv),
    seniority: seniorityScore(job, cv),
    location: locationScore(job, cv),
    remote: remoteScore(job, params),
    salary: salaryScore(job),
    employment: employmentScore(job, params),
    freshness: freshnessScore(job),
  }
  const deterministic = Math.round(
    breakdown.role * WEIGHTS.role * 100 +
      breakdown.skills * WEIGHTS.skills * 100 +
      breakdown.seniority * WEIGHTS.seniority * 100 +
      breakdown.location * WEIGHTS.location * 100 +
      breakdown.remote * WEIGHTS.remote * 100 +
      breakdown.salary * WEIGHTS.salary * 100 +
      breakdown.employment * WEIGHTS.employment * 100 +
      breakdown.freshness * WEIGHTS.freshness * 100,
  )

  const { matched, missing } = skillGaps(job, cv)
  const strengths = buildStrengths(job, cv, breakdown)
  const gaps = buildGaps(job, missing, breakdown)

  return {
    score: deterministic,
    deterministic,
    aiScore: undefined,
    summary: summarize(job, cv, deterministic, matched.length),
    strengths,
    gaps,
    matchedSkills: matched,
    missingSkills: missing,
    aiAvailable: false,
    breakdown,
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function roleScore(job: Job, cv: CvProfile): number {
  const titleNouns = nouns(job.title)
  const titleSlug = slugify(job.title)
  if (slugify(cv.primaryRole) && titleSlug.includes(slugify(cv.primaryRole))) return 1
  const targets = [cv.primaryRole, ...(cv.alternativeRoles ?? [])]
  let best = 0
  for (const target of targets) {
    const targetNouns = nouns(target)
    if (targetNouns.length === 0) continue
    if (titleSlug.includes(slugify(target))) {
      best = Math.max(best, 1)
      continue
    }
    const overlap = targetNouns.filter((t) => titleNouns.includes(t)).length
    best = Math.max(best, overlap / targetNouns.length)
  }
  return clamp01(Math.min(1, best))
}

function skillsScore(job: Job, cv: CvProfile): number {
  const cvSkills = cv.skills.map(slugify).filter(Boolean)
  const jobSkills = (job.skills ?? []).map(slugify).filter(Boolean)
  if (cvSkills.length === 0) return 0.5
  if (jobSkills.length === 0) {
    // No explicit skills — check the description for CV skill mentions.
    const text = slugify(job.description ?? '')
    const mentioned = cvSkills.filter((s) => text.includes(s)).length
    return clamp01(mentioned / cvSkills.length > 0.2 ? 0.75 : 0.5)
  }
  const matched = jobSkills.filter((s) => cvSkills.includes(s)).length
  return clamp01(matched / jobSkills.length)
}

function seniorityScore(job: Job, cv: CvProfile): number {
  const jobRank = job.seniority ? (SENIORITY_RANK[job.seniority.toLowerCase()] ?? 3) : undefined
  const cvRank = cv.seniority ? (SENIORITY_RANK[cv.seniority.toLowerCase()] ?? 4) : undefined
  if (jobRank === undefined || cvRank === undefined) return 0.8
  const diff = Math.abs(jobRank - cvRank)
  if (diff === 0) return 1
  if (diff <= 1) return 0.9
  if (diff <= 2) return 0.7
  // Growing into a role scores better than reaching back down.
  if (jobRank > cvRank) return 0.55
  return 0.45
}

function locationScore(job: Job, cv: CvProfile): number {
  if (job.remote) return 1
  if (!cv.location) return 0.8
  const cvLower = cv.location.toLowerCase()
  if (cvLower === (job.country ?? '').toLowerCase()) return 0.75
  if (cvLower.length > 1 && job.location.toLowerCase().includes(cvLower)) return 0.85
  return 0.4
}

function remoteScore(job: Job, params: JobSearchParams): number {
  if (job.remote) return 1
  switch (workPreferenceFromParams(params)) {
    case 'remote':
      return 0.2
    case 'remote_hybrid':
      return job.hybrid ? 0.9 : 0.4
    case 'onsite':
      return job.onsite || !job.remote ? 0.9 : 0.5
    case 'any':
    default:
      return 0.8
  }
}

function salaryScore(job: Job): number {
  if (!job.salary) return 0.4
  if (job.salary.normalizable) return 1
  return 0.7
}

const EMPLOYMENT_CONFLICT: Record<string, string[]> = {
  'full-time': ['part-time'],
  'part-time': ['full-time'],
  contract: ['permanent'],
  permanent: ['contract'],
  internship: ['full-time', 'part-time'],
}

function employmentScore(job: Job, params: JobSearchParams): number {
  const requested = (params.employmentType ?? '').toLowerCase()
  const have = (job.employmentType ?? '').toLowerCase()
  if (!requested) return have ? 0.8 : 0.5
  if (!have) return 0.6 // unknown passes with a mild penalty
  if (have.includes(requested) || requested.includes(have)) return 1
  for (const [type, opposites] of Object.entries(EMPLOYMENT_CONFLICT)) {
    if (requested.includes(type) && opposites.some((o) => have.includes(o))) return 0.2
  }
  return 0.6
}

/** Whole days between posting and now (0 when the date is unusable). */
export function postedAgeDays(postedAt: string | undefined): number {
  if (!postedAt) return 0
  const t = Date.parse(postedAt)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (Date.now() - t) / 86_400_000)
}

function freshnessScore(job: Job): number {
  const ageDays = postedAgeDays(job.postedAt)
  if (ageDays === 0) return 0.5 // unknown posting date stays neutral
  if (ageDays <= 3) return 1
  if (ageDays <= 7) return 0.85
  if (ageDays <= 14) return 0.65
  if (ageDays <= 30) return 0.45
  if (ageDays <= 60) return 0.25
  return 0.1
}

function skillGaps(job: Job, cv: CvProfile): { matched: string[]; missing: string[] } {
  const cvSet = new Set(cv.skills.map(slugify))
  const listed = job.skills ?? []
  const matched = listed.filter((s) => cvSet.has(slugify(s)))
  const missing = listed.filter((s) => !cvSet.has(slugify(s))).slice(0, 4)
  if (matched.length === 0 && cv.skills.length > 0) {
    const text = slugify(job.description ?? '')
    const implied = cv.skills.filter((s) => text.includes(slugify(s))).slice(0, 4)
    if (implied.length > 0) return { matched: implied, missing }
  }
  return { matched: matched.slice(0, 4), missing }
}

function buildStrengths(job: Job, cv: CvProfile, b: ScoreBreakdown): string[] {
  const strengths: string[] = []
  if (b.role >= 0.9) strengths.push(`Strong title match for "${cv.primaryRole}"`)
  if (b.remote === 1 && job.remote) strengths.push('Remote role — matches your setup')
  if (b.salary === 1 && job.salary?.normalizable) strengths.push('Salary range is published')
  if (b.location >= 0.7) strengths.push('Location aligns with your preferences')
  if (b.freshness >= 0.85) strengths.push('Recently posted — likely still open')
  if (strengths.length === 0) strengths.push('Relevant role based on your profile')
  return strengths.slice(0, 3)
}

function buildGaps(job: Job, missing: string[], b: ScoreBreakdown): string[] {
  const gaps: string[] = []
  for (const skill of missing) gaps.push(`Missing ${skill}`)
  if (b.seniority <= 0.7) gaps.push('Possible seniority gap')
  if (b.location <= 0.4) gaps.push('Location may not fit')
  if (b.employment <= 0.3) gaps.push('Employment type may not match')
  if (b.freshness <= 0.45) gaps.push('Posted a while ago — may already be filled')
  if (gaps.length === 0) gaps.push('No notable gaps found')
  return gaps.slice(0, 3)
}

function summarize(job: Job, cv: CvProfile, score: number, matchedCount: number): string {
  const parts: string[] = []
  parts.push(`${job.title} at ${job.company}`)
  if (job.remote) parts.push('fully remote')
  else if (job.location) parts.push(`based in ${job.location}`)
  if (matchedCount > 0) parts.push(`matches ${matchedCount} of your skills`)
  if (job.salary?.normalizable && job.salary.min) parts.push('with a published salary range')
  if (job.postedAt) {
    const ageDays = postedAgeDays(job.postedAt)
    if (ageDays > 0 && ageDays <= 7) parts.push('posted recently')
    else if (ageDays > 30) parts.push('listed over a month ago')
  }
  return `${parts.join(', ')}. Estimated ${score}% fit for a ${cv.primaryRole}.`
}