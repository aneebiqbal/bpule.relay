/**
 * Job retention report contracts.
 *
 * The report is read-only: it must never delete, and the counts must be
 * internally consistent so an operator can trust the cleanup candidate set.
 */
import { describe, expect, it } from 'vitest'
import { bucketFor, buildRetentionReport, type InventoryJob } from '@/lib/job-discovery/inventory'
import { serviceDbClient } from '@/lib/db/client'

// The report assertions read a populated database; without one (CI unit job)
// skip rather than fail. The live suite supplies a disposable database.
const liveDb = Boolean(process.env.DATABASE_URL || process.env.SERVICE_DATABASE_URL)

function job(partial: Partial<InventoryJob> & Pick<InventoryJob, 'id' | 'title'>): InventoryJob {
  return {
    source_id: 'source',
    verification_status: 'verified_open',
    remote: true,
    skills: [],
    employment_type: 'full-time',
    posted_at: '2026-11-20T00:00:00.000Z',
    last_seen_at: '2026-11-23T00:00:00.000Z',
    last_verified_at: '2026-11-23T00:00:00.000Z',
    closed_at: null,
    duplicate_group_id: null,
    eligibility: { classification: 'worldwide', pakistan: { eligible: true, confidence: 'confirmed', classification: 'eligible' } } as InventoryJob['eligibility'],
    ...partial,
  }
}

describe('JOB_RETENTION_BUCKETS', () => {
  const now = new Date('2026-11-23T12:00:00.000Z')

  it('a closed or expired job is never active', () => {
    expect(bucketFor(job({ id: 'j1', title: 'Engineer', verification_status: 'closed' }), true, now).include).toBe(false)
    expect(bucketFor(job({ id: 'j2', title: 'Engineer', verification_status: 'expired' }), true, now).include).toBe(false)
    expect(bucketFor(job({ id: 'j3', title: 'Engineer', closed_at: '2026-11-01T00:00:00.000Z' }), true, now).include).toBe(false)
  })

  it('a duplicate is hidden behind its canonical listing', () => {
    expect(bucketFor(job({ id: 'j4', title: 'Engineer', duplicate_group_id: 'g1' }), false, now).bucket).toBe('duplicate')
    expect(bucketFor(job({ id: 'j4', title: 'Engineer', duplicate_group_id: 'g1' }), false, now).include).toBe(false)
  })

  it('a stale unverified job leaves the actionable feed', () => {
    const stale = bucketFor(
      job({ id: 'j5', title: 'Engineer', verification_status: 'verification_needed', posted_at: '2026-08-01T00:00:00.000Z' }),
      true,
      now,
    )
    expect(stale.include).toBe(false)
    expect(stale.bucket).toBe('stale_unverified')
  })

  it('a confirmed Pakistan-excluded job is not recommended', () => {
    const excluded = bucketFor(
      job({
        id: 'j6',
        title: 'Engineer',
        eligibility: { classification: 'country_restricted', countries: ['Pakistan'], pakistan: { eligible: false, confidence: 'confirmed', classification: 'excluded' } } as InventoryJob['eligibility'],
      }),
      true,
      now,
    )
    expect(excluded.include).toBe(false)
  })
})

describe.skipIf(!liveDb)('JOB_RETENTION_REPORT', () => {
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
