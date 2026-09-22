/**
 * Find Jobs — environment configuration.
 *
 * All provider credentials, timeouts and feature flags for the jobs engine
 * are resolved here, never hardcoded in an adapter. Secrets are read
 * server-side only; nothing here is exposed to the client bundle.
 */

import type { JobSource } from './types'

/** Credential accessors — server-only. */
export function adzunaCredentials(): { appId?: string; appKey?: string } {
  return {
    appId: process.env.ADZUNA_APP_ID || undefined,
    appKey: process.env.ADZUNA_APP_KEY || undefined,
  }
}

export function themuseApiKey(): string | undefined {
  return process.env.THE_MUSE_API_KEY || undefined
}

export function usajobsCredentials(): { apiKey?: string; userAgent?: string } {
  return {
    apiKey: process.env.USAJOBS_API_KEY || undefined,
    userAgent: process.env.USAJOBS_USER_AGENT || undefined,
  }
}

/** AI matching uses the project's central AI runtime; it is on by default. */
export function aiMatchingEnabled(): boolean {
  return process.env.JOBS_AI_MATCHING !== 'false'
}

/** Per-provider HTTP timeout in milliseconds. */
export function providerTimeoutMs(): number {
  const raw = Number(process.env.JOBS_API_TIMEOUT_MS ?? '8000')
  return Number.isFinite(raw) && raw > 0 ? raw : 8000
}

/** Max raw jobs to feed the AI matcher after hard filtering. */
export function aiMatchCandidateCap(): number {
  const raw = Number(process.env.JOBS_AI_CANDIDATE_CAP ?? '50')
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 50
}

/** Results returned to the user after ranking. */
export function resultLimit(): number {
  const raw = Number(process.env.JOBS_RESULT_LIMIT ?? '100')
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 200) : 100
}

/**
 * Hard cut-off for listing age in days (JOBS_MAX_AGE_DAYS, default 90).
 * Jobs with a reliable postedAt older than this are excluded before ranking.
 * `0` disables the cut-off entirely; unknown posting dates always pass.
 */
export function maxAgeDays(): number {
  const raw = Number(process.env.JOBS_MAX_AGE_DAYS ?? '90')
  if (!Number.isFinite(raw) || raw < 0) return 90
  if (raw === 0) return 0
  return Math.round(raw)
}

/**
 * Max number of distinct search queries issued per provider (JOBS_QUERY_LIMIT,
 * default 6). Credentialed providers still get exactly one query to respect
 * their rate limits; only credential-free boards fan out.
 */
export function queryFanOutLimit(): number {
  const raw = Number(process.env.JOBS_QUERY_LIMIT ?? '6')
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 8) : 6
}

/**
 * Max HTTP search pages fetched per provider query (JOBS_MAX_PAGES_PER_QUERY,
 * default 3). Page-based providers stop earlier on empty or repeated pages.
 */
export function providerMaxPages(): number {
  const raw = Number(process.env.JOBS_MAX_PAGES_PER_QUERY ?? '3')
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 5) : 3
}

/**
 * Soft cap on raw listings kept per provider across all queries
 * (JOBS_MAX_PER_PROVIDER, default 200). Retrieval stays broad but controlled;
 * later queries for a provider stop once the cap is reached.
 */
export function maxJobsPerProvider(): number {
  const raw = Number(process.env.JOBS_MAX_PER_PROVIDER ?? '200')
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 400) : 200
}

/**
 * Mock provider mode.
 *
 * Enabled with JOBS_USE_MOCK_PROVIDERS=true. Never active in production: a
 * flag left on in a deployed environment is a deployment error, so we refuse
 * rather than silently serving fake data.
 */
export function mockProvidersEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.JOBS_USE_MOCK_PROVIDERS === '1' || process.env.JOBS_USE_MOCK_PROVIDERS === 'true'
}

/**
 * Failure injection for local verification (dev only, mock mode only).
 *
 * Format: comma-separated list of `source:kind`, e.g.
 *   JOBS_FAILURE_INJECTION=himalayas:timeout,remoteok:rate_limited,jobicy:invalid_response,themuse:unavailable,usajobs:unauthorized
 */
export function failureInjection(): Record<JobSource, string> {
  const raw = process.env.JOBS_FAILURE_INJECTION || ''
  const map = {} as Record<JobSource, string>
  for (const part of raw.split(',')) {
    const [source, kind] = part.trim().split(':')
    if (source && kind) map[source as JobSource] = kind.trim()
  }
  return map
}

/** Listing of the providers that need no API key (for docs/UX). */
export const CREDENTIAL_FREE_SOURCES: readonly JobSource[] = [
  'himalayas',
  'remoteok',
  'jobicy',
  'remotive',
  'arbeitnow',
]