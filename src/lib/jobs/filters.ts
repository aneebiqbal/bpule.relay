/**
 * Find Jobs — hard, deterministic filtering.
 *
 * Runs BEFORE any expensive AI matching. Only clearly incompatible jobs are
 * removed here; ambiguous values (unknown salary, missing employment type)
 * always pass through rather than being dropped on a guess.
 */

import type { Job, JobSearchParams } from './types'
import { salaryMeetsMinimum } from './salary'
import { detectCountry, locationMatches } from './location'
import { maxAgeDays } from './config'

export type WorkPreference = 'remote' | 'remote_hybrid' | 'onsite' | 'any'

export function workPreferenceFromParams(params: JobSearchParams): WorkPreference {
  if (params.remote === true && params.hybrid !== true && params.onsite !== true) return 'remote'
  if (params.remote === true && params.hybrid === true) return 'remote_hybrid'
  if (params.onsite === true && params.remote !== true && params.hybrid !== true) return 'onsite'
  return 'any'
}

export interface FilterStats {
  input: number
  output: number
  removed: number
}

export function applyHardFilters(
  jobs: Job[],
  params: JobSearchParams,
): { jobs: Job[]; stats: FilterStats } {
  const preference = workPreferenceFromParams(params)
  const countryTarget = params.country ? detectCountry(params.country) ?? undefined : undefined
  const queryTokens = queryTokensFor(params)
  const now = new Date()

  const kept: Job[] = []
  for (const job of jobs) {
    if (!passesWorkPreference(job, preference)) continue
    if (!passesLocation(job, params.location, countryTarget)) continue
    if (!passesSalary(job, params)) continue
    if (!passesEmploymentType(job, params.employmentType)) continue
    if (!passesSeniority(job, params.seniority)) continue
    if (!passesQueryRelevance(job, queryTokens)) continue
    if (!passesActiveFreshness(job, now)) continue
    kept.push(job)
  }

  const removed = jobs.length - kept.length
  return { jobs: kept, stats: { input: jobs.length, output: kept.length, removed } }
}

function passesWorkPreference(job: Job, preference: WorkPreference): boolean {
  switch (preference) {
    case 'remote':
      return job.remote || job.hybrid === true
    case 'remote_hybrid':
      return job.remote || job.hybrid
    case 'onsite':
      return job.onsite && !job.remote
    case 'any':
    default:
      return true
  }
}

function passesLocation(job: Job, location: string | undefined, countryTarget: string | undefined): boolean {
  if (countryTarget && job.country) {
    if (!locationMatches(job.country, countryTarget)) return false
  }
  if (location) {
    // A remote job tagged worldwide still matches a location preference only
    // when the location preference is a country that accepts remote candidates.
    if (job.remote && !job.location.toLowerCase().includes('remote')) {
      // treat as location-unknown -> pass (unknown passes)
      return true
    }
    if (!locationMatches(job.location, location)) return false
  }
  return true
}

function passesSalary(job: Job, params: JobSearchParams): boolean {
  if (params.minimumSalary === undefined || params.minimumSalary <= 0) return true
  const result = salaryMeetsMinimum(job.salary, params.minimumSalary, params.salaryCurrency)
  // Unknown currency or unknown salary -> keep; we never kill a job on a guess.
  return result !== false
}

const EMPLOYMENT_NORMALIZE: Record<string, string> = {
  fulltime: 'full-time',
  parttime: 'part-time',
  contract: 'contract',
  freelance: 'contract',
  permanent: 'full-time',
  internship: 'internship',
  '0-3years': 'full-time',
}

function employmentTokens(value: string | undefined): string[] {
  if (!value) return []
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => EMPLOYMENT_NORMALIZE[t] ?? t)
}

function passesEmploymentType(job: Job, requested: string | undefined): boolean {
  if (!requested) return true
  const want = employmentTokens(requested)
  if (want.length === 0) return true
  const have = employmentTokens(job.employmentType)
  if (have.length === 0) return true // unknown passes
  // Strong conflict check: explicit opposite types.
  const oppositeMap: Record<string, string[]> = {
    'full-time': ['part-time'],
    'part-time': ['full-time'],
    'contract': ['permanent'],
    'permanent': ['contract'],
    'internship': ['full-time', 'part-time'],
  }
  for (const token of want) {
    const opposites = oppositeMap[token]
    if (opposites && have.some((h) => opposites.includes(h))) return false
    if (have.includes(token)) return true
  }
  return true
}

const SENIORITY_ORDER = ['internship', 'entry-level', 'junior', 'mid-level', 'senior', 'lead', 'principal', 'manager', 'director', 'executive']

function seniorityRank(value: string | undefined): number {
  if (!value) return -1
  const normalized = value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const idx = SENIORITY_ORDER.indexOf(normalized)
  if (idx >= 0) return idx
  for (let i = 0; i < SENIORITY_ORDER.length; i++) {
    if (normalized.includes(SENIORITY_ORDER[i])) return i
  }
  return -1
}

function passesSeniority(job: Job, requested: string | undefined): boolean {
  if (!requested) return true
  const want = seniorityRank(requested)
  if (want < 0) return true
  const haveRank = seniorityRank(job.seniority)
  if (haveRank < 0) return true // unknown passes
  // Only remove when the gap is clearly adverse (junior asked for senior work).
  if (want >= 3 && haveRank < 2) return false
  if (want <= 1 && haveRank >= 5) return false
  return true
}

export interface QueryTokens {
  primary: string[]
  alternatives: string[]
}

export function queryTokensFor(params: JobSearchParams): QueryTokens {
  const tokenize = (value: string | undefined): string[] =>
    (value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1)
  return {
    primary: tokenize(params.query),
    alternatives: (params.alternativeQueries ?? []).flatMap(tokenize),
  }
}

export function passesQueryRelevance(job: Job, tokens: QueryTokens): boolean {
  if (tokens.primary.length === 0 && tokens.alternatives.length === 0) return true
  const haystack = ` ${[job.title, job.company, job.description ?? ''].join(' ').toLowerCase()} `
  // Keep broad: any single primary or alternative-query token is enough to
  // pass, so retrieval stays wide and ranking precision does the narrowing.
  return (
    tokens.primary.some((t) => haystack.includes(t)) ||
    tokens.alternatives.some((t) => haystack.includes(t))
  )
}

/**
 * Removes jobs that are no longer live: an expiry date in the past always
 * drops a job, and a posting older than the configured max age (only when the
 * date is reliable) is excluded. Unknown dates pass — they are handled by the
 * freshness weight at ranking time, not dropped on a guess.
 */
export function passesActiveFreshness(job: Job, now: Date = new Date()): boolean {
  if (job.expiresAt) {
    const expires = Date.parse(job.expiresAt)
    if (Number.isFinite(expires) && expires <= now.getTime()) return false
  }
  const maxAge = maxAgeDays()
  if (maxAge > 0 && job.postedAt) {
    const posted = Date.parse(job.postedAt)
    if (Number.isFinite(posted)) {
      const ageDays = (now.getTime() - posted) / 86_400_000
      if (ageDays > maxAge) return false
    }
  }
  return true
}