/**
 * Find Jobs — public engine entry point.
 *
 * Full pipeline: build CV/query -> parallel provider search -> dedupe ->
 * hard filters -> deterministic scoring -> optional AI refinement -> rank.
 * Used by the API route and directly by tests.
 */

import type {
  CvProfile,
  ExtractedCv,
  GeneratedQuery,
  Job,
  JobSearchParamsInput,
  JobSearchResponse,
  JobSource,
  JobWithMatch,
} from './types'
import { aiMatchingEnabled, resultLimit, mockProvidersEnabled } from './config'
import { searchAllProviders } from './aggregate'
import { deduplicateJobs } from './deduplicate'
import { applyHardFilters } from './filters'
import { buildCvProfile, buildSearchParams, deriveQuerySet, generateQuery, looksLikeJobRole, roleFromSkills } from './search-query'
import type { ProfileLike } from './search-query'
import { scoreJob } from './rank-jobs'
import { matchWithAi } from './match'

export interface SearchEngineOptions {
  profile?: ProfileLike | null
  proofTags?: string[]
  /** A parsed uploaded CV — takes precedence over `profile`/`proofTags`. */
  cv?: ExtractedCv | null
  fetchFn?: typeof fetch
  timeoutMs?: number
  mock?: boolean
  aiEnabled?: boolean
}

export { buildCvProfile, buildSearchParams, deriveQuerySet, generateQuery, looksLikeJobRole, roleFromSkills, estimateSeniority } from './search-query'
export type { ProfileLike } from './search-query'
export { searchAllProviders } from './aggregate'
export type { SearchAllResult } from './aggregate'
export { matchWithAi, combineScores } from './match'
export type { MatchResult } from './match'
export { allProviders, providerFor } from './providers'
export type { JobProvider, ProviderCallOptions, ProviderSearchResult, ProviderMeta } from './provider-types'
export * from './types'
export * from './salary'
export * from './location'
export * from './normalize'
export * from './deduplicate'
export * from './filters'
export * from './rank-jobs'
export * from './attribution'
export { ProviderFailure, JOB_SOURCES } from './types'

/**
 * Run one complete job search. Production default: respects env config; tests
 * and demo mode pass explicit overrides in `options`.
 */
export async function searchJobs(
  input: JobSearchParamsInput,
  options: SearchEngineOptions = {},
): Promise<JobSearchResponse> {
  const startedAt = performance.now()

  const cv = options.cv
    ? fromExtractedCv(options.cv)
    : options.profile
      ? buildCvProfile(options.profile, options.proofTags ?? [])
      : buildCvProfile(null, input.skills ?? [])

  const params = buildSearchParams(input, cv)
  const limit = params.limit ?? resultLimit()
  const mock = options.mock === true || input.mock === true || mockProvidersEnabled()

  const providerOpts = {
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs,
    mock,
  }
  const querySet = mock ? undefined : deriveQuerySet(cv, input.role ?? input.query)
  const { jobs: rawJobs, sources, totalRaw } = await searchAllProviders(params, {
    ...providerOpts,
    queries: querySet,
  })

  const deduped = deduplicateJobs(rawJobs)
  const filtered = applyHardFilters(deduped.jobs, params)

  const scored: JobWithMatch[] = filtered.jobs.map((job) => ({ ...job, match: scoreJob(job, cv, params) }))

  const aiEnabled = (input.aiMatching ?? options.aiEnabled) !== false && aiMatchingEnabled()
  const matched = aiEnabled ? await matchWithAi(scored, cv) : { jobs: scored, aiUsed: false }

  const ranked = matched.jobs
    .sort(
      (a, b) =>
        b.match.score - a.match.score ||
        (b.match.breakdown.freshness ?? 0) - (a.match.breakdown.freshness ?? 0) ||
        (b.postedAt ?? '').localeCompare(a.postedAt ?? ''),
    )
    .slice(0, limit)

  // Per-source progress through the pipeline stages (used by the UI and the
  // final report: raw -> unique -> filtered -> final).
  const sourceGroups = (jobs: Job[]) => {
    const bySource = new Map<JobSource, number>()
    for (const job of jobs) bySource.set(job.source, (bySource.get(job.source) ?? 0) + 1)
    return bySource
  }
  const uniqueBySource = sourceGroups(deduped.jobs)
  const filteredBySource = sourceGroups(filtered.jobs)
  const finalBySource = sourceGroups(ranked)
  for (const [id, health] of Object.entries(sources)) {
    const source = id as JobSource
    health.unique = uniqueBySource.get(source) ?? 0
    health.filtered = filteredBySource.get(source) ?? 0
    health.final = finalBySource.get(source) ?? 0
  }

  const generatedQuery: GeneratedQuery = generateQuery(cv, input.role ?? input.query)

  return {
    jobs: ranked,
    sources,
    meta: {
      totalRaw,
      afterDedupe: deduped.jobs.length,
      afterFilters: filtered.jobs.length,
      dedupeRemoved: deduped.stats.removed,
      filteredRemoved: filtered.stats.removed,
      elapsedMs: Math.round(performance.now() - startedAt),
      mock,
      cvUsed: cv,
      aiMatchingUsed: matched.aiUsed,
      generatedQuery,
      queriesUsed: querySet ?? [params.query],
    },
  }
}

function fromExtractedCv(cv: ExtractedCv): CvProfile {
  const primaryRole = looksLikeJobRole(cv.role)
    ? (cv.role ?? '').trim()
    : roleFromSkills(cv.skills ?? []) ?? 'software engineer'
  return {
    primaryRole,
    alternativeRoles: [],
    skills: Array.from(new Set([...(cv.skills ?? []), ...(cv.technologies ?? [])])).slice(0, 20),
    seniority: cv.seniority,
    summary: cv.summary,
    sourceLabel: cv.sourceLabel ?? 'uploaded-cv',
    previousRoles: cv.previousRoles,
    education: cv.education,
    industries: cv.industries,
    workAuth: cv.workAuth,
    preferredJobTypes: cv.preferredJobTypes,
  }
}