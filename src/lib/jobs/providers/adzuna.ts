/**
 * Adzuna provider adapter.
 *
 * Docs: https://developer.adzuna.com/ — requires app_id + app_key.
 * Country-scoped API (defaults to gb, maps known country names).
 */

import type { Job, JobSearchParams } from '../types'
import { adzunaCredentials } from '../config'
import { defineProvider, encodeQueryPairs } from './base'
import { makeJob } from '../normalize'
import { isConcretePlace } from '../location'

const ADZUNA_COUNTRIES = [
  'at', 'au', 'be', 'br', 'ca', 'ch', 'de', 'es', 'fr', 'gb', 'in',
  'it', 'mx', 'nl', 'nz', 'pl', 'sg', 'us', 'za', 'id', 'ie',
] as const

const COUNTRY_TO_ADZUNA: Record<string, (typeof ADZUNA_COUNTRIES)[number] | undefined> = {
  us: 'us',
  gb: 'gb',
  uk: 'gb',
  ie: 'ie',
  de: 'de',
  fr: 'fr',
  es: 'es',
  it: 'it',
  nl: 'nl',
  pl: 'pl',
  ca: 'ca',
  au: 'au',
  br: 'br',
  in: 'in',
  mx: 'mx',
  sg: 'sg',
  nz: 'nz',
  za: 'za',
  be: 'be',
  ch: 'ch',
  at: 'at',
}

const COUNTRY_CURRENCY: Record<string, string> = {
  us: 'USD',
  gb: 'GBP',
  uk: 'GBP',
  ie: 'EUR',
  de: 'EUR',
  fr: 'EUR',
  es: 'EUR',
  it: 'EUR',
  nl: 'EUR',
  pl: 'PLN',
  ca: 'CAD',
  au: 'AUD',
  br: 'BRL',
  in: 'INR',
  mx: 'MXN',
  sg: 'SGD',
  nz: 'NZD',
  za: 'ZAR',
  be: 'EUR',
  ch: 'CHF',
  at: 'EUR',
  id: 'IDR',
}

function adzunaCountry(params: JobSearchParams): string {
  const country = (params.country ?? '').toLowerCase()
  return COUNTRY_TO_ADZUNA[country] ?? (country.length === 2 && (ADZUNA_COUNTRIES as readonly string[]).includes(country) ? country : 'gb')
}

function buildUrl(params: JobSearchParams, page: number): string {
  const { appId, appKey } = adzunaCredentials()
  const base = 'https://api.adzuna.com/v1/api/jobs'
  const location = isConcretePlace(params.location) ? params.location : undefined
  const query = encodeQueryPairs({
    app_id: appId,
    app_key: appKey,
    results_per_page: 50,
    what: params.query || 'software engineer',
    where: location,
    salary_min: params.minimumSalary && params.salaryCurrency === 'USD' ? params.minimumSalary : undefined,
    full_time: params.employmentType && /full/gi.test(params.employmentType) ? '1' : undefined,
    part_time: params.employmentType && /part/gi.test(params.employmentType) ? '1' : undefined,
    contract: params.employmentType && /contract|free/gi.test(params.employmentType) ? '1' : undefined,
  })
  return `${base}/${adzunaCountry(params)}/search/${page}?${query}`
}

interface AdzunaRaw {
  results?: Array<Record<string, unknown>>
}

function parseResponse(raw: unknown, params: JobSearchParams): Job[] {
  const body = raw as AdzunaRaw
  const results = Array.isArray(body?.results) ? body.results : []
  const currency = COUNTRY_CURRENCY[adzunaCountry(params)] ?? 'GBP'
  const jobs: Job[] = []
  for (const r of results) {
    const company = (r.company as Record<string, unknown> | undefined)?.display_name
    const location = (r.location as Record<string, unknown> | undefined)?.display_name
    const job = makeJob({
      source: 'adzuna',
      sourceJobId: r.id,
      title: r.title,
      company,
      companyLogo: (r.company as Record<string, unknown> | undefined)?.logo,
      locationRaw: location,
      salaryRaw: {
        min: typeof r.salary_min === 'number' ? r.salary_min : undefined,
        max: typeof r.salary_max === 'number' ? r.salary_max : undefined,
        currency,
        period: 'year',
      },
      description: r.description,
      employmentType: r.contract_type,
      postedAt: r.created,
      applyUrl: r.redirect_url,
      sourceUrl: r.redirect_url,
      categories: (r.category as Record<string, unknown> | undefined)?.label,
      skills: (r.keywords as unknown[])?.slice(0, 10),
      locationExtra: { remote: /remote/i.test(String(location ?? '')) },
    })
    if (job) jobs.push(job)
  }
  return jobs
}

export const adzuna = defineProvider({
  source: 'adzuna',
  requiresCredentials: true,
  isConfigured: () => Boolean(adzunaCredentials().appId && adzunaCredentials().appKey),
  buildUrl,
  parseResponse,
})