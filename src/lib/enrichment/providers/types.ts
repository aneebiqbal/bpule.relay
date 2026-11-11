/**
 * Provider boundary — the only module that talks to Prospeo / Snov / Apollo.
 *
 * Server-only. The browser never calls a provider; every call goes through
 * `enrichment-service` / `search-service`, which are reached from server code or
 * an authenticated route.
 */

export type ProviderName = 'prospeo' | 'snov' | 'apollo'

export const PROVIDER_NAMES: readonly ProviderName[] = ['prospeo', 'snov', 'apollo']

export interface ProviderSearchQuery {
  titles: string[]
  seniority: string[]
  countries: string[]
  companySize: string[]
  industries: string[]
  excludeTitles: string[]
  page: number
  perPage: number
}

/** The useful source facts a provider returns about one person. */
export interface ProviderPerson {
  providerPersonId: string
  /** Exactly as the provider spells it — never rewritten. */
  displayName: string
  firstName: string | null
  lastName: string | null
  title: string
  company: string
  companyDomain: string
  linkedinUrl: string
  country: string
  city: string
}

export interface ProviderSearchPage {
  people: ProviderPerson[]
  page: number
  perPage: number
  totalCount: number | null
  totalPages: number | null
  hasMore: boolean
  /** The provider did not charge for this page (its own dedupe window). */
  free: boolean
  creditsUsed: number
}

export type EmailVerification = 'VERIFIED' | 'RISKY' | 'INVALID' | 'UNKNOWN'

export interface ProviderEnrichment {
  email: string | null
  verification: EmailVerification
  creditsUsed: number
  free: boolean
}

export interface ProviderAdapter {
  readonly name: ProviderName
  search(query: ProviderSearchQuery, signal?: AbortSignal): Promise<ProviderSearchPage>
  /** Reveal the email for a person already found by `search`. */
  enrich(person: ProviderPerson, signal?: AbortSignal): Promise<ProviderEnrichment>
  /** Fallback: derive an email from a name plus a company domain. */
  findEmail(person: ProviderPerson, signal?: AbortSignal): Promise<ProviderEnrichment>
  verifyEmail(email: string, signal?: AbortSignal): Promise<ProviderEnrichment>
}

/** Maps a provider verification verdict onto Relay's canonical status. */
export function toContactVerification(value: EmailVerification): 'VERIFIED' | 'LIKELY_VALID' | 'UNVERIFIED' | 'INVALID' | 'BOUNCED' | 'UNKNOWN' {
  switch (value) {
    case 'VERIFIED':
      return 'VERIFIED'
    case 'RISKY':
      return 'LIKELY_VALID'
    case 'INVALID':
      return 'INVALID'
    default:
      return 'UNKNOWN'
  }
}
