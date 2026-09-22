/**
 * Arbeitnow provider adapter (https://www.arbeitnow.com).
 *
 * Free EU-focused job board API, no credentials. Response: `{ data: [...] }`.
 * No salary data available, but includes remote flag, tags and job types.
 */

import type { Job, JobSearchParams } from '../types'
import { defineProvider, encodeQueryPairs } from './base'
import { makeJob } from '../normalize'

function buildUrl(params: JobSearchParams, page: number): string {
  const query = encodeQueryPairs({
    page,
    remote: params.remote === true || params.hybrid === true ? true : undefined,
    search: params.query || undefined,
  })
  return `https://www.arbeitnow.com/api/job-board-api?${query}`
}

interface ArbeitnowRaw {
  data?: Array<Record<string, unknown>>
}

function parseResponse(raw: unknown): Job[] {
  const body = raw as ArbeitnowRaw
  const records = Array.isArray(body?.data) ? body.data : []
  const jobs: Job[] = []
  for (const r of records) {
    const job = makeJob({
      source: 'arbeitnow',
      sourceJobId: r.slug,
      title: r.title,
      company: r.company_name,
      locationRaw: r.location,
      locationExtra: { remote: r.remote === true },
      employmentType: Array.isArray(r.job_types) ? (r.job_types as unknown[])[0] : undefined,
      seniority: r.seniority,
      skills: r.tags,
      categories: r.category,
      description: r.description,
      postedAt: r.created_at,
      applyUrl: r.url,
      sourceUrl: r.url,
    })
    if (job) jobs.push(job)
  }
  return jobs
}

export const arbeitnow = defineProvider({
  source: 'arbeitnow',
  requiresCredentials: false,
  isConfigured: () => true,
  buildUrl,
  parseResponse,
})