/**
 * Prospeo adapter — primary people search + email enrichment.
 *
 * Endpoints verified against https://prospeo.io/api-docs on 2026-11-11:
 *   POST /search-person  (X-KEY)  — 1 credit per page with results, 25/page
 *   POST /enrich-person  (X-KEY)  — 1 credit per revealed email
 */
import type { ProviderAdapter, ProviderEnrichment, ProviderPerson, ProviderSearchPage, ProviderSearchQuery } from './types'
import { ProviderError, providerFetch, type TelemetrySink } from './provider-http'

const BASE_URL = 'https://api.prospeo.io'
const PER_PAGE = 25

export interface ProspeoContext {
  apiKey: string
  organizationId: string
  searchRunId?: string | null
  telemetry?: TelemetrySink
}

interface ProspeoEmail {
  status?: string
  revealed?: boolean
  email?: string | null
}

interface ProspeoPerson {
  person_id?: string
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  linkedin_url?: string | null
  current_job_title?: string | null
  location?: { country?: string | null; city?: string | null } | null
}

interface ProspeoCompany {
  name?: string | null
  domain?: string | null
  website?: string | null
  location?: { country?: string | null; city?: string | null } | null
}

interface ProspeoSearchResult {
  person?: ProspeoPerson
  company?: ProspeoCompany
}

interface ProspeoSearchBody {
  error?: boolean
  free?: boolean
  results?: ProspeoSearchResult[]
  pagination?: {
    current_page?: number
    per_page?: number
    total_page?: number
    total_count?: number
  }
}

interface ProspeoEnrichBody {
  error?: boolean
  free_enrichment?: boolean
  person?: ProspeoPerson & { email?: ProspeoEmail | null }
}

function nonEmpty(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

export class ProspeoAdapter implements ProviderAdapter {
  readonly name = 'prospeo' as const

  constructor(private readonly context: ProspeoContext) {}

  async search(query: ProviderSearchQuery, signal?: AbortSignal): Promise<ProviderSearchPage> {
    const filters: Record<string, unknown> = {}

    const titles = nonEmpty(query.titles)
    if (titles.length > 0) {
      filters.person_job_title = { include: titles, match_mode: 'CONTAINS' }
    }
    const excluded = nonEmpty(query.excludeTitles)
    if (excluded.length > 0) {
      filters.person_job_title = { ...(filters.person_job_title as Record<string, unknown> ?? {}), exclude: excluded }
    }
    const seniority = nonEmpty(query.seniority)
    if (seniority.length > 0) filters.person_seniority = { include: seniority }

    const locations = nonEmpty(query.countries).map((country) => ({ location: country, location_type: 'country' }))
    if (locations.length > 0) filters.company_location_search = { include: locations }

    const size = nonEmpty(query.companySize)
    if (size.length > 0) filters.company_headcount_range = { include: size }

    const industries = nonEmpty(query.industries)
    if (industries.length > 0) filters.company_industry = { include: industries }

    const body = await providerFetch<ProspeoSearchBody>({
      url: `${BASE_URL}/search-person`,
      init: {
        method: 'POST',
        headers: { 'X-KEY': this.context.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: query.page, filters }),
        signal,
      },
      organizationId: this.context.organizationId,
      provider: this.name,
      operation: 'SEARCH',
      searchRunId: this.context.searchRunId,
      telemetry: this.context.telemetry,
      readCredits: (body) => (body.free ? 0 : (body.results?.length ?? 0) > 0 ? 1 : 0),
    })

    const pagination = body.pagination
    const people = (body.results ?? []).flatMap((result) => {
      const person = result.person
      if (!person || !person.person_id) return []
      return [mapPerson(person, result.company)]
    })

    return {
      people,
      page: pagination?.current_page ?? query.page,
      perPage: pagination?.per_page ?? PER_PAGE,
      totalCount: pagination?.total_count ?? null,
      totalPages: pagination?.total_page ?? null,
      hasMore: (pagination?.current_page ?? query.page) < (pagination?.total_page ?? 1),
      free: Boolean(body.free),
      creditsUsed: body.free ? 0 : people.length > 0 ? 1 : 0,
    }
  }

  async enrich(person: ProviderPerson, signal?: AbortSignal): Promise<ProviderEnrichment> {
    // Prospeo matches on any of: person_id, linkedin_url, email, or a
    // name+company combination. Submit everything we have for accuracy; the
    // manual path only has the LinkedIn URL (verified docs, 2026-11-11).
    const data: Record<string, unknown> = {}
    if (person.providerPersonId) data.person_id = person.providerPersonId
    if (person.linkedinUrl) data.linkedin_url = person.linkedinUrl
    if (person.displayName) data.full_name = person.displayName
    if (person.firstName) data.first_name = person.firstName
    if (person.lastName) data.last_name = person.lastName
    if (person.company) data.company_name = person.company
    if (person.companyDomain) data.company_website = person.companyDomain

    const body = await providerFetch<ProspeoEnrichBody>({
      url: `${BASE_URL}/enrich-person`,
      init: {
        method: 'POST',
        headers: { 'X-KEY': this.context.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, only_verified_email: true }),
        signal,
      },
      organizationId: this.context.organizationId,
      provider: this.name,
      operation: 'REVEAL',
      searchRunId: this.context.searchRunId,
      telemetry: this.context.telemetry,
      readCredits: (body) => {
        const email = body.person?.email
        return body.free_enrichment ? 0 : email?.revealed && email?.email ? 1 : 0
      },
    })

    const email = body.person?.email
    if (!email || !email.revealed || !email.email) {
      return { email: null, verification: 'UNKNOWN', creditsUsed: 0, free: Boolean(body.free_enrichment) }
    }
    const status = typeof email.status === 'string' ? email.status.toUpperCase() : ''
    return {
      email: email.email,
      verification: status === 'VERIFIED' ? 'VERIFIED' : status === 'RISKY' ? 'RISKY' : status === 'INVALID' ? 'INVALID' : 'UNKNOWN',
      creditsUsed: body.free_enrichment ? 0 : 1,
      free: Boolean(body.free_enrichment),
    }
  }

  /** Prospeo has no name+domain finder; enrichment is the only reveal path. */
  async findEmail(): Promise<ProviderEnrichment> {
    throw new ProviderError('ERROR', 'prospeo has no name+domain finder; use enrich')
  }

  async verifyEmail(): Promise<ProviderEnrichment> {
    throw new ProviderError('ERROR', 'prospeo does not expose a standalone verifier; enrichment already verifies')
  }
}

function mapPerson(person: ProspeoPerson, company?: ProspeoCompany): ProviderPerson {
  const companyName = company?.name ?? ''
  const companyDomain = company?.domain ?? company?.website ?? ''
  return {
    providerPersonId: person.person_id as string,
    // The provider's own spelling is the source of truth and is preserved.
    displayName: person.full_name ?? [person.first_name, person.last_name].filter(Boolean).join(' ') ?? '',
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    title: person.current_job_title ?? '',
    company: companyName,
    companyDomain,
    linkedinUrl: person.linkedin_url ?? '',
    country: person.location?.country ?? company?.location?.country ?? '',
    city: person.location?.city ?? company?.location?.city ?? '',
  }
}
