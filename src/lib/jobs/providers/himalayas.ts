/**
 * Himalayas provider adapter (https://himalayas.app).
 *
 * Remote-tech job board with a free public API. No credentials required.
 * Response shape: `{ jobs, total }`, each job is flat.
 */

import type { Job, JobSearchParams, SalaryPeriod } from '../types'
import { defineProvider, encodeQueryPairs } from './base'
import { makeJob, asString, stringArray } from '../normalize'

function buildUrl(params: JobSearchParams, page: number): string {
  const query = encodeQueryPairs({
    query: params.query || undefined,
    limit: 100,
    page,
    remoteMode: params.remote === true || params.hybrid === true ? true : undefined,
    minSalary: params.minimumSalary && params.salaryCurrency === 'USD' ? params.minimumSalary : undefined,
  })
  return `https://himalayas.app/jobs/api?${query}`
}

interface HimalayasRaw {
  jobs?: Array<Record<string, unknown>>
}

/** Himalayas is a remote-first board; posts list timezone or "remote"-word restrictions. */
function himalayasRemote(r: Record<string, unknown>): boolean {
  if (Array.isArray(r.timezoneRestrictions) && r.timezoneRestrictions.length > 0) return true
  return stringArray(r.locationRestrictions).some((l) => /remote|worldwide|anywhere/i.test(l))
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) ? asString(value[0]) : asString(value)
}

const SALARY_PERIODS: Record<string, SalaryPeriod> = {
  annual: 'year',
  yearly: 'year',
  year: 'year',
  monthly: 'month',
  month: 'month',
  weekly: 'week',
  week: 'week',
  daily: 'day',
  day: 'day',
  hourly: 'hour',
  hour: 'hour',
}

function mapSalaryPeriod(value: unknown): SalaryPeriod | undefined {
  const s = asString(value)
  return s ? SALARY_PERIODS[s.toLowerCase()] : undefined
}

function parseResponse(raw: unknown): Job[] {
  const body = raw as HimalayasRaw
  const records = Array.isArray(body?.jobs) ? body.jobs : []
  const jobs: Job[] = []
  for (const r of records) {
    const locations = stringArray(r.locationRestrictions)
    const job = makeJob({
      source: 'himalayas',
      sourceJobId: r.guid ?? r.id,
      title: r.title,
      company: r.companyName,
      companyLogo: r.companyLogo,
      locationRaw: locations,
      locations,
      locationExtra: { remote: himalayasRemote(r) },
      salaryRaw: {
        min: r.minSalary,
        max: r.maxSalary,
        currency: r.currency,
        period: mapSalaryPeriod(r.salaryPeriod),
      },
      description: r.description,
      excerpt: r.excerpt,
      employmentType: r.employmentType,
      seniority: firstString(r.seniority),
      skills: stringArray(r.categories),
      categories: stringArray(r.parentCategories ?? r.categories),
      postedAt: r.pubDate,
      applyUrl: r.applicationLink ?? r.guid,
      sourceUrl: r.guid,
    })
    if (job) jobs.push(job)
  }
  return jobs
}

export const himalayas = defineProvider({
  source: 'himalayas',
  requiresCredentials: false,
  isConfigured: () => true,
  buildUrl,
  parseResponse,
})