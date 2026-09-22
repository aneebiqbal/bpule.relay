/**
 * Find Jobs — shared types.
 *
 * These types are deliberately framework-agnostic and free of node-only
 * imports so the UI (client components) can import the shape and the pure
 * helpers (salary, location) without pulling in server code.
 */

export type JobSource =
  | 'adzuna'
  | 'himalayas'
  | 'remoteok'
  | 'jobicy'
  | 'remotive'
  | 'arbeitnow'
  | 'themuse'
  | 'usajobs'

export const JOB_SOURCES: readonly JobSource[] = [
  'adzuna',
  'himalayas',
  'remoteok',
  'jobicy',
  'remotive',
  'arbeitnow',
  'themuse',
  'usajobs',
]

export type ProviderStatus =
  | 'success'
  | 'failed'
  | 'rate_limited'
  | 'unauthorized'
  | 'timeout'
  | 'unavailable'
  | 'invalid_response'
  | 'not_configured'

export type SalaryPeriod = 'year' | 'month' | 'week' | 'day' | 'hour'

export interface SalaryInfo {
  /** Lowest bounded value of the range, in the original currency units. */
  min?: number
  /** Highest bounded value of the range, in the original currency units. */
  max?: number
  /** ISO 4217 currency code when one could be determined. */
  currency?: string
  period?: SalaryPeriod
  /** The provider's original salary text, kept verbatim. */
  raw?: string
  /** True when min and currency were both resolved (usable for filtering). */
  normalizable: boolean
}

export interface Attribution {
  required: boolean
  label?: string
  url?: string
}

/** Normalized, provider-agnostic job. */
export interface Job {
  id: string
  source: JobSource
  sourceJobId: string
  title: string
  company: string
  companyLogo?: string
  location: string
  country?: string
  locations?: string[]
  remote: boolean
  hybrid: boolean
  onsite: boolean
  employmentType?: string
  seniority?: string
  salary: SalaryInfo | null
  description: string
  excerpt?: string
  skills?: string[]
  categories?: string[]
  postedAt?: string
  expiresAt?: string
  applyUrl: string
  sourceUrl?: string
  attribution?: Attribution
  /** Set during deduplication when the same job was also seen on other sources. */
  alsoListedOn?: JobSource[]
}

/** Provider-specific search parameters — adapters translate this to their own API. */
export interface JobSearchParams {
  query: string
  alternativeQueries?: string[]
  location?: string
  country?: string
  remote?: boolean
  hybrid?: boolean
  onsite?: boolean
  minimumSalary?: number
  salaryCurrency?: string
  employmentType?: string
  seniority?: string
  skills?: string[]
  page?: number
  limit?: number
}

/** The user's extracted profile used for query generation and matching. */
export interface CvProfile {
  primaryRole: string
  alternativeRoles: string[]
  skills: string[]
  seniority?: string
  yearsExperience?: number
  location?: string
  country?: string
  summary?: string
  sourceLabel?: string
  /** Earlier roles found on the CV (e.g. "React Developer"). */
  previousRoles?: string[]
  /** Education entries (degrees, fields of study). */
  education?: string[]
  /** Industries the candidate has worked in. */
  industries?: string[]
  /** Work authorization summary from the CV when available. */
  workAuth?: string
  /** Preferred job types when the CV states them. */
  preferredJobTypes?: string[]
}

/**
 * User-facing search input. `query`/`role` are both optional — an explicit
 * query wins, then `role`, then the CV-derived role. `buildSearchParams`
 * resolves the real provider-facing `JobSearchParams`.
 */
export interface JobSearchParamsInput {
  profileId?: string | null
  role?: string | null
  query?: string
  location?: string
  country?: string
  remote?: boolean
  hybrid?: boolean
  onsite?: boolean
  minimumSalary?: number
  salaryCurrency?: string
  employmentType?: string
  seniority?: string
  skills?: string[]
  page?: number
  limit?: number
  aiMatching?: boolean
  mock?: boolean
}

export interface ScoreBreakdown {
  role: number
  skills: number
  seniority: number
  location: number
  remote: number
  salary: number
  employment: number
  freshness: number
}

/** Matched job — a Job plus a transparent, explainable match payload. */
export interface JobMatch {
  /** Combined 0-100 score shown in the UI. */
  score: number
  /** Deterministic signal score (0-100) — always present. */
  deterministic: number
  /** AI semantic score (0-100), when AI matching ran successfully. */
  aiScore?: number
  summary: string
  strengths: string[]
  gaps: string[]
  matchedSkills: string[]
  missingSkills: string[]
  aiAvailable: boolean
  breakdown: ScoreBreakdown
}

export type JobWithMatch = Job & { match: JobMatch }

export interface SourceHealth {
  status: ProviderStatus
  /** Jobs this source contributed to the current pipeline stage (`count`). */
  count: number
  mock: boolean
  errorKind?: string | null
  /** Raw listings fetched from the source (before deduplication). */
  raw?: number
  /** Listings from this source that survived deduplication. */
  unique?: number
  /** Listings from this source that survived hard filtering. */
  filtered?: number
  /** Listings from this source present in the final ranked result. */
  final?: number
  /** Search queries issued to this source. */
  queries?: number
  /** HTTP pages fetched from this source. */
  pages?: number
}

export interface GeneratedQuery {
  query: string
  alternativeQueries: string[]
  skills: string[]
  seniority?: string
}

/**
 * A user-uploaded CV parsed into searchable signals. Framework-agnostic so the
 * client can send it straight to the search API and the engine can rank with it.
 */
export interface ExtractedCv {
  role: string
  seniority?: string
  skills: string[]
  technologies?: string[]
  company?: string
  summary?: string
  sourceLabel?: string
  previousRoles?: string[]
  education?: string[]
  industries?: string[]
  workAuth?: string
  preferredJobTypes?: string[]
}

export interface JobSearchResponse {
  jobs: JobWithMatch[]
  sources: Record<JobSource, SourceHealth>
  meta: {
    totalRaw: number
    afterDedupe: number
    afterFilters: number
    /** Listings removed as duplicates during deduplication. */
    dedupeRemoved: number
    /** Listings removed by hard filtering (dedupe output → filter output). */
    filteredRemoved: number
    elapsedMs: number
    mock: boolean
    cvUsed: CvProfile | null
    aiMatchingUsed: boolean
    generatedQuery: GeneratedQuery
    /** The search terms actually issued to the providers, in order. */
    queriesUsed: string[]
  }
}

/** Typed failure raised by provider adapters; mapped to ProviderStatus by the aggregator. */
export type ProviderFailureKind =
  | 'timeout'
  | 'unauthorized'
  | 'rate_limited'
  | 'invalid_response'
  | 'unavailable'
  | 'failed'

export class ProviderFailure extends Error {
  readonly kind: ProviderFailureKind
  readonly status: ProviderStatus

  constructor(kind: ProviderFailureKind, message: string) {
    super(message)
    this.name = 'ProviderFailure'
    this.kind = kind
    this.status = kind
  }
}