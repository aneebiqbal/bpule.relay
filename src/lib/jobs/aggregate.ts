/**
 * Find Jobs — provider aggregation.
 *
 * Runs every provider concurrently, isolates each query failure, and produces
 * the flattened job list plus a per-source health map. One broken provider or
 * one bad query never fails the whole search — partial results are kept and
 * degraded statuses reported instead.
 *
 * Retrieval is broad but controlled: credential-free boards fan out over the
 * derived query set (capped), feed-only boards (which ignore query text) and
 * credentialed boards fetch once, and no provider keeps more than a soft cap
 * of raw listings so the dedupe/filter/rank stages stay bounded.
 */

import type { Job, JobSearchParams, JobSource, ProviderFailure, SourceHealth } from './types'
import type { JobProvider, ProviderCallOptions } from './provider-types'
import { allProviders } from './providers'
import { mockProvidersEnabled, queryFanOutLimit, maxJobsPerProvider } from './config'

export interface SearchAllResult {
  jobs: Job[]
  sources: Record<JobSource, SourceHealth>
  totalRaw: number
}

/** Boards whose search endpoints ignore query text (tag/full-feed only). */
const FEED_ONLY_SOURCES = new Set<JobSource>(['remoteok', 'jobicy'])

function emptySources(): Record<JobSource, SourceHealth> {
  return {
    adzuna: { status: 'failed', count: 0, mock: false, errorKind: null },
    himalayas: { status: 'failed', count: 0, mock: false, errorKind: null },
    remoteok: { status: 'failed', count: 0, mock: false, errorKind: null },
    jobicy: { status: 'failed', count: 0, mock: false, errorKind: null },
    remotive: { status: 'failed', count: 0, mock: false, errorKind: null },
    arbeitnow: { status: 'failed', count: 0, mock: false, errorKind: null },
    themuse: { status: 'failed', count: 0, mock: false, errorKind: null },
    usajobs: { status: 'failed', count: 0, mock: false, errorKind: null },
  }
}

interface Fulfilled {
  provider: JobProvider
  health: SourceHealth
  jobs: Job[]
  rawCount: number
}

function queriesForProvider(
  provider: JobProvider,
  params: JobSearchParams,
  fanOutQueries: string[],
  fanOutLimit: number,
  mock: boolean,
): { queries: string[]; isFeedOnly: boolean } {
  const feedOnly = FEED_ONLY_SOURCES.has(provider.meta.id)
  if (mock || provider.meta.requiresCredentials || feedOnly || fanOutQueries.length === 0) {
    // Mock, credentialed and feed-only boards all get exactly one fetch.
    return { queries: [feedOnly ? params.query : params.query], isFeedOnly: feedOnly }
  }
  return { queries: fanOutQueries.slice(0, fanOutLimit), isFeedOnly: false }
}

export async function searchAllProviders(
  params: JobSearchParams,
  opts?: ProviderCallOptions & { mock?: boolean; queries?: string[] },
): Promise<SearchAllResult> {
  const sources = emptySources()
  const mock = opts?.mock === true || mockProvidersEnabled()
  const fanOutQueries = (opts?.queries ?? []).map((q) => q.trim()).filter(Boolean)
  const fanOutLimit = queryFanOutLimit()
  const jobCap = maxJobsPerProvider()

  const settled = await Promise.allSettled(
    allProviders.map(async (provider): Promise<Fulfilled> => {
      const health: SourceHealth = { status: 'failed', count: 0, mock, errorKind: null }
      if (!mock && provider.meta.requiresCredentials && !provider.meta.configured) {
        health.status = 'not_configured'
        return { provider, health, jobs: [], rawCount: 0 }
      }

      const { queries } = queriesForProvider(provider, params, fanOutQueries, fanOutLimit, mock)
      const jobs: Job[] = []
      let rawCount = 0
      let pages = 0
      let issued = 0
      let success = false
      let errorKind: ProviderFailure['kind'] | undefined

      const runQuery = async (query: string) => {
        issued++
        try {
          const result = await provider.search({ ...params, query }, opts)
          jobs.push(...result.jobs)
          rawCount += result.rawCount
          pages += result.pagesFetched
          success = true
        } catch (err) {
          const failure = err as Partial<ProviderFailure>
          errorKind = failure.kind ?? ('failed' as const)
        }
      }

      if (mock) {
        await runQuery(params.query)
      } else {
        for (const query of queries) {
          if (rawCount >= jobCap) break
          await runQuery(query)
        }
      }

      health.status = success ? 'success' : (errorKind ?? 'failed')
      health.errorKind = health.status === 'success' ? (errorKind ?? null) : health.status
      health.count = jobs.length
      health.raw = rawCount
      health.queries = mock ? 1 : (issued || queries.length)
      health.pages = mock ? 1 : pages
      return { provider, health, jobs, rawCount }
    }),
  )

  const jobs: Job[] = []
  let totalRaw = 0
  for (const item of settled) {
    if (item.status !== 'fulfilled') continue
    const { provider, health, jobs: providerJobs, rawCount } = item.value
    sources[provider.meta.id] = health
    jobs.push(...providerJobs)
    totalRaw += rawCount
  }

  return { jobs, sources, totalRaw }
}