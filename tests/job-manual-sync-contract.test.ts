/**
 * Manual Jobs sync contracts.
 *
 * Sync Now must enqueue, not crawl; repeated clicks must reuse one run; the
 * operator-facing counts must be honest about partial failures.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { summarizeSyncRun } from '@/lib/job-discovery/sync-requests'
import { manualSyncCooldownMinutes } from '@/lib/jobs/config'

describe('summarizeSyncRun', () => {
  it('counts inserted/updated/expired across sources', () => {
    const summary = summarizeSyncRun({
      ok: true,
      summaries: [
        { status: 'ok', found: 12, inserted: 5, updated: 6, expired: 1 },
        { status: 'ok', found: 3, inserted: 1, updated: 2, expired: 0 },
      ],
    })
    expect(summary).toMatchObject({ ok: true, locked: false, sources: 2, found: 15, inserted: 6, updated: 8, expired: 1, failedSources: 0 })
    expect(summary.errors).toEqual([])
  })

  it('reports partial failure instead of claiming a clean sync', () => {
    const summary = summarizeSyncRun({
      ok: true,
      summaries: [
        { status: 'ok', found: 4, inserted: 2, updated: 2, expired: 0 },
        { status: 'failed', found: 0, inserted: 0, updated: 0, expired: 0, error: 'timeout' },
      ],
    })
    expect(summary.ok).toBe(true) // the worker completed; the source did not
    expect(summary.failedSources).toBe(1)
    expect(summary.errors).toEqual(['timeout'])
  })

  it('marks a lock collision as not-ok', () => {
    expect(summarizeSyncRun({ ok: false, locked: true, summaries: [] })).toMatchObject({ ok: false, locked: true, sources: 0 })
  })
})

describe('manualSyncCooldownMinutes', () => {
  const original = process.env.JOBS_MANUAL_SYNC_COOLDOWN_MINUTES
  afterEach(() => {
    if (original === undefined) delete process.env.JOBS_MANUAL_SYNC_COOLDOWN_MINUTES
    else process.env.JOBS_MANUAL_SYNC_COOLDOWN_MINUTES = original
  })

  it('defaults to 15 and is configurable', () => {
    delete process.env.JOBS_MANUAL_SYNC_COOLDOWN_MINUTES
    expect(manualSyncCooldownMinutes()).toBe(15)
    process.env.JOBS_MANUAL_SYNC_COOLDOWN_MINUTES = '30'
    expect(manualSyncCooldownMinutes()).toBe(30)
  })

  it('falls back to 15 on garbage rather than disabling the cooldown', () => {
    process.env.JOBS_MANUAL_SYNC_COOLDOWN_MINUTES = 'soon'
    expect(manualSyncCooldownMinutes()).toBe(15)
  })
})
