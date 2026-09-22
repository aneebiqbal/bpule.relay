/**
 * RemoteOK provider adapter (https://remoteok.com).
 *
 * Free public API, no credentials. Returns an ARRAY where the first element
 * is a metadata object (skipped) and the rest are job postings.
 * All salaries are USD when present.
 */

import type { Job, JobSearchParams } from '../types'
import { defineProvider } from './base'
import { makeJob } from '../normalize'

function buildUrl(params: JobSearchParams): string {
  const raw = params.skills?.[0] ?? params.query
  // RemoteOK's `tag` matches exact single-word tags only; free-text queries
  // fall back to the full feed and rely on the engine's relevance filter.
  const tag = raw && !/\s/u.test(raw) ? raw : undefined
  return `https://remoteok.com/api${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`
}

function parseResponse(raw: unknown): Job[] {
  const records = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []
  const jobs: Job[] = []
  for (const r of records) {
    // Skip the informational first element and any object without job fields.
    if (!r.position || (r.slug === 'jobs' && !r.id)) continue
    const id = r.id ?? r.slug
    const job = makeJob({
      source: 'remoteok',
      sourceJobId: id,
      title: r.position,
      company: r.company,
      companyLogo: r.company_logo,
      locationRaw: r.location,
      locationExtra: { remote: true },
      salaryRaw: {
        min: typeof r.salary_min === 'number' ? r.salary_min : undefined,
        max: typeof r.salary_max === 'number' ? r.salary_max : undefined,
        currency: 'USD',
        period: 'year',
        raw: typeof r.salary === 'string' && r.salary.trim() ? r.salary : undefined,
      },
      description: r.description,
      skills: r.tags,
      postedAt: r.date,
      applyUrl: r.apply_url ?? r.url,
      sourceUrl: r.url,
    })
    if (job) jobs.push(job)
  }
  return jobs
}

export const remoteok = defineProvider({
  source: 'remoteok',
  requiresCredentials: false,
  isConfigured: () => true,
  buildUrl,
  parseResponse,
  paginates: false,
})