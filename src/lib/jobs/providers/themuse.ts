/**
 * The Muse provider adapter (https://www.themuse.com).
 *
 * Public API requiring a free API key (Authorization: Bearer). Response:
 * `{ page, page_count, results: [...] }`. Locations and levels arrive as
 * arrays of objects.
 */

import type { Job, JobSearchParams } from '../types'
import { themuseApiKey } from '../config'
import { defineProvider, encodeQueryPairs } from './base'
import { makeJob } from '../normalize'
import { isConcretePlace } from '../location'

function buildUrl(params: JobSearchParams, page: number): string {
  const query = encodeQueryPairs({
    page,
    descending: true,
    title: params.query || params.skills?.[0] || undefined,
    location: isConcretePlace(params.location) ? params.location : undefined,
  })
  return `https://www.themuse.com/api/public/jobs?${query}`
}

function buildHeaders(): Record<string, string> {
  const key = themuseApiKey()
  return key ? { Authorization: `Bearer ${key}` } : {}
}

interface MuseRaw {
  results?: Array<Record<string, unknown>>
}

function parseResponse(raw: unknown): Job[] {
  const body = raw as MuseRaw
  const records = Array.isArray(body?.results) ? body.results : []
  const jobs: Job[] = []
  for (const r of records) {
    const company = (r.company as Record<string, unknown> | undefined)?.name
    const locations = Array.isArray(r.locations) ? (r.locations as Array<Record<string, unknown>>).map((l) => l.name).filter(Boolean) : []
    const levels = Array.isArray(r.levels) ? (r.levels as Array<Record<string, unknown>>).map((l) => l.name).filter(Boolean) : []
    const types = Array.isArray(r.type) ? (r.type as Array<Record<string, unknown>>).map((t) => t.name).filter(Boolean) : []
    const refs = (r.refs as Record<string, unknown> | undefined) ?? {}
    const job = makeJob({
      source: 'themuse',
      sourceJobId: r.id,
      title: r.name,
      company,
      companyLogo: (refs.logo_image as string | undefined) ?? undefined,
      locationRaw: locations,
      locations,
      seniority: levels[0] as string,
      employmentType: types[0] as string,
      salaryRaw: r.salary,
      description: r.contents,
      categories: Array.isArray(r.categories) ? (r.categories as Array<Record<string, unknown>>).map((c) => c.name) : undefined,
      postedAt: r.publication_date,
      applyUrl: refs.landing_page,
      sourceUrl: refs.landing_page,
    })
    if (job) jobs.push(job)
  }
  return jobs
}

export const themuse = defineProvider({
  source: 'themuse',
  requiresCredentials: true,
  isConfigured: () => Boolean(themuseApiKey()),
  buildUrl,
  buildHeaders,
  parseResponse,
})