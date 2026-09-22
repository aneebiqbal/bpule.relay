/**
 * USAJOBS provider adapter (https://developer.usajobs.gov/).
 *
 * US government job search. Requires a free API key sent in the
 * `Authorization-Key` header plus a `Host` and a descriptive `User-Agent`
 * (USAJOBS rejects requests without a real user agent). Response:
 * `SearchResult.SearchResultItems[]`.
 */

import type { Job, JobSearchParams } from '../types'
import { usajobsCredentials } from '../config'
import { defineProvider, encodeQueryPairs } from './base'
import { makeJob } from '../normalize'
import { isConcretePlace } from '../location'

function buildUrl(params: JobSearchParams, page: number): string {
  const query = encodeQueryPairs({
    Keyword: params.query || undefined,
    ResultsPerPage: 50,
    Page: page,
    RemoteIndicator: params.remote === true ? 'true' : undefined,
    LocationName: isConcretePlace(params.location) ? params.location : undefined,
  })
  return `https://data.usajobs.gov/api/search?${query}`
}

function buildHeaders(): Record<string, string> {
  const { apiKey, userAgent } = usajobsCredentials()
  const headers: Record<string, string> = { Host: 'data.usajobs.gov' }
  if (apiKey) headers['Authorization-Key'] = apiKey
  if (userAgent) headers['User-Agent'] = userAgent
  return headers
}

interface UsaJobsRaw {
  SearchResult?: {
    SearchResultItems?: Array<{
      MatchedObjectDescriptor?: Record<string, unknown>
    }>
  }
}

function parseResponse(raw: unknown): Job[] {
  const body = raw as UsaJobsRaw
  const items = body?.SearchResult?.SearchResultItems ?? []
  const jobs: Job[] = []
  for (const item of items) {
    const d = item.MatchedObjectDescriptor
    if (!d) continue

    const locationsRaw = Array.isArray(d.PositionLocation)
      ? (d.PositionLocation as Array<{ LocationName?: string; CountryCode?: string }>)
      : []
    const locationNames = locationsRaw.map((l) => l.LocationName).filter(Boolean) as string[]
    const salaryInfo = (Array.isArray(d.PositionSalary) ? (d.PositionSalary as Array<Record<string, unknown>>) : [])
      .map((s) => ({
        min: typeof s.MinimumRange === 'number' ? s.MinimumRange : s.Minimum ? Number(s.Minimum) : undefined,
        max: typeof s.MaximumRange === 'number' ? s.MaximumRange : s.Maximum ? Number(s.Maximum) : undefined,
      }))
      .find((s) => typeof s.min === 'number' || typeof s.max === 'number')

    const offeringTypes = Array.isArray(d.PositionOfferingType)
      ? (d.PositionOfferingType as Array<{ Name?: string }>).map((o) => o.Name).filter((n): n is string => Boolean(n))
      : []
    const remote = offeringTypes.some((n) => /remote/i.test(n))
    const hybrid = offeringTypes.some((n) => /hybrid/i.test(n))

    const job = makeJob({
      source: 'usajobs',
      sourceJobId: d.PositionID,
      title: d.PositionTitle,
      company: d.OrganizationName,
      locationRaw: locationNames,
      locations: locationNames,
      locationExtra: { remote, hybrid },
      salaryRaw: salaryInfo ? { min: salaryInfo.min, max: salaryInfo.max, currency: 'USD', period: 'year' } : undefined,
      seniority: seniorityFromGrades(d.LowGrade, d.HighGrade),
      description: (d.UserArea as Record<string, unknown> | undefined)?.Details
        ? ((d.UserArea as Record<string, { JobSummary?: string }>).Details?.JobSummary ?? undefined)
        : undefined,
      categories: Array.isArray(d.JobCategory)
        ? (d.JobCategory as Array<{ Name?: string }>).map((c) => c.Name)
        : undefined,
      postedAt: d.PublicationStartDate,
      expiresAt: d.ApplicationCloseDate,
      applyUrl: d.PositionURI,
      sourceUrl: d.PositionURI,
    })
    if (job) jobs.push(job)
  }
  return jobs
}

function seniorityFromGrades(low: unknown, high: unknown): string | undefined {
  const lowStr = typeof low === 'string' ? low : undefined
  const highStr = typeof high === 'string' ? high : undefined
  const grade = (lowStr ?? highStr ?? '').match(/GS-(\d+)/i)?.[1]
  if (!grade) return undefined
  const level = Number(grade)
  if (level <= 4) return 'entry-level'
  if (level <= 7) return 'junior'
  if (level <= 11) return 'mid-level'
  if (level <= 13) return 'senior'
  return 'lead'
}

export const usajobs = defineProvider({
  source: 'usajobs',
  requiresCredentials: true,
  isConfigured: () => Boolean(usajobsCredentials().apiKey && usajobsCredentials().userAgent),
  buildUrl,
  buildHeaders,
  parseResponse,
})