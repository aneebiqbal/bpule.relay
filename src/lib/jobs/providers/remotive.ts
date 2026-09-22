/**
 * Remotive provider adapter (https://remotive.io).
 *
 * Free remote-jobs API, no credentials. Response: `{ jobs: [...] }`.
 * Salaries arrive as loose strings such as "$100k - $150k" (USD).
 */

import type { Job, JobSearchParams } from '../types'
import { defineProvider } from './base'
import { makeJob } from '../normalize'

function buildUrl(params: JobSearchParams): string {
  const search = params.query || params.skills?.[0]
  const base = 'https://remotive.com/api/remote-jobs'
  if (!search) return `${base}?limit=50`
  return `${base}?search=${encodeURIComponent(search)}&limit=50`
}

interface RemotiveRaw {
  jobs?: Array<Record<string, unknown>>
}

function parseResponse(raw: unknown): Job[] {
  const body = raw as RemotiveRaw
  const records = Array.isArray(body?.jobs) ? body.jobs : []
  const jobs: Job[] = []
  for (const r of records) {
    const job = makeJob({
      source: 'remotive',
      sourceJobId: r.id,
      title: r.title,
      company: r.company_name,
      locationRaw: r.candidate_required_location,
      locationExtra: { remote: true },
      employmentType: r.job_type ? String(r.job_type).replace(/_/g, '-') : undefined,
      salaryRaw: r.salary,
      description: r.description,
      skills: r.tags,
      categories: r.category,
      postedAt: r.publication_date,
      applyUrl: r.url,
      sourceUrl: r.url,
    })
    if (job) jobs.push(job)
  }
  return jobs
}

export const remotive = defineProvider({
  source: 'remotive',
  requiresCredentials: false,
  isConfigured: () => true,
  buildUrl,
  parseResponse,
  paginates: false,
})