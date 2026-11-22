import { describe, expect, it } from 'vitest'
import { bucketFor, type InventoryJob } from '@/lib/job-discovery/inventory'
import { classifyRemoteEligibility } from '@/lib/job-discovery/eligibility'

const NOW = new Date('2026-11-20T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

function job(overrides: Partial<InventoryJob> = {}): InventoryJob {
  return {
    id: 'j1',
    source_id: 'remoteok',
    company: 'Acme',
    title: 'Backend Engineer',
    remote: true,
    skills: [],
    employment_type: 'full-time',
    posted_at: daysAgo(2),
    last_seen_at: daysAgo(1),
    last_verified_at: daysAgo(1),
    verification_status: 'verified_open',
    closed_at: null,
    duplicate_group_id: null,
    apply_url: 'https://acme.example.com/apply',
    source_url: null,
    eligibility: null,
    ...overrides,
  }
}

function eligibilityFor(text: string) {
  return classifyRemoteEligibility({ title: 'Backend Engineer', description: text })
}

describe('inventory buckets', () => {
  it('excludes closed and duplicate listings without deleting them', () => {
    expect(bucketFor(job({ closed_at: daysAgo(1) }), true, NOW).bucket).toBe('closed')
    expect(bucketFor(job({ verification_status: 'expired' }), true, NOW).bucket).toBe('closed')
    expect(bucketFor(job(), false, NOW).bucket).toBe('duplicate')
  })

  it('never recommends an onsite role', () => {
    const result = bucketFor(job({ remote: false }), true, NOW)
    expect(result.bucket).toBe('not_remote')
    expect(result.include).toBe(false)
  })

  it('excludes stale or unverified listings', () => {
    const stale = bucketFor(job({ last_verified_at: daysAgo(30) }), true, NOW)
    expect(stale.bucket).toBe('stale_unverified')
    expect(stale.include).toBe(false)

    const neverVerified = bucketFor(job({ verification_status: 'recently_seen', last_seen_at: daysAgo(30) }), true, NOW)
    expect(neverVerified.bucket).toBe('stale_unverified')
  })

  it('excludes a posting that confirms Pakistan is not eligible', () => {
    const result = bucketFor(
      job({ eligibility: eligibilityFor('US only; must be authorized to work in the United States.') }),
      true,
      NOW,
    )
    expect(result.bucket).toBe('location_restricted')
    expect(result.include).toBe(false)
  })

  it('keeps eligibility-unknown roles in review instead of recommending them', () => {
    const result = bucketFor(job({ eligibility: eligibilityFor('Remote backend role.') }), true, NOW)
    expect(result.bucket).toBe('eligibility_unknown')
    expect(result.include).toBe(true)
  })

  it('recommends verified, fresh, Pakistan-eligible engineering roles', () => {
    const result = bucketFor(
      job({ eligibility: eligibilityFor('Work from anywhere in the world.') }),
      true,
      NOW,
    )
    expect(result.bucket).toBe('recommended')
    expect(result.include).toBe(true)
  })

  it('does not recommend a non-engineering or unverified role', () => {
    const sales = bucketFor(
      job({ title: 'Account Executive', eligibility: eligibilityFor('Work from anywhere in the world.') }),
      true,
      NOW,
    )
    expect(sales.bucket).toBe('eligible_low')

    const unverified = bucketFor(
      job({ verification_status: 'recently_seen', eligibility: eligibilityFor('Work from anywhere in the world.') }),
      true,
      NOW,
    )
    expect(unverified.bucket).toBe('eligible_low')
  })
})
