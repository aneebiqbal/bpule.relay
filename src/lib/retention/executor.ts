/**
 * Safe retention maintenance.
 *
 * Deletes ONLY Class C ephemeral data (expired worker locks, aged fetch
 * snapshots, aged ingestion-run metadata). Protected business history is never
 * a candidate. Every run is dry-runnable first and writes an audit row.
 */

import type { DbClient } from '@/lib/db/types'

export const RETENTION_POLICY = {
  version: 1,
  sourceSnapshotDays: 30,
  ingestionRunDays: 90,
} as const

export interface RetentionSample { id: string; label: string }

export interface RetentionPreview {
  generatedAt: string
  policyVersion: number
  candidates: {
    expiredLocks: number
    sourceSnapshots: number
    ingestionRuns: number
  }
  samples: {
    sourceSnapshots: RetentionSample[]
    ingestionRuns: RetentionSample[]
  }
  protected: {
    /** Reference-only counts proving these classes are excluded by design. */
    jobsWithApplications: number
    savedJobs: number
  }
}

export interface RetentionResult {
  runId: string
  dryRun: boolean
  deleted: { expiredLocks: number; sourceSnapshots: number; ingestionRuns: number }
  status: 'completed' | 'partial' | 'failed'
  error: string | null
}

const BATCH = 500

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

export async function previewRetention(db: DbClient): Promise<RetentionPreview> {
  const [locks, snapshots, runs, appliedJobs, saved] = await Promise.all([
    db.raw!<Array<{ n: number }>>(`select count(*)::int as n from job_discovery_locks where expires_at < now()`, []),
    db.raw!<Array<{ n: number }>>(`select count(*)::int as n from source_snapshots where captured_at < ?`, [daysAgo(RETENTION_POLICY.sourceSnapshotDays)]),
    db.raw!<Array<{ n: number }>>(`select count(*)::int as n from ingestion_runs where started_at < ?`, [daysAgo(RETENTION_POLICY.ingestionRunDays)]),
    db.raw!<Array<{ n: number }>>(`select count(*)::int as n from jobs j where exists (select 1 from applications a where a.job_id = j.id)`, []),
    db.raw!<Array<{ n: number }>>(`select count(*)::int as n from saved_jobs`, []),
  ])
  for (const result of [locks, snapshots, runs, appliedJobs, saved]) {
    if (result.error) throw new Error(result.error.message)
  }
  const sampleSnapshots = await db.raw!<Array<{ id: string; source_id: string }>>(
    `select id, source_id from source_snapshots where captured_at < ? order by captured_at asc limit 5`,
    [daysAgo(RETENTION_POLICY.sourceSnapshotDays)],
  )
  const sampleRuns = await db.raw!<Array<{ id: string; source_id: string; started_at: string }>>(
    `select id, source_id, started_at from ingestion_runs where started_at < ? order by started_at asc limit 5`,
    [daysAgo(RETENTION_POLICY.ingestionRunDays)],
  )
  return {
    generatedAt: new Date().toISOString(),
    policyVersion: RETENTION_POLICY.version,
    candidates: {
      expiredLocks: Number(locks.data?.[0]?.n ?? 0),
      sourceSnapshots: Number(snapshots.data?.[0]?.n ?? 0),
      ingestionRuns: Number(runs.data?.[0]?.n ?? 0),
    },
    samples: {
      sourceSnapshots: (sampleSnapshots.data ?? []).map((row) => ({ id: String(row.id), label: String(row.source_id) })),
      ingestionRuns: (sampleRuns.data ?? []).map((row) => ({ id: String(row.id), label: `${row.source_id} @ ${row.started_at}` })),
    },
    protected: {
      jobsWithApplications: Number(appliedJobs.data?.[0]?.n ?? 0),
      savedJobs: Number(saved.data?.[0]?.n ?? 0),
    },
  }
}

async function deleteBatched(db: DbClient, table: string, keyColumn: string, where: string, params: unknown[]): Promise<number> {
  let total = 0
  for (let guard = 0; guard < 1000; guard++) {
    const result = await db.raw!<Array<Record<string, unknown>>>(
      `delete from ${table} where ${keyColumn} in (select ${keyColumn} from ${table} where ${where} limit ${BATCH}) returning ${keyColumn}`,
      params,
    )
    if (result.error) throw new Error(result.error.message)
    const removed = result.data?.length ?? 0
    total += removed
    if (removed < BATCH) break
  }
  return total
}

/**
 * Execute the policy. Requires an explicit non-dry-run flag from an admin;
 * otherwise it only previews.
 */
export async function executeRetention(
  db: DbClient,
  input: { dryRun?: boolean; actorRepId: string; organizationId: string },
): Promise<RetentionResult> {
  const preview = await previewRetention(db)
  const dryRun = input.dryRun !== false
  const deleted = { expiredLocks: 0, sourceSnapshots: 0, ingestionRuns: 0 }
  let status: RetentionResult['status'] = 'completed'
  let error: string | null = null
  let runId = ''

  try {
    const inserted = await db
      .from('retention_runs')
      .insert({
        organization_id: input.organizationId,
        requested_by: input.actorRepId,
        dry_run: dryRun,
        policy_version: RETENTION_POLICY.version,
        preview: preview as unknown as Record<string, unknown>,
        status: 'completed',
      })
      .select('id')
      .single()
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? 'Could not record the retention run.')
    runId = String((inserted.data as { id: string }).id)

    if (!dryRun) {
      try {
        deleted.expiredLocks = await deleteBatched(db, 'job_discovery_locks', 'lock_key', 'expires_at < now()', [])
        deleted.sourceSnapshots = await deleteBatched(
          db,
          'source_snapshots',
          'id',
          'captured_at < ?',
          [daysAgo(RETENTION_POLICY.sourceSnapshotDays)],
        )
        deleted.ingestionRuns = await deleteBatched(
          db,
          'ingestion_runs',
          'id',
          'started_at < ?',
          [daysAgo(RETENTION_POLICY.ingestionRunDays)],
        )
      } catch (deleteError) {
        status = 'partial'
        error = deleteError instanceof Error ? deleteError.message : 'Partial failure during cleanup.'
      }
    }

    await db
      .from('retention_runs')
      .update({ status, result: { ...deleted, preview }, error })
      .eq('id', runId)
  } catch (caught) {
    status = 'failed'
    error = caught instanceof Error ? caught.message : 'Retention run failed.'
    if (runId) {
      try {
        await db.from('retention_runs').update({ status, error, result: { ...deleted, preview } }).eq('id', runId)
      } catch {
        // The audit row may be unreachable; the transfer outcome already stands.
      }
    }
  }

  return { runId, dryRun, deleted, status, error }
}
