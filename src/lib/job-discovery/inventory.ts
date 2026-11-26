import type { DbClient } from '@/lib/db/types'
import type { JobEligibility } from './eligibility'
import { classifyRemoteEligibility } from './eligibility'
import { extractJobRequirements } from './requirements'

export interface InventoryJob {
  id: string
  source_id: string
  company: string | null
  title: string
  description?: string | null
  location_raw?: string | null
  remote?: boolean
  skills: string[] | null
  employment_type: string | null
  posted_at: string | null
  last_seen_at: string | null
  last_verified_at: string | null
  verification_status: string
  closed_at: string | null
  duplicate_group_id: string | null
  apply_url: string | null
  source_url: string | null
  eligibility: JobEligibility | null
  requirements?: unknown
  quality_classification?: string | null
}

const ENGINEERING = /engineer|software|developer|devops|sre|site reliability|data|machine learning|security|backend|frontend|full.?stack|mobile|qa|test automation|architect/i
const SALES = /account executive|sales|business development|sdr|account manager/i

function daysBetween(value: string, now: Date): number {
  const ms = now.getTime() - new Date(value).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

function categoryFor(title: string): string {
  if (ENGINEERING.test(title)) return 'engineering'
  if (SALES.test(title)) return 'sales'
  if (/design|product|ux|ui/i.test(title)) return 'design_product'
  if (/support|customer|operations|admin|marketing|finance|hr|legal/i.test(title)) return 'operations'
  return 'other'
}

function applyUrlQuality(url: string | null): string {
  if (!url) return 'missing'
  const lower = url.toLowerCase()
  if (/(greenhouse|lever|ashby|smartrecruiters|workable|recruitee|workday)/.test(lower)) return 'ats'
  if (/(remoteok|remotive|himalayas|jobicy|arbeitnow)/.test(lower)) return 'feed'
  try {
    const host = new URL(url).hostname
    if (host.startsWith('localhost') || host === '127.0.0.1' || /^\d+\./.test(host)) return 'private_host'
    return 'employer'
  } catch {
    return 'invalid'
  }
}

export function bucketFor(job: InventoryJob, canonical: boolean, now: Date): { bucket: string; reason: string; include: boolean } {
  if (job.quality_classification === 'suspected_scam') {
    return { bucket: 'quarantined', reason: 'Conservative quality screen flagged this listing for review.', include: false }
  }
  if (job.closed_at || job.verification_status === 'closed' || job.verification_status === 'expired') {
    return { bucket: 'closed', reason: 'Closed or expired at the source', include: false }
  }
  if (!canonical) {
    return { bucket: 'duplicate', reason: 'Superseded by the canonical duplicate listing', include: false }
  }
  if (job.remote === false) {
    return { bucket: 'not_remote', reason: 'The source does not offer this role remotely', include: false }
  }
  const age = job.posted_at ? daysBetween(job.posted_at, now) : null
  const verifiedAge = job.last_verified_at ? daysBetween(job.last_verified_at, now) : null
  const seenAge = job.last_seen_at ? daysBetween(job.last_seen_at, now) : null
  const stale =
    (age !== null && age > 60) ||
    (job.verification_status === 'verified_open' && (verifiedAge === null || verifiedAge > 14)) ||
    (job.verification_status !== 'verified_open' && seenAge !== null && seenAge > 14)
  if (stale) {
    return { bucket: 'stale_unverified', reason: 'Older than 60 days or verification/seeing older than 14 days', include: false }
  }
  const pakistan = job.eligibility?.pakistan
  if (pakistan?.eligible === false && pakistan.confidence === 'confirmed') {
    return { bucket: 'location_restricted', reason: 'Pakistan is excluded by the posting', include: false }
  }
  if (pakistan?.eligible === null) {
    return { bucket: 'eligibility_unknown', reason: 'Eligibility is not established by the posting', include: true }
  }
  const relevant = ENGINEERING.test(job.title)
  if (pakistan?.eligible === true && job.remote && job.verification_status === 'verified_open' && relevant && age !== null && age <= 90) {
    return { bucket: 'recommended', reason: 'Verified open, Pakistan-eligible, engineering role, published in the last 90 days', include: true }
  }
  return { bucket: 'eligible_low', reason: 'Eligible but not a strong/verified engineering match', include: true }
}

export interface ReindexOptions {
  sourceIds?: string[]
  now?: Date
  dryRun?: boolean
}

export interface ReindexResult {
  jobs: number
  buckets: Record<string, number>
  included: number
  dryRun: boolean
}

/** Recompute the non-destructive feed index. No job row is modified or deleted. */
// shortcut: loads every job (with description) into memory; fine below ~50k rows, shard by source_id if the table outgrows the timer memory cap.
export async function reindexJobInventory(db: DbClient, options: ReindexOptions = {}): Promise<ReindexResult> {
  const now = options.now ?? new Date()
  const jobs = await db.raw!<InventoryJob[]>(
    `select id, source_id, company, title, description, location_raw, remote, skills, employment_type,
            posted_at, last_seen_at, last_verified_at, verification_status, closed_at,
            duplicate_group_id, apply_url, source_url, eligibility, requirements,
            quality_classification
     from jobs
     where (?::text[] is null or source_id = any(?::text[]))`,
    [options.sourceIds ?? null, options.sourceIds ?? null],
  )
  if (jobs.error) throw new Error(jobs.error.message)

  const groups = await db.raw!<Array<{ duplicate_group_id: string; canonical_id: string }>>(
    `select distinct on (duplicate_group_id) duplicate_group_id, id as canonical_id
     from jobs where duplicate_group_id is not null
     order by duplicate_group_id, id`,
    [],
  )
  if (groups.error) throw new Error(groups.error.message)
  const canonical = new Set(groups.data?.map((row) => row.canonical_id) ?? [])

  const buckets: Record<string, number> = {}
  let included = 0
  const rows: Array<Record<string, unknown>> = []
  const jobUpdates: Array<{ id: string; eligibility: string; requirements: string }> = []

  for (const job of jobs.data ?? []) {
    const isCanonical = job.duplicate_group_id == null || canonical.has(job.id)
    // Recompute so newly added eligibility dimensions (e.g. Pakistan) and
    // requirements reach existing inventory without a full re-ingest.
    const eligibility = classifyRemoteEligibility({
      title: job.title,
      description: job.description ?? '',
      locationRaw: job.location_raw,
      remote: Boolean(job.remote),
    })
    const requirements = extractJobRequirements({
      id: job.id,
      sourceId: job.source_id,
      sourceJobId: job.id,
      title: job.title,
      company: job.company ?? undefined,
      locationRaw: job.location_raw ?? undefined,
      remote: Boolean(job.remote),
      description: job.description ?? '',
      skills: Array.isArray(job.skills) ? job.skills : [],
      employmentType: job.employment_type ?? undefined,
    })
    const eligibilityJson = JSON.stringify(eligibility)
    const requirementsJson = JSON.stringify(requirements)
    const previousEligibility = job.eligibility ? JSON.stringify(job.eligibility) : null
    const previousRequirements = job.requirements ? JSON.stringify(job.requirements) : null
    if (previousEligibility !== eligibilityJson || previousRequirements !== requirementsJson) {
      jobUpdates.push({ id: job.id, eligibility: eligibilityJson, requirements: requirementsJson })
    }
    const result = bucketFor({ ...job, eligibility }, isCanonical, now)
    buckets[result.bucket] = (buckets[result.bucket] ?? 0) + 1
    if (result.include) included++
    const age = job.posted_at ? daysBetween(job.posted_at, now) : null
    rows.push({
      job_id: job.id,
      source_id: job.source_id,
      employer: job.company,
      category: categoryFor(job.title),
      profile_relevance: ENGINEERING.test(job.title) ? 'engineering' : SALES.test(job.title) ? 'sales' : 'other',
      skills: Array.isArray(job.skills) ? job.skills : [],
      employment_type: job.employment_type,
      location_restriction: eligibility?.classification ?? 'unknown',
      pakistan_eligibility: eligibility?.pakistan?.classification ?? 'unknown',
      published_at: job.posted_at,
      published_age_days: age,
      last_seen_at: job.last_seen_at,
      last_verified_at: job.last_verified_at,
      verification_status: job.verification_status,
      quality_classification: job.quality_classification ?? null,
      closed_at: job.closed_at,
      duplicate_group_id: job.duplicate_group_id,
      apply_url_quality: applyUrlQuality(job.apply_url),
      feed_bucket: result.bucket,
      include_in_feed: result.include,
      reason: result.reason,
      computed_at: now,
    })
  }

  if (!options.dryRun) {
    for (let index = 0; index < rows.length; index += 100) {
      const chunk = rows.slice(index, index + 100)
      const columns = Object.keys(chunk[0])
      const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')
      const params = chunk.flatMap((row) => columns.map((column) => row[column]))
      const result = await db.raw!(
        `insert into job_inventory_index (${columns.join(', ')}) values ${placeholders}
         on conflict (job_id) do update set ${columns.filter((column) => column !== 'job_id').map((column) => `${column}=excluded.${column}`).join(', ')}`,
        params,
      )
      if (result.error) throw new Error(result.error.message)
    }
  }

  if (!options.dryRun && jobUpdates.length > 0) {
    for (let index = 0; index < jobUpdates.length; index += 100) {
      const chunk = jobUpdates.slice(index, index + 100)
      const placeholders = chunk.map(() => '(?, ?, ?)').join(', ')
      const params = chunk.flatMap((update) => [update.id, update.eligibility, update.requirements])
      const result = await db.raw!(
        `update jobs set eligibility = data.eligibility::jsonb, requirements = data.requirements::jsonb, updated_at = now()
         from (values ${placeholders}) as data(id, eligibility, requirements)
         where jobs.id = data.id::uuid`,
        params,
      )
      if (result.error) throw new Error(result.error.message)
    }
  }

  return { jobs: (jobs.data ?? []).length, buckets, included, dryRun: Boolean(options.dryRun) }
}

export async function getInventorySummary(db: DbClient): Promise<Record<string, number>> {
  const rows = await db.raw!<Array<{ feed_bucket: string; n: number }>>(
    `select feed_bucket, count(*)::int as n from job_inventory_index group by feed_bucket order by feed_bucket`,
    [],
  )
  if (rows.error) throw new Error(rows.error.message)
  return Object.fromEntries((rows.data ?? []).map((row) => [row.feed_bucket, row.n]))
}

export interface JobRetentionReport {
  generatedAt: string
  counts: {
    total: number
    active: number
    recommended: number
    prepared: number
    applied: number
    stale: number
    closed: number
    duplicated: number
    archived: number
    referencedByApplications: number
    eligibleForCleanup: number
  }
  buckets: Record<string, number>
  /** A small sample of the safest cleanup candidates, for human review. */
  cleanupSample: Array<{ id: string; title: string; company: string | null; reason: string }>
}

/**
 * Read-only retention/maintenance report.
 *
 * Nothing is deleted or hidden here. It answers "what would a retention pass
 * touch?" with counts and a sample, so an operator can confirm the policy before
 * any automated archival runs. Source outages never close a job: only an
 * explicit `closed`/`expired` verification state does.
 */
export async function buildRetentionReport(db: DbClient, sampleLimit = 20): Promise<JobRetentionReport> {
  const generatedAt = new Date().toISOString()
  // One round trip for every count: the Aiven pool is the bottleneck, and nine
  // parallel COUNTs per report needlessly contend for it.
  const countsResult = await db.raw!<Array<{
    total: number
    active: number
    prepared: number
    applied: number
    closed: number
    duplicated: number
    archived: number
    referenced: number
    eligible: number
  }>>(
    `select
       (select count(*) from jobs) as total,
       (select count(*) from jobs where verification_status not in ('closed','expired','source_unavailable')) as active,
       (select count(*) from prepared_jobs where status in ('ready','needs_review')) as prepared,
       (select count(*) from jobs j where exists (select 1 from applications a where a.job_id = j.id)) as applied,
       (select count(*) from jobs where verification_status in ('closed','expired')) as closed,
       (select count(*) from job_inventory_index where feed_bucket = 'duplicate') as duplicated,
       (select count(*) from jobs where verification_status = 'archived') as archived,
       (select count(*) from jobs j where exists (select 1 from applications a where a.job_id = j.id)) as referenced,
       (select count(*) from jobs j
         where j.verification_status not in ('closed','expired')
           and not exists (select 1 from applications a where a.job_id = j.id)
           and not exists (select 1 from saved_jobs s where s.job_id = j.id)
           and exists (select 1 from job_inventory_index ii where ii.job_id = j.id and ii.feed_bucket in ('stale_unverified','duplicate'))
       ) as eligible`,
    [],
  )
  if (countsResult.error) throw new Error(countsResult.error.message)
  const row = (countsResult.data ?? [])[0] ?? {
    total: 0, active: 0, prepared: 0, applied: 0, closed: 0,
    duplicated: 0, archived: 0, referenced: 0, eligible: 0,
  }

  const bucketRows = await db.raw!<Array<{ feed_bucket: string; n: number }>>(
    `select feed_bucket, count(*)::int as n from job_inventory_index group by feed_bucket`,
    [],
  )
  if (bucketRows.error) throw new Error(bucketRows.error.message)
  const buckets: Record<string, number> = {}
  for (const bucket of bucketRows.data ?? []) buckets[bucket.feed_bucket] = Number(bucket.n)

  const sample = await db.raw!<Array<{ id: string; title: string; company: string | null; reason: string }>>(
    `select j.id, j.title, j.company, ii.reason
     from jobs j join job_inventory_index ii on ii.job_id = j.id
     where ii.feed_bucket in ('stale_unverified','duplicate')
       and not exists (select 1 from applications a where a.job_id = j.id)
       and not exists (select 1 from saved_jobs s where s.job_id = j.id)
     order by j.posted_at desc nulls last
     limit ?`,
    [sampleLimit],
  )
  if (sample.error) throw new Error(sample.error.message)

  return {
    generatedAt,
    counts: {
      total: Number(row.total),
      active: Number(row.active),
      recommended: buckets['recommended'] ?? 0,
      prepared: Number(row.prepared),
      applied: Number(row.applied),
      stale: buckets['stale_unverified'] ?? 0,
      closed: Number(row.closed),
      duplicated: Number(row.duplicated),
      archived: Number(row.archived),
      referencedByApplications: Number(row.referenced),
      eligibleForCleanup: Number(row.eligible),
    },
    buckets,
    cleanupSample: sample.data ?? [],
  }
}
