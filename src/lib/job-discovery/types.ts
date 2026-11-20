/** Job Intelligence v2 — discovery source contracts. */

export type ResumeLayout = 'modern' | 'technical' | 'minimal' | 'ultra'
export type ResumePaper = 'a4' | 'letter'

export interface DiscoveryJob {
  /** Canonical job id once persisted; absent on a freshly parsed row. */
  id?: string
  sourceId: string
  sourceJobId: string
  title: string
  company?: string
  companyLogo?: string
  locationRaw?: string
  remote: boolean
  hybrid?: boolean
  onsite?: boolean
  employmentType?: string
  seniority?: string
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  salaryPeriod?: string
  salaryRaw?: string
  description: string
  excerpt?: string
  skills: string[]
  categories?: string[]
  postedAt?: string
  expiresAt?: string
  applyUrl?: string
  sourceUrl?: string
  attribution?: { required: boolean; label?: string; url?: string }
  eligibility?: unknown
  verificationStatus?: string
  raw?: unknown
}

export interface SourceSnapshot {
  url: string
  httpStatus: number
  etag?: string
  lastModified?: string
  contentHash: string
}

export interface AdapterOutput {
  jobs: DiscoveryJob[]
  /** Opaque cursor for the next run; null when the source is exhausted. */
  cursor: string | null
  snapshot: SourceSnapshot
}

export interface AdapterContext {
  config: Record<string, unknown>
  cursor: string | null
  timeoutMs: number
  fetchFn: typeof fetch
}

export type SourceAdapter = (ctx: AdapterContext) => Promise<AdapterOutput>

export interface IngestionSummary {
  sourceId: string
  status: 'ok' | 'partial' | 'failed'
  found: number
  inserted: number
  updated: number
  expired: number
  error?: string
  cursor?: string | null
}

export const DISCOVERY_SOURCES = [
  'remoteok',
  'remotive',
  'greenhouse',
  'lever',
  'ashby',
  'smartrecruiters',
] as const

export type DiscoverySourceId = (typeof DISCOVERY_SOURCES)[number]
