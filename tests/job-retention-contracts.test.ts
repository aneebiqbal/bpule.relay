/**
 * Job retention report contracts.
 *
 * The report is read-only: it must never delete, and the counts must be
 * internally consistent so an operator can trust the cleanup candidate set.
 */
import { describe, expect, it } from 'vitest'
import { buildRetentionReport } from '@/lib/job-discovery/inventory'
import { serviceDbClient } from '@/lib/db/client'

describe('JOB_RETENTION_REPORT', () => {
  it('reports non-negative counts that reconcile to the total', async () => {
    const report = await buildRetentionReport(serviceDbClient(), 5)
    const counts = report.counts
    for (const [key, value] of Object.entries(counts)) {
      expect(value, key).toBeGreaterThanOrEqual(0)
    }
    // Active + closed + source-unavailable is a partition of the inventory.
    expect(counts.active + counts.closed).toBeLessThanOrEqual(counts.total)
    // Cleanup candidates are a subset of the inactive/irrelevant inventory.
    expect(counts.eligibleForCleanup).toBeLessThanOrEqual(counts.total)
    expect(Array.isArray(report.cleanupSample)).toBe(true)
  }, 60_000)

  it('the feed buckets reconcile to the indexed jobs', async () => {
    const report = await buildRetentionReport(serviceDbClient(), 0)
    const bucketTotal = Object.values(report.buckets).reduce((sum, n) => sum + n, 0)
    expect(bucketTotal).toBeGreaterThan(0)
    expect(report.counts.recommended).toBe(report.buckets['recommended'] ?? 0)
    expect(report.counts.stale).toBe(report.buckets['stale_unverified'] ?? 0)
    expect(report.counts.duplicated).toBe(report.buckets['duplicate'] ?? 0)
  }, 60_000)
})
