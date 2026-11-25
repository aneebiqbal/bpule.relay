/**
 * Conservative quality screen.
 *
 * A remote, well-paid or salary-silent role is never flagged. Only hard,
 * contradictory evidence quarantines; one soft signal needs review.
 */
import { describe, expect, it } from 'vitest'
import { screenJobQuality } from '@/lib/job-discovery/quality'
import { bucketFor, type InventoryJob } from '@/lib/job-discovery/inventory'

const base = {
  title: 'Senior Backend Engineer',
  company: 'Acme',
  description: 'Design and operate our payment platform with Node.js and PostgreSQL. Remote within Europe.',
  applyUrl: 'https://acme.example.com/careers/backend',
  salaryMin: 90000,
  salaryMax: 140000,
}

describe('screenJobQuality', () => {
  it('passes a normal remote, well-paid role', () => {
    const result = screenJobQuality(base)
    expect(result.classification).toBe('eligible')
    expect(result.quarantined).toBe(false)
  })

  it('does not flag missing salary information', () => {
    expect(screenJobQuality({ ...base, salaryMin: null, salaryMax: null }).classification).toBe('eligible')
  })

  it('quarantines upfront payment plus sensitive data', () => {
    const result = screenJobQuality({
      ...base,
      description: 'Send a wire transfer for the starter kit and your passport copy to begin.',
    })
    expect(result.classification).toBe('suspected_scam')
    expect(result.quarantined).toBe(true)
    expect(result.reasons).toContain('upfront_payment_requested')
    expect(result.reasons).toContain('sensitive_data_requested')
  })

  it('flags an invalid application destination', () => {
    const result = screenJobQuality({ ...base, applyUrl: 'http://192.168.1.5/apply' })
    expect(result.classification).toBe('suspected_scam')
    expect(result.reasons).toContain('invalid_application_url')
  })

  it('treats contradictory compensation as a hard credibility signal', () => {
    const result = screenJobQuality({ ...base, salaryMin: 100000, salaryMax: 1000 })
    expect(result.classification).toBe('suspected_scam')
    expect(result.reasons).toContain('contradictory_compensation')
  })

  it('quarantine removes a job from the feed without deleting it', () => {
    const job = {
      id: 'j1',
      source_id: 'remoteok',
      company: 'Acme',
      title: 'Backend Engineer',
      remote: true,
      skills: [],
      employment_type: 'full-time',
      posted_at: '2026-11-20T00:00:00.000Z',
      last_seen_at: '2026-11-23T00:00:00.000Z',
      last_verified_at: '2026-11-23T00:00:00.000Z',
      verification_status: 'verified_open',
      closed_at: null,
      duplicate_group_id: null,
      eligibility: null,
      quality_classification: 'suspected_scam',
    } as InventoryJob
    expect(bucketFor(job, true, new Date('2026-11-23T12:00:00Z'))).toMatchObject({ bucket: 'quarantined', include: false })
  })
})
