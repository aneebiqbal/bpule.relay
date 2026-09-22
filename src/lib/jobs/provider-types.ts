/**
 * Find Jobs — provider abstraction.
 *
 * Every external job source implements the same contract: build a
 * provider-specific query, make the request, parse the response into the
 * shared Job type, and never throw an untyped error. The aggregator runs all
 * providers concurrently and isolates failures per source.
 */

import type { Job, JobSearchParams, ProviderFailureKind, ProviderStatus, JobSource } from './types'
import { providerName } from './attribution'

export interface ProviderMeta {
  id: JobSource
  name: string
  requiresCredentials: boolean
  /** Whether the credentials this provider needs are present in the environment. */
  configured: boolean
}

export interface ProviderCallOptions {
  /** Injectable fetch implementation (tests inject failures here). */
  fetchFn?: typeof fetch
  timeoutMs?: number
  /** Force mock mode for this call (tests and demo mode); defaults to env. */
  mock?: boolean
}

export interface ProviderSearchResult {
  jobs: Job[]
  rawCount: number
  mock: boolean
  durationMs: number
  /** HTTP pages fetched for this query (1 when the provider has no pagination). */
  pagesFetched: number
}

export interface JobProvider {
  meta: ProviderMeta
  search(params: JobSearchParams, opts?: ProviderCallOptions): Promise<ProviderSearchResult>
  /** Pure parser of a provider-shaped JSON body — used directly by tests and mock mode. */
  parseResponse(raw: unknown, params: JobSearchParams): Job[]
  /** The provider-specific request URL for a search (used by smoke tests). */
  buildUrl(params: JobSearchParams, page?: number): string
}

export interface ProviderOutcome {
  status: ProviderStatus
  count: number
  mock: boolean
  errorKind?: string | null
}

export type ProviderOutcomeLike = ProviderOutcome

export const STATUS_LABEL: Record<ProviderStatus, string> = {
  success: 'success',
  failed: 'failed',
  rate_limited: 'rate_limited',
  unauthorized: 'unauthorized',
  timeout: 'timeout',
  unavailable: 'unavailable',
  invalid_response: 'invalid_response',
  not_configured: 'not_configured',
}

export { providerName }

export type { ProviderFailureKind }