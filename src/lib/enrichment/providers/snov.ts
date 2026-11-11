/**
 * Snov.io adapter — fallback email finder + verification.
 *
 * Endpoints verified against https://snov.io/api on 2026-11-11:
 *   POST /v1/oauth/access_token                  (client_credentials)
 *   POST /v2/emails-by-domain-by-name/start      1 credit per valid/unknown email
 *   GET  /v2/emails-by-domain-by-name/result     ?task_hash=
 *   POST /v2/email-verification/start            free, rate-limited
 *   GET  /v2/email-verification/result           ?task_hash=
 *   POST /v2/database-search/prospects/start     people search (fallback)
 */
import type { ProviderAdapter, ProviderEnrichment, ProviderPerson, ProviderSearchPage, ProviderSearchQuery } from './types'
import { ProviderError, providerFetch, type ProviderOperation, type TelemetrySink } from './provider-http'

const BASE_URL = 'https://api.snov.io'

export interface SnovContext {
  clientId: string
  clientSecret: string
  organizationId: string
  searchRunId?: string | null
  telemetry?: TelemetrySink
}

interface SnovTaskBody {
  data?: { task_hash?: string } | unknown[]
  errors?: Array<{ message?: string }> | string
  meta?: { task_hash?: string }
}

interface SnovVerifierResult {
  email?: string
  result?: { smtp_status?: string }
}

interface SnovEmailRow {
  email?: string
  status?: string
  smtp_status?: string
}

/** Current Snov finder shape: data is [{ people, result: [{ email, smtp_status }] }]. */
interface SnovFinderEntry {
  people?: string
  result?: SnovEmailRow[]
}

/** Access tokens live 3600s; cache per process so a run does not re-auth per call. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

async function accessToken(context: SnovContext): Promise<string> {
  const cached = tokenCache.get(context.clientId)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

  const body = await providerFetch<{ access_token?: string; expires_in?: number }>({
    url: `${BASE_URL}/v1/oauth/access_token`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: context.clientId,
        client_secret: context.clientSecret,
      }).toString(),
    },
    organizationId: context.organizationId,
    provider: 'snov',
    // Token acquisition is not a business operation and never consumes credits.
    operation: 'AUTH',
    searchRunId: context.searchRunId,
    telemetry: context.telemetry,
  })

  if (!body.access_token) {
    throw new ProviderError('INVALID_KEY', 'snov did not return an access token')
  }
  tokenCache.set(context.clientId, {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  })
  return body.access_token
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

function taskHash(body: SnovTaskBody): string {
  const data = body.data
  if (data && !Array.isArray(data) && typeof data === 'object') {
    const hash = (data as { task_hash?: string }).task_hash
    if (hash) return hash
  }
  if (body.meta?.task_hash) return body.meta.task_hash
  throw new ProviderError('ERROR', 'snov did not return a task hash')
}

async function waitForResult<T>(
  context: SnovContext,
  path: string,
  token: string,
  operation: ProviderOperation,
  isDone: (body: T) => boolean,
  readCredits?: (body: T) => number,
): Promise<T> {
  // Snov tasks are near-immediate for these endpoints; poll a bounded 3 times.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const body = await providerFetch<T>({
      url: `${BASE_URL}${path}`,
      init: { method: 'GET', headers: headers(token) },
      organizationId: context.organizationId,
      provider: 'snov',
      operation,
      searchRunId: context.searchRunId,
      telemetry: context.telemetry,
      readCredits,
    })
    if (isDone(body)) return body
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new ProviderError('TIMEOUT', 'snov result never completed')
}

export class SnovAdapter implements ProviderAdapter {
  readonly name = 'snov' as const

  constructor(private readonly context: SnovContext) {}

  /**
   * Snov's people search is the database-search endpoint. It is only used as a
   * fallback when Prospeo is unavailable, so it returns provider people without
   * spending reveal credits.
   */
  async search(query: ProviderSearchQuery, signal?: AbortSignal): Promise<ProviderSearchPage> {
    const token = await accessToken(this.context)
    const filters: Record<string, unknown> = {
      prospect: {
        job_titles: { include: query.titles },
        management_levels: { include: query.seniority },
        locations: { include: query.countries.map((country) => ({ locality: country, location_type: 'country' })) },
      },
      company: {
        size: query.companySize.length > 0 ? { include: query.companySize } : undefined,
        industries: { include: query.industries },
      },
    }

    const started = await providerFetch<SnovTaskBody>({
      url: `${BASE_URL}/v2/database-search/prospects/start`,
      init: {
        method: 'POST',
        headers: { ...headers(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: query.page, filters }),
        signal,
      },
      organizationId: this.context.organizationId,
      provider: this.name,
      operation: 'SEARCH',
      searchRunId: this.context.searchRunId,
      telemetry: this.context.telemetry,
    })

    const hash = taskHash(started)
    const body = await waitForResult<{ data?: { prospects?: SnovProspect[]; total_pages?: number; total?: number }; status?: string }>(
      this.context,
      `/v2/database-search/prospects/result/${hash}`,
      token,
      'SEARCH',
      (result) => result.status === 'completed' || Boolean(result.data?.prospects),
      // Snov charges per page with results on paid plans; the free plan's first
      // page is free. The adapter reports the page cost for telemetry.
      (result) => ((result.data?.prospects?.length ?? 0) > 0 ? 1 : 0),
    )

    const prospects = body.data?.prospects ?? []
    return {
      people: prospects.map((prospect) => ({
        providerPersonId: prospect.linkedin_url || `${prospect.first_name ?? ''}-${prospect.last_name ?? ''}`,
        displayName: [prospect.first_name, prospect.last_name].filter(Boolean).join(' ') || prospect.job_title || '',
        firstName: prospect.first_name ?? null,
        lastName: prospect.last_name ?? null,
        title: prospect.job_title ?? '',
        company: prospect.company?.name ?? '',
        companyDomain: prospect.company?.domain ?? '',
        linkedinUrl: prospect.linkedin_url ?? '',
        country: '',
        city: '',
      })),
      page: query.page,
      perPage: 20,
      totalCount: body.data?.total ?? null,
      totalPages: body.data?.total_pages ?? null,
      hasMore: (body.data?.total_pages ?? 0) > query.page,
      free: false,
      creditsUsed: prospects.length > 0 ? 1 : 0,
    }
  }

  /** Name + company domain → candidate email (1 credit when an email is found). */
  async findEmail(person: ProviderPerson, signal?: AbortSignal): Promise<ProviderEnrichment> {
    const token = await accessToken(this.context)
    const started = await providerFetch<SnovTaskBody>({
      url: `${BASE_URL}/v2/emails-by-domain-by-name/start`,
      init: {
        method: 'POST',
        headers: { ...headers(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: [{ first_name: person.firstName ?? '', last_name: person.lastName ?? '', domain: person.companyDomain }],
        }),
        signal,
      },
      organizationId: this.context.organizationId,
      provider: this.name,
      operation: 'FIND_EMAIL',
      searchRunId: this.context.searchRunId,
      telemetry: this.context.telemetry,
      // The charge is settled by the result below, which knows whether an email
      // was actually returned.
      readCredits: () => 0,
    })

    const hash = taskHash(started)
    const body = await waitForResult<{ data?: SnovFinderEntry[] | { emails?: SnovEmailRow[] } | SnovEmailRow[]; status?: string }>(
      this.context,
      `/v2/emails-by-domain-by-name/result?task_hash=${hash}`,
      token,
      'FIND_EMAIL',
      (result) => result.status === 'completed' || Boolean(extractEmails(result).length),
      // Snov charges one credit per email it returns with a valid/unknown status.
      (result) => (extractEmails(result).length > 0 ? 1 : 0),
    )

    const emails = extractEmails(body)
    const found = emails.find((row) => row.email)
    if (!found?.email) {
      return { email: null, verification: 'UNKNOWN', creditsUsed: 0, free: false }
    }
    const status = (found.smtp_status ?? found.status ?? '').toLowerCase()
    return {
      email: found.email,
      verification: status === 'valid' ? 'VERIFIED' : status === 'invalid' || status === 'not_valid' ? 'INVALID' : 'UNKNOWN',
      creditsUsed: 1,
      free: false,
    }
  }

  async verifyEmail(email: string, signal?: AbortSignal): Promise<ProviderEnrichment> {
    const token = await accessToken(this.context)
    const started = await providerFetch<SnovTaskBody>({
      url: `${BASE_URL}/v2/email-verification/start`,
      init: {
        method: 'POST',
        headers: { ...headers(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: [email] }),
        signal,
      },
      organizationId: this.context.organizationId,
      provider: this.name,
      operation: 'VERIFY_EMAIL',
      searchRunId: this.context.searchRunId,
      telemetry: this.context.telemetry,
      // Verification is free; the result poll is labelled explicitly.
      readCredits: () => 0,
    })

    const hash = taskHash(started)
    const body = await waitForResult<{ data?: SnovVerifierResult[]; status?: string }>(
      this.context,
      `/v2/email-verification/result?task_hash=${hash}`,
      token,
      'VERIFY_EMAIL',
      (result) => result.status === 'completed' || Boolean(result.data?.length),
      () => 0,
    )

    const row = (body.data ?? []).find((entry) => entry.email?.toLowerCase() === email.toLowerCase())
    const smtp = row?.result?.smtp_status?.toLowerCase()
    return {
      email,
      verification: smtp === 'valid' ? 'VERIFIED' : smtp === 'not_valid' ? 'INVALID' : 'UNKNOWN',
      creditsUsed: 0,
      free: true,
    }
  }

  /** Snov has no reveal-only endpoint; findEmail is the reveal path. */
  async enrich(person: ProviderPerson, signal?: AbortSignal): Promise<ProviderEnrichment> {
    return this.findEmail(person, signal)
  }
}

interface SnovProspect {
  first_name?: string | null
  last_name?: string | null
  job_title?: string | null
  linkedin_url?: string | null
  company?: { name?: string | null; domain?: string | null }
}

function extractEmails(body: { data?: SnovFinderEntry[] | { emails?: SnovEmailRow[] } | SnovEmailRow[] }): SnovEmailRow[] {
  const data = body.data
  if (Array.isArray(data)) {
    const entries = data as SnovFinderEntry[]
    if (entries.length > 0 && Array.isArray(entries[0]?.result)) {
      return entries.flatMap((entry) => entry.result ?? [])
    }
    return data as SnovEmailRow[]
  }
  if (data && typeof data === 'object' && Array.isArray((data as { emails?: SnovEmailRow[] }).emails)) {
    return (data as { emails: SnovEmailRow[] }).emails
  }
  return []
}
