/**
 * Jobicy provider adapter (https://jobicy.com).
 *
 * Free remote-jobs API, no credentials. Response: `{ jobs, jobCount }`.
 * Jobs carry explicit annual salary min/max plus a currency code.
 */

import type { Job, JobSearchParams } from '../types'
import { defineProvider, encodeQueryPairs } from './base'
import { makeJob } from '../normalize'

function buildUrl(params: JobSearchParams): string {
  const tag = params.skills?.[0] ?? params.query
  const query = encodeQueryPairs({
    count: 50,
    tag: tag || undefined,
  })
  return `https://jobicy.com/api/v2/remote-jobs?${query}`
}

interface JobicyRaw {
  jobs?: Array<Record<string, unknown>>
  jobCount?: unknown
}

function parseResponse(raw: unknown): Job[] {
  const body = raw as JobicyRaw
  const records = Array.isArray(body?.jobs) ? body.jobs : []
  const jobs: Job[] = []
  for (const r of records) {
    const job = makeJob({
      source: 'jobicy',
      sourceJobId: r.id,
      title: r.jobTitle,
      company: r.companyName,
      companyLogo: r.companyLogo,
      locationRaw: r.jobGeo,
      locationExtra: { remote: true },
      employmentType: r.jobType,
      seniority: r.jobLevel,
      salaryRaw: {
        min: r.annualSalaryMin,
        max: r.annualSalaryMax,
        currency: r.salaryCurrency,
        period: 'year',
      },
      description: r.jobDescription,
      excerpt: r.jobExcerpt,
      categories: r.jobIndustry,
      postedAt: r.pubDate,
      applyUrl: r.url,
      sourceUrl: r.url,
    })
    if (job) jobs.push(job)
  }
  return jobs
}

export const jobicy = defineProvider({
  source: 'jobicy',
  requiresCredentials: false,
  isConfigured: () => true,
  buildUrl,
  parseResponse,
  paginates: false,
})