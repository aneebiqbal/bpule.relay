/**
 * Job Intelligence v2 — incremental ingestion.
 *
 * One worker instance at a time (expiring lock), bounded sources per run,
 * idempotent upserts on (source_id, source_job_id), and a hard rule: a failed
 * source fetch never marks jobs closed. A job only becomes closed/expired when
 * the source explicitly says so or a parsed expiry date has passed.
 */

import { createHash } from 'node:crypto'
import { createServiceSupabase } from '@/lib/supabase/service'
import type { DbClient } from '@/lib/db/types'
import { adapterFor } from './adapters'
import { classifyRemoteEligibility } from './eligibility'
import { isSafeApplicationUrl } from './url'
import { screenJobQuality } from './quality'
import type { DiscoveryJob, IngestionSummary } from './types'

const LOCK_KEY = 'job-discovery-v2'
const LOCK_TTL_MS = 10 * 60 * 1000
const MAX_FAILURES_BEFORE_DISABLE = 10
const EVIDENCE_LIMIT = 20

export interface RunOptions {
  sourceIds?: string[]
  maxSources?: number
  timeoutMs?: number
  fetchFn?: typeof fetch
  now?: Date
  /**
   * Ignore each source's polling interval. Manual "Sync Now" uses this so a
   * refresh really re-reads the enabled sources; scheduled ticks stay
   * interval-bound to respect provider rate limits.
   */
  force?: boolean
}

export interface RunResult {
  ok: boolean
  /** True when another worker held the lock. */
  locked?: boolean
  summaries: IngestionSummary[]
}

interface SourceRow {
  id: string
  kind: string
  config: Record<string, unknown>
  cursor: string | null
  interval_secs: number
}

interface ExistingJob {
  id: string
  source_job_id: string
  content_hash: string | null
  verification_evidence: unknown
  duplicate_group_id: string | null
  content_changed_at: string | null
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function ensureResult(result: { error?: { message: string } | null }, label: string): void {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
}

function slug(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function dedupeKey(job: DiscoveryJob): string | null {
  const title = slug(job.title)
  const company = slug(job.company)
  if (!title || !company) return null
  return `${title}|${company}`
}

async function acquireLock(db: DbClient, now: Date): Promise<boolean> {
  const expires = new Date(now.getTime() + LOCK_TTL_MS)
  await db.raw!('delete from job_discovery_locks where lock_key = ? and expires_at < ?', [LOCK_KEY, now])
  const result = await db.raw!(
    'insert into job_discovery_locks (lock_key, acquired_at, expires_at) values (?, ?, ?) on conflict (lock_key) do nothing returning lock_key',
    [LOCK_KEY, now, expires],
  )
  return Array.isArray(result.data) && result.data.length > 0
}

async function releaseLock(db: DbClient): Promise<void> {
  await db.raw!('delete from job_discovery_locks where lock_key = ?', [LOCK_KEY])
}

async function loadDueSources(
  db: DbClient,
  sourceIds: string[] | undefined,
  maxSources: number,
  now: Date,
  ignoreInterval = false,
): Promise<SourceRow[]> {
  const result = await db.raw!<SourceRow[]>(
    `select id, kind, config, cursor, interval_secs
     from job_sources
     where enabled = true
       and (?::text[] is null or id = any(?::text[]))
       and (?::boolean or last_run_at is null or last_run_at <= (?::timestamptz - (interval_secs || ' seconds')::interval))
     order by last_run_at asc nulls first
     limit ?`,
    [sourceIds ?? null, sourceIds ?? null, ignoreInterval, now, maxSources],
  )
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

export async function runJobDiscovery(options: RunOptions = {}): Promise<RunResult> {
  const db = createServiceSupabase()
  const now = options.now ?? new Date()
  if (!(await acquireLock(db, now))) {
    return { ok: false, locked: true, summaries: [] }
  }
  try {
    const sources = await loadDueSources(db, options.sourceIds, options.maxSources ?? 4, now, options.force === true)
    const summaries: IngestionSummary[] = []
    for (const source of sources) {
      summaries.push(await runSource(db, source, options))
    }
    // Bound history growth. Jobs themselves are never auto-closed by age.
    await db.raw!('delete from source_snapshots where captured_at < ?', [new Date(now.getTime() - 30 * 86_400_000)])
    await db.raw!('delete from ingestion_runs where started_at < ?', [new Date(now.getTime() - 90 * 86_400_000)])
    return { ok: true, summaries }
  } finally {
    await releaseLock(db)
  }
}

async function runSource(db: DbClient, source: SourceRow, options: RunOptions): Promise<IngestionSummary> {
  const now = options.now ?? new Date()
  const adapter = adapterFor(String(source.config.adapter ?? source.id))
  if (!adapter) {
    return { sourceId: source.id, status: 'failed', found: 0, inserted: 0, updated: 0, expired: 0, error: 'No adapter registered.' }
  }

  const run = await db.raw!<{ id: string }[]>(
    `insert into ingestion_runs (source_id, started_at, status) values (?, ?, 'running') returning id`,
    [source.id, now],
  )
  const runId = run.data?.[0]?.id
  const base: IngestionSummary = { sourceId: source.id, status: 'ok', found: 0, inserted: 0, updated: 0, expired: 0 }

  try {
    const configuredTimeout = Number(source.config.timeout_ms)
    const result = await adapter({
      config: source.config,
      cursor: source.cursor,
      timeoutMs: Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : (options.timeoutMs ?? 8000),
      fetchFn: options.fetchFn ?? fetch,
    })

    const outcome = await upsertJobs(db, source, result.jobs, now)
    await linkDuplicates(db, result.jobs)
    await db.raw!(
      `update ingestion_runs
       set finished_at = ?, status = ?, jobs_found = ?, jobs_inserted = ?, jobs_updated = ?, jobs_expired = ?,
           metadata = ?
       where id = ?`,
      [new Date(), 'ok', result.jobs.length, outcome.inserted, outcome.updated, outcome.expired, '{}', runId],
    )
    await db.raw!(
      `insert into source_snapshots (ingestion_run_id, source_id, url, http_status, etag, last_modified, content_hash)
       values (?, ?, ?, ?, ?, ?, ?)`,
      [runId, source.id, result.snapshot.url, result.snapshot.httpStatus, result.snapshot.etag ?? null, result.snapshot.lastModified ?? null, result.snapshot.contentHash],
    )
    await db.raw!(
      `update job_sources
       set last_run_at = ?, last_ok_at = ?, cursor = ?, last_error = null, consecutive_failures = 0, updated_at = ?
       where id = ?`,
      [new Date(), new Date(), result.cursor, new Date(), source.id],
    )
    return { ...base, found: result.jobs.length, ...outcome, cursor: result.cursor }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown ingestion failure'
    await db.raw!(
      `update ingestion_runs set finished_at = ?, status = 'failed', error = ? where id = ?`,
      [new Date(), message, runId],
    )
    const failure = await db.raw!<{ consecutive_failures: number; enabled: boolean }[]>(
      `update job_sources
       set last_run_at = ?, last_error = ?, consecutive_failures = consecutive_failures + 1,
           enabled = case when consecutive_failures + 1 >= ${MAX_FAILURES_BEFORE_DISABLE} then false else enabled end,
           updated_at = ?
       where id = ?
       returning consecutive_failures, enabled`,
      [new Date(), message, new Date(), source.id],
    )
    const state = failure.data?.[0]
    return {
      ...base,
      status: 'failed',
      error: state?.enabled === false ? `${message} (source auto-disabled after repeated failures)` : message,
    }
  }
}

async function upsertJobs(
  db: DbClient,
  source: SourceRow,
  jobs: DiscoveryJob[],
  now: Date,
): Promise<{ inserted: number; updated: number; expired: number }> {
  const existingResult = await db.raw!<ExistingJob[]>(
    `select id, source_job_id, content_hash, verification_evidence, duplicate_group_id, content_changed_at
     from jobs where source_id = ?`,
    [source.id],
  )
  if (existingResult.error) throw new Error(existingResult.error.message)
  const existing = new Map((existingResult.data ?? []).map((row) => [row.source_job_id, row]))

  let inserted = 0
  let updated = 0
  let expired = 0
  const verifiedStatus = source.kind === 'ats' ? 'verified_open' : 'recently_seen'
  const rows: Array<Record<string, unknown>> = []

  for (const job of jobs) {
    if (!job.title || !job.sourceJobId) continue
    const eligibility = classifyRemoteEligibility({
      title: job.title,
      description: job.description,
      locationRaw: job.locationRaw,
      remote: job.remote,
    })
    const contentHash = hash({
      title: job.title,
      company: job.company,
      location: job.locationRaw,
      description: job.description,
      skills: job.skills,
      salary: [job.salaryMin, job.salaryMax, job.salaryCurrency],
      employmentType: job.employmentType,
      applyUrl: job.applyUrl,
    })
    // Conservative deterministic screen. A suspected scam is quarantined by the
    // feed projection; it is never deleted or silently dropped.
    const quality = screenJobQuality({
      title: job.title,
      company: job.company ?? null,
      description: job.description,
      applyUrl: isSafeApplicationUrl(job.applyUrl) ? (job.applyUrl ?? null) : null,
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      sourceId: source.id,
    })
    const key = dedupeKey(job)
    const previous = existing.get(job.sourceJobId)
    const evidence = appendEvidence(previous?.verification_evidence, {
      at: now.toISOString(),
      type: previous ? (previous.content_hash && previous.content_hash !== contentHash ? 'content_changed' : 'seen') : 'first_seen',
      source_id: source.id,
      source_url: job.sourceUrl ?? job.applyUrl ?? null,
      http_status: 200,
    })
    if (previous) updated++
    else inserted++
    if (job.expiresAt && new Date(job.expiresAt).getTime() < now.getTime()) expired++

    rows.push({
      source_id: source.id,
      source_job_id: job.sourceJobId,
      title: job.title,
      company: job.company ?? null,
      company_logo: job.companyLogo ?? null,
      location_raw: job.locationRaw ?? null,
      country: eligibility.countries[0] ?? null,
      remote: job.remote,
      hybrid: job.hybrid ?? false,
      onsite: job.onsite ?? false,
      employment_type: job.employmentType ?? null,
      seniority: job.seniority ?? null,
      salary_min: job.salaryMin ?? null,
      salary_max: job.salaryMax ?? null,
      salary_currency: job.salaryCurrency ?? null,
      salary_period: job.salaryPeriod ?? null,
      salary_raw: job.salaryRaw ?? null,
      description: job.description ?? '',
      excerpt: job.excerpt ?? null,
      skills: job.skills ?? [],
      categories: job.categories ?? [],
      posted_at: job.postedAt ?? null,
      expires_at: job.expiresAt ?? null,
      apply_url: isSafeApplicationUrl(job.applyUrl) ? job.applyUrl : null,
      source_url: isSafeApplicationUrl(job.sourceUrl) ? job.sourceUrl : null,
      // pg serializes JS arrays as Postgres array literals, which are not valid
      // JSON. jsonb columns must be handed a string explicitly.
      attribution: job.attribution ? JSON.stringify(job.attribution) : null,
      raw: job.raw === undefined || job.raw === null ? null : JSON.stringify(job.raw),
      eligibility: JSON.stringify(eligibility),
      quality_classification: quality.classification,
      quality_reasons: JSON.stringify(quality.reasons),
      verification_status: verifiedStatus,
      verification_evidence: JSON.stringify(evidence),
      first_seen_at: now,
      last_seen_at: now,
      last_checked_at: now,
      last_verified_at: source.kind === 'ats' ? now : null,
      content_hash: contentHash,
      content_changed_at: previous && previous.content_hash !== contentHash ? now : (previous?.content_changed_at ?? null),
      source_updated_at: now,
      dedupe_key: key,
      updated_at: now,
    })
  }

  const columns = [
    'source_id', 'source_job_id', 'title', 'company', 'company_logo', 'location_raw', 'country',
    'remote', 'hybrid', 'onsite', 'employment_type', 'seniority',
    'salary_min', 'salary_max', 'salary_currency', 'salary_period', 'salary_raw',
    'description', 'excerpt', 'skills', 'categories', 'posted_at', 'expires_at',
    'apply_url', 'source_url', 'attribution', 'raw', 'eligibility',
    'quality_classification', 'quality_reasons',
    'verification_status', 'verification_evidence', 'first_seen_at', 'last_seen_at',
    'last_checked_at', 'last_verified_at', 'content_hash', 'content_changed_at', 'source_updated_at',
    'dedupe_key', 'updated_at',
  ]
  const updateSet = [
    'title=excluded.title', 'company=excluded.company', 'company_logo=excluded.company_logo',
    'location_raw=excluded.location_raw', 'country=excluded.country', 'remote=excluded.remote',
    'hybrid=excluded.hybrid', 'onsite=excluded.onsite', 'employment_type=excluded.employment_type',
    'seniority=excluded.seniority', 'salary_min=excluded.salary_min', 'salary_max=excluded.salary_max',
    'salary_currency=excluded.salary_currency', 'salary_period=excluded.salary_period',
    'salary_raw=excluded.salary_raw', 'description=excluded.description', 'excerpt=excluded.excerpt',
    'skills=excluded.skills', 'categories=excluded.categories', 'posted_at=excluded.posted_at',
    'expires_at=excluded.expires_at', 'apply_url=excluded.apply_url', 'source_url=excluded.source_url',
    'attribution=excluded.attribution', 'raw=excluded.raw', 'eligibility=excluded.eligibility',
    'quality_classification=excluded.quality_classification', 'quality_reasons=excluded.quality_reasons',
    // A source still returning a listing does not reopen one that verification
    // confirmed closed/expired. Only changed content earns a fresh evaluation;
    // otherwise a 404-closed job would silently re-enter the active feed.
    `verification_status=case
       when jobs.verification_status in ('closed','expired')
        and jobs.content_hash is not distinct from excluded.content_hash
       then jobs.verification_status
       else excluded.verification_status
     end`,
    'verification_evidence=excluded.verification_evidence',
    'last_seen_at=excluded.last_seen_at', 'last_checked_at=excluded.last_checked_at',
    'last_verified_at=coalesce(excluded.last_verified_at, jobs.last_verified_at)',
    'content_hash=excluded.content_hash',
    'content_changed_at=case when jobs.content_hash is distinct from excluded.content_hash then excluded.updated_at else jobs.content_changed_at end',
    'source_updated_at=excluded.source_updated_at',
    'dedupe_key=excluded.dedupe_key', 'updated_at=excluded.updated_at',
  ].join(', ')

  const chunkSize = 200
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const placeholders = chunk.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')
    const params = chunk.flatMap((row) => columns.map((column) => row[column]))
    const result = await db.raw!(
      `insert into jobs (${columns.join(', ')}) values ${placeholders}
       on conflict (source_id, source_job_id) do update set ${updateSet}
       returning id, source_job_id`,
      params,
    )
    ensureResult(result, 'upsert jobs')
  }

  if (expired > 0) {
    const result = await db.raw!(
      `update jobs set verification_status = 'expired', closed_at = coalesce(closed_at, ?), updated_at = ?
       where source_id = ? and expires_at < ? and verification_status <> 'expired'`,
      [now, now, source.id, now],
    )
    ensureResult(result, 'expire jobs')
  }

  return { inserted, updated, expired }
}

function appendEvidence(existing: unknown, entry: Record<string, unknown>): unknown[] {
  const list = Array.isArray(existing) ? [...existing] : []
  list.push(entry)
  return list.slice(-EVIDENCE_LIMIT)
}

/**
 * Link the same real-world job listed on multiple sources. The canonical job
 * is the earliest one; the group is stable across runs.
 */
async function linkDuplicates(db: DbClient, jobs: DiscoveryJob[]): Promise<void> {
  const keys = [...new Set(jobs.map(dedupeKey).filter((key): key is string => Boolean(key)))]
  if (keys.length === 0) return
  const result = await db.raw!<{ id: string; dedupe_key: string; duplicate_group_id: string | null }[]>(
    `select id, dedupe_key, duplicate_group_id from jobs where dedupe_key = any(?)`,
    [keys],
  )
  if (result.error) return
  const byKey = new Map<string, { id: string; group: string | null }[]>()
  for (const row of result.data ?? []) {
    const list = byKey.get(row.dedupe_key) ?? []
    list.push({ id: row.id, group: row.duplicate_group_id })
    byKey.set(row.dedupe_key, list)
  }

  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue
    const existingGroup = rows.find((row) => row.group)?.group ?? null
    let groupId = existingGroup
    if (!groupId) {
      const canonical = rows.map((row) => row.id).sort()[0]
      const created = await db.raw!<{ id: string }[]>(
        `insert into job_duplicate_groups (canonical_job_id) values (?) returning id`,
        [canonical],
      )
      groupId = created.data?.[0]?.id ?? null
    }
    if (!groupId) continue
    await db.raw!(`update jobs set duplicate_group_id = ?, updated_at = now() where dedupe_key = ?`, [groupId, key])
  }
}
