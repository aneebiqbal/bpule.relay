/**
 * Manual Jobs synchronization requests.
 *
 * The Sync Now button never crawls in the request handler. It enqueues one
 * durable, organization-scoped run; the scheduled discovery worker executes it
 * on its next tick. Repeated clicks inside the cooldown (or while a run is
 * active) return the existing run instead of launching another crawl.
 */

import type { DbClient } from '@/lib/db/types'
import { manualSyncCooldownMinutes } from '@/lib/jobs/config'

export const SYNC_REQUEST_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'rejected'] as const
export type SyncRequestStatus = (typeof SYNC_REQUEST_STATUSES)[number]

export interface SyncRequestRow {
  id: string
  organization_id: string
  requested_by: string | null
  status: SyncRequestStatus
  source_ids: string[]
  result: Record<string, unknown>
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface SyncResultSummary {
  ok: boolean
  locked: boolean
  sources: number
  found: number
  inserted: number
  updated: number
  expired: number
  failedSources: number
  errors: string[]
}

/** Collapse an ingestion run into the counts the operator sees. */
export function summarizeSyncRun(run: {
  ok: boolean
  locked?: boolean
  summaries: Array<{ status: string; found?: number; inserted?: number; updated?: number; expired?: number; error?: string }>
}): SyncResultSummary {
  const rows = run.summaries ?? []
  return {
    ok: run.ok && !run.locked,
    locked: Boolean(run.locked),
    sources: rows.length,
    found: rows.reduce((sum, row) => sum + (row.found ?? 0), 0),
    inserted: rows.reduce((sum, row) => sum + (row.inserted ?? 0), 0),
    updated: rows.reduce((sum, row) => sum + (row.updated ?? 0), 0),
    expired: rows.reduce((sum, row) => sum + (row.expired ?? 0), 0),
    failedSources: rows.filter((row) => row.status === 'failed').length,
    errors: rows.filter((row) => row.error).map((row) => String(row.error)),
  }
}

function parseRow(row: Record<string, unknown>): SyncRequestRow {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    requested_by: (row.requested_by as string | null) ?? null,
    status: row.status as SyncRequestStatus,
    source_ids: Array.isArray(row.source_ids) ? row.source_ids.map(String) : [],
    result: (row.result as Record<string, unknown>) ?? {},
    error: (row.error as string | null) ?? null,
    created_at: String(row.created_at),
    started_at: (row.started_at as string | null) ?? null,
    finished_at: (row.finished_at as string | null) ?? null,
  }
}

async function latestForOrg(db: DbClient, organizationId: string): Promise<SyncRequestRow | null> {
  const result = await db.raw!<Record<string, unknown>[]>(
    `select * from job_sync_requests
     where organization_id = ?
     order by created_at desc
     limit 1`,
    [organizationId],
  )
  if (result.error) throw new Error(result.error.message)
  return result.data?.[0] ? parseRow(result.data[0]) : null
}

export interface RequestManualSyncInput {
  organizationId: string
  requestedBy: string | null
  sourceIds?: string[]
}

export interface RequestManualSyncResult {
  request: SyncRequestRow
  /** True when an existing active/cooldown run was returned unchanged. */
  reused: boolean
}

/**
 * Enqueue (or reuse) a manual sync. Never performs network work.
 *
 * Order of checks: an active run wins first (so a slow run cannot be
 * duplicated), then the cooldown since the last completed run.
 */
export async function requestManualSync(db: DbClient, input: RequestManualSyncInput): Promise<RequestManualSyncResult> {
  const active = await db.raw!<Record<string, unknown>[]>(
    `select * from job_sync_requests
     where organization_id = ? and status in ('queued','running')
     order by created_at desc
     limit 1`,
    [input.organizationId],
  )
  if (active.error) throw new Error(active.error.message)
  const activeRow = active.data?.[0]
  if (activeRow) return { request: parseRow(activeRow), reused: true }

  const last = await latestForOrg(db, input.organizationId)
  if (last?.finished_at) {
    const elapsed = Date.now() - new Date(last.finished_at).getTime()
    if (elapsed < manualSyncCooldownMinutes() * 60_000) {
      return { request: last, reused: true }
    }
  }

  const inserted = await db.raw!<Record<string, unknown>[]>(
    `insert into job_sync_requests (organization_id, requested_by, source_ids)
     values (?, ?, ?)
     on conflict do nothing
     returning *`,
    [input.organizationId, input.requestedBy, JSON.stringify(input.sourceIds ?? [])],
  )
  const row = inserted.data?.[0]
  if (row) return { request: parseRow(row), reused: false }

  // No row means either a same-org enqueue race or a real error. Prefer
  // surfacing the winner; only report the write error when there is no run.
  const winner = await latestForOrg(db, input.organizationId)
  if (winner && (winner.status === 'queued' || winner.status === 'running')) {
    return { request: winner, reused: true }
  }
  if (inserted.error) throw new Error(inserted.error.message)
  if (winner) return { request: winner, reused: true }
  throw new Error('Could not enqueue a sync request.')
}

export async function getManualSyncRequest(
  db: DbClient,
  organizationId: string,
  requestId: string,
): Promise<SyncRequestRow | null> {
  const result = await db.raw!<Record<string, unknown>[]>(
    `select * from job_sync_requests where id = ? and organization_id = ? limit 1`,
    [requestId, organizationId],
  )
  if (result.error) throw new Error(result.error.message)
  return result.data?.[0] ? parseRow(result.data[0]) : null
}

export interface QueuedSyncRun {
  requestId: string
  organizationId: string
  sourceIds: string[]
  summary: SyncResultSummary
}

/**
 * Execute the oldest queued manual request. Returns null when the queue is
 * empty. Conditional status transition makes overlapping workers harmless.
 *
 * Accepts runJobDiscovery lazily so this module stays import-light for callers
 * that only need enqueue/read paths.
 */
export async function runQueuedManualSync(
  db: DbClient,
  runner: (options: { sourceIds?: string[]; force: boolean }) => Promise<{ ok: boolean; locked?: boolean; summaries: Array<{ status: string; found?: number; inserted?: number; updated?: number; expired?: number; error?: string }> }>,
): Promise<QueuedSyncRun | null> {
  // Lease recovery: a worker that died mid-run must not strand the request
  // forever. After the lease window the row returns to the queue.
  await db.raw!(
    `update job_sync_requests
        set status = 'queued', started_at = null
      where status = 'running'
        and started_at < now() - interval '10 minutes'`,
    [],
  )

  const claimed = await db.raw!<Record<string, unknown>[]>(
    `update job_sync_requests
        set status = 'running', started_at = now()
      where id = (
        select id from job_sync_requests where status = 'queued' order by created_at asc limit 1
      )
      returning *`,
    [],
  )
  if (claimed.error) throw new Error(claimed.error.message)
  const row = claimed.data?.[0]
  if (!row) return null

  const request = parseRow(row)
  try {
    // An empty array is an explicit "no sources" filter; only a non-empty list
    // restricts the run.
    const run = await runner({ sourceIds: request.source_ids.length > 0 ? request.source_ids : undefined, force: true })
    const summary = summarizeSyncRun(run)
    const stored = await db.raw!(
      `update job_sync_requests
          set status = ?, result = ?, error = null, finished_at = now()
        where id = ?
        returning *`,
      [summary.ok ? 'succeeded' : 'failed', JSON.stringify(summary), request.id],
    )
    if (stored.error) throw new Error(stored.error.message)
    return { requestId: request.id, organizationId: request.organization_id, sourceIds: request.source_ids, summary }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Manual sync failed.'
    await db.raw!(
      `update job_sync_requests
          set status = 'failed', error = ?, finished_at = now()
        where id = ?`,
      [message, request.id],
    )
    return {
      requestId: request.id,
      organizationId: request.organization_id,
      sourceIds: request.source_ids,
      summary: { ok: false, locked: false, sources: 0, found: 0, inserted: 0, updated: 0, expired: 0, failedSources: 0, errors: [message] },
    }
  }
}
