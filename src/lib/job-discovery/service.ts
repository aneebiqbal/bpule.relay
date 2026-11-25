/**
 * Job Intelligence v2 — read/write service for the Jobs workspace.
 *
 * All queries pass the organization explicitly; the user-specific tables are
 * also RLS-scoped in the database. The discovery worker is the only writer
 * that uses the service role.
 */

import type { DbClient } from '@/lib/db/types'
import { loadProfileEvidence } from '@/lib/generation/profile-evidence'
import type { JobEligibility } from './eligibility'
import { defaultFreshnessDays } from '@/lib/jobs/config'
import { computeJobMatch, MATCH_SCORE_VERSION, type MatchProfile } from './match'
import type { DiscoveryJob } from './types'

export type JobsView = 'for-you' | 'shortlist' | 'prepared' | 'latest' | 'verified-remote' | 'saved' | 'applications' | 'documents' | 'sources' | 'in-progress' | 'history'

export interface JobCard {
  id: string
  sourceId: string
  sourceJobId: string
  title: string
  company: string | null
  companyLogo: string | null
  locationRaw: string | null
  remote: boolean
  employmentType: string | null
  seniority: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  salaryPeriod: string | null
  skills: string[]
  postedAt: string | null
  firstSeenAt: string
  lastSeenAt: string
  lastVerifiedAt: string | null
  verificationStatus: string
  eligibility: JobEligibility | null
  applyUrl: string | null
  sourceUrl: string | null
  match: { score: number; category: string; explanation: string | null; breakdown?: Record<string, number> } | null
  saved: boolean
  applicationStatus: string | null
}

export interface JobFilters {
  title?: string
  skills?: string[]
  company?: string
  location?: string
  minSalary?: number
  maxSalary?: number
  seniority?: string
  employmentType?: string
  freshnessDays?: number
  verificationStatus?: string
  matchCategory?: string
  sort?: 'posted_desc' | 'posted_asc' | 'match_desc' | 'freshness_desc' | 'salary_desc'
}

/** Views whose product contract is "fresh opportunities". */
export const FRESH_FEED_VIEWS: ReadonlySet<JobsView> = new Set([
  'shortlist',
  'latest',
  'for-you',
  'verified-remote',
])

/**
 * The window a feed actually uses. An explicit value always wins — including 0,
 * which means "all open" — so only an absent value falls back to the default.
 */
export function resolveFreshnessWindow(view: JobsView, freshnessDays?: number): number | undefined {
  if (freshnessDays !== undefined) return freshnessDays
  return FRESH_FEED_VIEWS.has(view) ? defaultFreshnessDays() : undefined
}

export interface ListJobsOptions {
  view: JobsView
  profileId?: string
  search?: string
  filters?: JobFilters
  limit?: number
  offset?: number
}

interface JobRow {
  id: string
  source_id: string
  source_job_id: string
  title: string
  company: string | null
  company_logo: string | null
  location_raw: string | null
  remote: boolean
  hybrid?: boolean
  onsite?: boolean
  employment_type: string | null
  seniority: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_period: string | null
  salary_raw?: string | null
  description?: string | null
  excerpt?: string | null
  skills: string[] | null
  categories?: string[] | null
  posted_at: string | null
  expires_at?: string | null
  apply_url?: string | null
  source_url?: string | null
  attribution?: unknown
  first_seen_at: string
  last_seen_at: string
  last_verified_at: string | null
  verification_status: string
  eligibility: unknown
  match_score?: number | null
  match_category?: string | null
  match_explanation?: string | null
  match_breakdown?: Record<string, number> | null
  saved?: boolean
  application_status?: string | null
}

export function rowToJobCard(row: JobRow): JobCard {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceJobId: row.source_job_id,
    title: row.title,
    company: row.company,
    companyLogo: row.company_logo,
    locationRaw: row.location_raw,
    remote: row.remote,
    employmentType: row.employment_type,
    seniority: row.seniority,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    salaryPeriod: row.salary_period,
    skills: Array.isArray(row.skills) ? row.skills : [],
    postedAt: row.posted_at,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastVerifiedAt: row.last_verified_at,
    verificationStatus: row.verification_status,
    eligibility: row.eligibility && typeof row.eligibility === 'object' ? (row.eligibility as JobEligibility) : null,
    applyUrl: (row as JobRow & { apply_url?: string | null }).apply_url ?? null,
    sourceUrl: (row as JobRow & { source_url?: string | null }).source_url ?? null,
    match: row.match_score != null
      ? {
          score: row.match_score,
          category: row.match_category ?? 'possible',
          explanation: row.match_explanation ?? null,
          breakdown: row.match_breakdown ?? undefined,
        }
      : null,
    saved: Boolean(row.saved),
    applicationStatus: row.application_status ?? null,
  }
}

export function rowToDiscoveryJob(row: JobRow): DiscoveryJob {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceJobId: row.source_job_id,
    title: row.title,
    company: row.company ?? undefined,
    companyLogo: row.company_logo ?? undefined,
    locationRaw: row.location_raw ?? undefined,
    remote: row.remote,
    hybrid: row.hybrid ?? undefined,
    onsite: row.onsite ?? undefined,
    employmentType: row.employment_type ?? undefined,
    seniority: row.seniority ?? undefined,
    salaryMin: row.salary_min ?? undefined,
    salaryMax: row.salary_max ?? undefined,
    salaryCurrency: row.salary_currency ?? undefined,
    salaryPeriod: row.salary_period ?? undefined,
    salaryRaw: row.salary_raw ?? undefined,
    description: row.description ?? '',
    excerpt: row.excerpt ?? undefined,
    skills: Array.isArray(row.skills) ? row.skills : [],
    categories: Array.isArray(row.categories) ? row.categories : undefined,
    postedAt: row.posted_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    applyUrl: row.apply_url ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    attribution: row.attribution && typeof row.attribution === 'object' ? row.attribution as DiscoveryJob['attribution'] : undefined,
    eligibility: row.eligibility,
    verificationStatus: row.verification_status,
    raw: undefined,
  }
}

export async function listJobs(db: DbClient, orgId: string, options: ListJobsOptions): Promise<{ jobs: JobCard[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const profileId = options.profileId ?? null
  const search = options.search?.trim()
  let join = ''
  const isHistory = options.view === 'history'
  let where = isHistory
    ? `(
        j.verification_status in ('closed','expired')
        or exists(
          select 1 from applications ah
          where ah.job_id = j.id and ah.organization_id = ? and ah.profile_id = ?
            and ah.status in ('applied','replied','interview','offer','hired','rejected','withdrawn')
        )
        or exists(
          select 1 from saved_jobs sh
          where sh.job_id = j.id and sh.organization_id = ? and sh.profile_id = ?
        )
      )`
    : `j.verification_status not in ('closed','expired','source_unavailable')`
  const joinParams: unknown[] = []
  const whereParams: unknown[] = isHistory
    ? [orgId, profileId, orgId, profileId]
    : []
  if (isHistory && !profileId) {
    // History is profile-scoped (a person's applications and saved jobs).
    return { jobs: [], hasMore: false }
  }

  const feedView = options.view === 'latest' || options.view === 'verified-remote' || options.view === 'for-you' || options.view === 'shortlist'
  if (options.view === 'shortlist') {
    // The daily shortlist is the strict recommended set plus the next-best
    // eligible roles, so a thin verified pipeline still shows a usable list.
    join = `join job_inventory_index ii on ii.job_id = j.id and ii.feed_bucket in ('recommended','eligible_low')`
    where += ` and ii.feed_bucket in ('recommended','eligible_low')`
  } else if (feedView) {
    join = `join job_inventory_index ii on ii.job_id = j.id and ii.include_in_feed`
    where += ` and ii.include_in_feed`
  }

  if (options.view === 'saved') {
    if (!profileId) return { jobs: [], hasMore: false }
    join = `join saved_jobs s on s.job_id = j.id and s.organization_id = ? and s.profile_id = ?`
    joinParams.push(orgId, profileId)
  } else if (options.view === 'applications') {
    if (!profileId) return { jobs: [], hasMore: false }
    join = `join applications a on a.job_id = j.id and a.organization_id = ? and a.profile_id = ?`
    joinParams.push(orgId, profileId)
  } else if (options.view === 'documents') {
    if (!profileId) return { jobs: [], hasMore: false }
    // Lateral aggregate: a job has several document kinds/versions, so a plain
    // join would emit the same job once per document.
    join = `join lateral (select max(d.updated_at) as updated_at from application_documents d where d.job_id = j.id and d.organization_id = ? and d.profile_id = ?) d on true`
    joinParams.push(orgId, profileId)
    where += ` and d.updated_at is not null`
  }

  if (options.view === 'in-progress') {
    if (!profileId) return { jobs: [], hasMore: false }
    where += ` and (
      exists(select 1 from saved_jobs s where s.job_id = j.id and s.organization_id = ? and s.profile_id = ?)
      or exists(select 1 from applications a where a.job_id = j.id and a.organization_id = ? and a.profile_id = ?
        and a.status in ('draft','saved','reviewed','prepared','applied','replied','interview','offer'))
      or exists(select 1 from application_documents d where d.job_id = j.id and d.organization_id = ? and d.profile_id = ?)
    )`
    whereParams.push(orgId, profileId, orgId, profileId, orgId, profileId)
  }

  if (options.view === 'verified-remote') {
    where += ` and j.remote = true and j.verification_status = 'verified_open'`
  }

  if (search) {
    where += ` and (j.title ilike ? or j.company ilike ? or j.description ilike ? or j.skills::text ilike ?)`
    const pattern = `%${search}%`
    whereParams.push(pattern, pattern, pattern, pattern)
  }

  const filters = options.filters ?? {}
  // Fresh-first default for the proactive feed. An explicit window (including 0
  // = all open) always wins; an unset window shows only genuinely recent work.
  const freshnessDays = resolveFreshnessWindow(options.view, filters.freshnessDays)
  if (filters.title) {
    where += ` and j.title ilike ?`
    whereParams.push(`%${filters.title}%`)
  }
  if (filters.company) {
    where += ` and j.company ilike ?`
    whereParams.push(`%${filters.company}%`)
  }
  if (filters.location) {
    where += ` and (j.location_raw ilike ? or j.country ilike ?)`
    whereParams.push(`%${filters.location}%`, `%${filters.location}%`)
  }
  if (filters.skills && filters.skills.length > 0) {
    where += ` and j.skills && ?`
    whereParams.push(filters.skills)
  }
  if (filters.minSalary != null) {
    where += ` and j.salary_max >= ?`
    whereParams.push(filters.minSalary)
  }
  if (filters.maxSalary != null) {
    where += ` and j.salary_min <= ?`
    whereParams.push(filters.maxSalary)
  }
  if (filters.seniority) {
    where += ` and j.seniority ilike ?`
    whereParams.push(`%${filters.seniority}%`)
  }
  if (filters.employmentType) {
    where += ` and j.employment_type ilike ?`
    whereParams.push(`%${filters.employmentType}%`)
  }
  if (freshnessDays != null && freshnessDays > 0) {
    // NULL posted_at fails the comparison naturally: an unknown publication
    // date is never presented as freshly published.
    where += ` and j.posted_at >= ?`
    whereParams.push(new Date(Date.now() - freshnessDays * 86_400_000))
  }
  if (filters.verificationStatus) {
    where += ` and j.verification_status = ?`
    whereParams.push(filters.verificationStatus)
  }
  if (filters.matchCategory) {
    where += ` and m.category = ?`
    whereParams.push(filters.matchCategory)
  }

  const sort = filters.sort ?? (options.view === 'for-you' || options.view === 'shortlist' ? 'match_desc' : 'posted_desc')
  // Publication age is the honest ordering signal. first_seen_at is discovery
  // time, not publication time, so it never stands in for a missing posted_at:
  // an unknown-date listing sorts last instead of masquerading as newest.
  const sortOrder: Record<NonNullable<JobFilters['sort']>, string> = {
    posted_desc: `j.posted_at desc nulls last`,
    posted_asc: `j.posted_at asc nulls last`,
    match_desc: `case when m.category = 'not_eligible' then 1 else 0 end asc, m.score desc nulls last, j.posted_at desc nulls last`,
    freshness_desc: `j.last_seen_at desc, j.posted_at desc nulls last`,
    salary_desc: `j.salary_min desc nulls last, j.salary_max desc nulls last`,
  }
  const order =
    options.view === 'saved'
      ? 's.updated_at desc'
      : options.view === 'applications'
        ? 'a.updated_at desc'
        : options.view === 'documents'
          ? 'd.updated_at desc'
          : sortOrder[sort]

  const sql = `
    select j.*,
      m.score as match_score, m.category as match_category, m.explanation as match_explanation,
      m.breakdown as match_breakdown,
      exists(select 1 from saved_jobs s2 where s2.job_id = j.id and s2.organization_id = ?) as saved,
      (select a2.status from applications a2 where a2.job_id = j.id and a2.organization_id = ? and a2.profile_id = ? limit 1) as application_status
    from jobs j
    left join job_matches m on m.job_id = j.id and m.organization_id = ? and m.profile_id = ?
    ${join}
    where ${where}
    order by ${order}
    limit ? offset ?`
  // Placeholder order is SELECT exists, SELECT subquery, LEFT JOIN match,
  // view JOIN, WHERE search, LIMIT/OFFSET.
  const params: unknown[] = [orgId, orgId, profileId, orgId, profileId, ...joinParams, ...whereParams, limit + 1, offset]

  const result = await db.raw!<JobRow[]>(sql, params)
  if (result.error) throw new Error(result.error.message)
  const rows = result.data ?? []
  const page = rows.slice(0, limit)
  return { jobs: page.map(rowToJobCard), hasMore: rows.length > limit }
}

export async function getJob(db: DbClient, orgId: string, jobId: string, profileId?: string): Promise<JobCard | null> {
  const result = await db.raw!<JobRow[]>(
    `select j.*,
       m.score as match_score, m.category as match_category, m.explanation as match_explanation,
       m.breakdown as match_breakdown,
       exists(select 1 from saved_jobs s where s.job_id = j.id and s.organization_id = ?) as saved,
       (select a.status from applications a where a.job_id = j.id and a.organization_id = ? and a.profile_id = ? limit 1) as application_status
     from jobs j
     left join job_matches m on m.job_id = j.id and m.organization_id = ? and m.profile_id = ?
     where j.id = ?
     limit 1`,
    [orgId, orgId, profileId ?? null, orgId, profileId ?? null, jobId],
  )
  if (result.error) throw new Error(result.error.message)
  const row = result.data?.[0]
  return row ? rowToJobCard(row) : null
}

export async function getJobDetail(db: DbClient, jobId: string): Promise<Record<string, unknown> | null> {
  const result = await db.raw!<Record<string, unknown>[]>('select * from jobs where id = ? limit 1', [jobId])
  if (result.error) throw new Error(result.error.message)
  return result.data?.[0] ?? null
}

export async function ensureJobMatches(db: DbClient, orgId: string, profileId: string, jobIds?: string[]): Promise<number> {
  const profileResult = await db.from('profile').select('*').eq('id', profileId).eq('organization_id', orgId).single()
  if (profileResult.error || !profileResult.data) return 0
  const profileRow = profileResult.data as Row
  const timezoneResult = await db.from('reps').select('timezone').eq('id', profileRow.rep_id).maybeSingle()
  const timezone = (timezoneResult.data?.timezone as string | null) ?? 'UTC'
  const evidence = await loadProfileEvidence(db, profileId)

  let jobs: DiscoveryJob[]
  if (jobIds && jobIds.length > 0) {
    const result = await db.raw!<JobRow[]>('select * from jobs where id = any(?) limit 300', [jobIds])
    if (result.error) throw new Error(result.error.message)
    jobs = (result.data ?? []).map(rowToDiscoveryJob)
  } else {
    const result = await db.raw!<JobRow[]>(
      `select * from jobs
       where verification_status not in ('closed','expired','source_unavailable')
       order by coalesce(posted_at, first_seen_at) desc
       limit 200`,
      [],
    )
    if (result.error) throw new Error(result.error.message)
    jobs = (result.data ?? []).map(rowToDiscoveryJob)
  }

  const profile: MatchProfile = {
    profileId,
    headline: (profileRow.headline as string | null) ?? null,
    location: (profileRow.location as string | null) ?? null,
    timezone,
    preferredEngagementTypes: Array.isArray(profileRow.preferred_engagement_types)
      ? (profileRow.preferred_engagement_types as string[])
      : [],
    evidence,
  }

  // Only compute jobs that do not already have a current-version match. The
  // first For You load does the bulk; later loads only handle new jobs.
  const existingMatches = await db.from('job_matches').select('job_id')
    .eq('organization_id', orgId).eq('profile_id', profileId).eq('score_version', MATCH_SCORE_VERSION)
  const alreadyMatched = new Set((existingMatches.data ?? []).map((row) => row.job_id as string))
  let computed = 0
  for (const job of jobs) {
    if (!job.id || alreadyMatched.has(job.id)) continue
    const match = computeJobMatch(job, profile, job.verificationStatus)
    await db.from('job_matches').upsert(
      {
        organization_id: orgId,
        job_id: job.id,
        profile_id: profileId,
        score: match.score,
        category: match.category,
        breakdown: match.breakdown,
        evidence: match.evidence,
        explanation: match.explanation,
        score_version: MATCH_SCORE_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,job_id,profile_id' },
    )
    computed++
  }
  return computed
}

export async function setSavedJob(
  db: DbClient,
  orgId: string,
  jobId: string,
  profileId: string,
  repId: string,
  saved: boolean,
  notes?: string,
): Promise<void> {
  if (!saved) {
    await db.from('saved_jobs').delete().eq('organization_id', orgId).eq('job_id', jobId).eq('profile_id', profileId)
    return
  }
  await db.from('saved_jobs').upsert(
    {
      organization_id: orgId,
      job_id: jobId,
      profile_id: profileId,
      rep_id: repId,
      status: 'saved',
      notes: notes ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,job_id,profile_id' },
  )
}

export interface ApplicationInput {
  jobId: string
  profileId: string
  repId: string
  accountId?: string | null
  status: string
  method: string
  destinationUrl?: string | null
  notes?: string
  reminderAt?: string | null
}

export async function upsertApplication(db: DbClient, orgId: string, input: ApplicationInput): Promise<string | null> {
  const values = {
    organization_id: orgId,
    job_id: input.jobId,
    profile_id: input.profileId,
    rep_id: input.repId,
    account_id: input.accountId ?? null,
    status: input.status,
    method: input.method,
    destination_url: input.destinationUrl ?? null,
    notes: input.notes ?? '',
    reminder_at: input.reminderAt ?? null,
    submitted_at: input.status === 'applied' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  const result = await db.from('applications').upsert(values, {
    onConflict: 'organization_id,job_id,profile_id',
  }).select('id').single()
  if (result.error) throw new Error(result.error.message)
  return (result.data?.id as string) ?? null
}

export async function transitionApplication(
  db: DbClient,
  orgId: string,
  applicationId: string,
  toStatus: string,
  actorId: string,
  note = '',
): Promise<void> {
  const current = await db.from('applications').select('status').eq('id', applicationId).eq('organization_id', orgId).single()
  const fromStatus = (current.data?.status as string) ?? null
  if (fromStatus === toStatus) return
  const updated = await db.from('applications').update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq('id', applicationId).eq('organization_id', orgId)
  if (updated.error) throw new Error(updated.error.message)
  // The event is written by the applications_transition_log trigger.
  void fromStatus
  void actorId
  void note
}

export async function listApplications(db: DbClient, orgId: string, profileId?: string): Promise<Array<Record<string, unknown>>> {
  const result = await db.raw!<Array<Record<string, unknown>>>(
    `select a.*, j.title as job_title, j.company as job_company, j.source_id as job_source_id,
            j.source_job_id as job_source_job_id
     from applications a
     join jobs j on j.id = a.job_id
     where a.organization_id = ? ${profileId ? 'and a.profile_id = ?' : ''}
     order by a.updated_at desc
     limit 200`,
    profileId ? [orgId, profileId] : [orgId],
  )
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

export async function listDocuments(db: DbClient, orgId: string, profileId: string, jobId?: string): Promise<Array<Record<string, unknown>>> {
  const result = await db.raw!<Array<Record<string, unknown>>>(
    `select * from application_documents
     where organization_id = ? and profile_id = ? ${jobId ? 'and job_id = ?' : ''}
     order by updated_at desc
     limit 200`,
    jobId ? [orgId, profileId, jobId] : [orgId, profileId],
  )
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

export async function saveDocuments(
  db: DbClient,
  orgId: string,
  jobId: string,
  profileId: string,
  documents: Array<{ kind: string; text: string; content: Record<string, unknown>; ats?: unknown; storagePath?: string | null }>,
): Promise<void> {
  for (const doc of documents) {
    const latest = await db.from('application_documents').select('version').eq('organization_id', orgId)
      .eq('job_id', jobId).eq('profile_id', profileId).eq('kind', doc.kind).order('version', { ascending: false }).limit(1)
    const version = ((latest.data?.[0]?.version as number | undefined) ?? 0) + 1
    await db.from('application_documents').insert({
      organization_id: orgId,
      job_id: jobId,
      profile_id: profileId,
      kind: doc.kind,
      version,
      content: doc.content,
      text: doc.text,
      storage_path: doc.storagePath ?? null,
      ats: doc.ats ?? null,
    })
  }
}

export interface PreparedCard {
  id: string
  jobId: string
  profileId: string
  title: string
  company: string | null
  matchScore: number | null
  matchCategory: string | null
  documentQuality: number | null
  jobMatch: number | null
  readiness: number | null
  status: string
  createdAt: string
  documents: Array<Record<string, unknown>>
}

export async function listPreparedJobs(db: DbClient, orgId: string, profileId?: string): Promise<PreparedCard[]> {
  const result = await db.raw!<Array<Record<string, unknown>>>(
    `select p.id, p.job_id, p.profile_id, p.match_score, p.match_category, p.status, p.created_at,
            p.documents, p.assessment, j.title, j.company
     from prepared_jobs p
     join jobs j on j.id = p.job_id
     where p.organization_id = ? ${profileId ? 'and p.profile_id = ?' : ''}
     order by p.created_at desc limit 100`,
    profileId ? [orgId, profileId] : [orgId],
  )
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []).map((row) => {
    const assessment = row.assessment as { documentQuality?: { score?: number }; jobMatch?: { score?: number }; readiness?: number } | null
    return {
      id: String(row.id),
      jobId: String(row.job_id),
      profileId: String(row.profile_id),
      title: String(row.title ?? ''),
      company: (row.company as string | null) ?? null,
      matchScore: (row.match_score as number | null) ?? null,
      matchCategory: (row.match_category as string | null) ?? null,
      documentQuality: assessment?.documentQuality?.score ?? null,
      jobMatch: assessment?.jobMatch?.score ?? null,
      readiness: assessment?.readiness ?? null,
      status: String(row.status ?? 'ready'),
      createdAt: String(row.created_at ?? ''),
      documents: Array.isArray(row.documents) ? row.documents as Array<Record<string, unknown>> : [],
    }
  })
}

export interface SourceHealthRow {
  id: string
  name: string
  kind: string
  enabled: boolean
  interval_secs: number
  cursor: string | null
  last_run_at: string | null
  last_ok_at: string | null
  last_error: string | null
  consecutive_failures: number
  jobCount: number
}

export interface JobsFeedStatus {
  /** Last successful source run across every enabled source. */
  lastSyncAt: string | null
  /** Last attempt, success or failure — shown when it is more recent. */
  lastRunAt: string | null
  activeSources: number
}

/**
 * The honest freshness stamp for the feed header. `last_ok_at` is a completed
 * successful fetch; a failed attempt must never be presented as a sync.
 */
export async function getJobsFeedStatus(db: DbClient): Promise<JobsFeedStatus> {
  const result = await db.raw!<Array<{ last_sync_at: string | null; last_run_at: string | null; active_sources: number }>>(
    `select max(last_ok_at) as last_sync_at,
            max(last_run_at) as last_run_at,
            count(*) filter (where enabled)::int as active_sources
       from job_sources`,
    [],
  )
  if (result.error) throw new Error(result.error.message)
  const row = result.data?.[0]
  return {
    lastSyncAt: row?.last_sync_at ?? null,
    lastRunAt: row?.last_run_at ?? null,
    activeSources: Number(row?.active_sources ?? 0),
  }
}

export async function listSources(db: DbClient): Promise<SourceHealthRow[]> {
  const result = await db.raw!<SourceHealthRow[]>(
    `select s.*, (select count(*) from jobs j where j.source_id = s.id) as "jobCount"
     from job_sources s order by s.id`,
    [],
  )
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

export interface ProfileRecommendation {
  profileId: string
  name: string
  headline: string | null
  score: number
  category: string
  explanation: string | null
  reason: string
}

export async function recommendProfilesForJob(
  db: DbClient,
  orgId: string,
  jobId: string,
  limit = 5,
  allowedProfileIds?: string[],
): Promise<ProfileRecommendation[]> {
  const jobRow = await db.raw!<JobRow[]>('select * from jobs where id = ? limit 1', [jobId])
  if (jobRow.error || !jobRow.data?.[0]) return []
  const job = rowToDiscoveryJob(jobRow.data[0])
  const profiles = await db.from('profiles').select('*').eq('organization_id', orgId).limit(100)
  if (profiles.error) throw new Error(profiles.error.message)
  const rows = (profiles.data ?? []) as Array<Record<string, unknown>>
  const allowed = allowedProfileIds ? new Set(allowedProfileIds) : null
  const results: ProfileRecommendation[] = []
  for (const row of rows) {
    const profileId = String(row.id)
    if (allowed && !allowed.has(profileId)) continue
    const evidence = await loadProfileEvidence(db, profileId)
    const match = computeJobMatch(job, {
      profileId,
      headline: (row.headline as string | null) ?? null,
      location: (row.location as string | null) ?? null,
      timezone: 'UTC',
      preferredEngagementTypes: Array.isArray(row.preferred_engagement_types) ? row.preferred_engagement_types as string[] : [],
      evidence,
    }, job.verificationStatus)
    await db.from('job_matches').upsert(
      {
        organization_id: orgId,
        job_id: jobId,
        profile_id: profileId,
        score: match.score,
        category: match.category,
        breakdown: match.breakdown,
        evidence: match.evidence,
        explanation: match.explanation,
        score_version: MATCH_SCORE_VERSION,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,job_id,profile_id' },
    )
    const missing = (match.evidence.missingSkills ?? []).slice(0, 2)
    results.push({
      profileId,
      name: (row.display_name as string | null) ?? (row.full_name as string | null) ?? (row.label as string | null) ?? 'Profile',
      headline: (row.headline as string | null) ?? null,
      score: match.score,
      category: match.category,
      explanation: match.explanation,
      reason: missing.length > 0 ? `Missing: ${missing.join(', ')}` : match.explanation,
    })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}

export async function saveJobFilter(
  db: DbClient,
  orgId: string,
  repId: string,
  name: string,
  filters: JobFilters,
): Promise<string | null> {
  const result = await db.from('saved_job_filters').insert({
    organization_id: orgId,
    rep_id: repId,
    name,
    filters,
  }).select('id').single()
  if (result.error) throw new Error(result.error.message)
  return (result.data?.id as string) ?? null
}

export async function listJobFilters(db: DbClient, orgId: string, repId: string): Promise<Array<Record<string, unknown>>> {
  const result = await db.from('saved_job_filters').select('*')
    .eq('organization_id', orgId).eq('rep_id', repId).order('created_at', { ascending: false }).limit(50)
  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []) as Array<Record<string, unknown>>
}

export async function deleteJobFilter(db: DbClient, orgId: string, repId: string, id: string): Promise<void> {
  const result = await db.from('saved_job_filters').delete()
    .eq('organization_id', orgId).eq('rep_id', repId).eq('id', id)
  if (result.error) throw new Error(result.error.message)
}

export async function updateSource(db: DbClient, sourceId: string, patch: { enabled?: boolean; config?: Record<string, unknown>; intervalSecs?: number }): Promise<void> {
  const values: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof patch.enabled === 'boolean') values.enabled = patch.enabled
  if (patch.config) values.config = patch.config
  if (typeof patch.intervalSecs === 'number') values.interval_secs = Math.max(60, Math.round(patch.intervalSecs))
  const result = await db.from('job_sources').update(values).eq('id', sourceId)
  if (result.error) throw new Error(result.error.message)
}

type Row = Record<string, unknown> & { rep_id?: string | null }
