/**
 * Freshness contract for the proactive Jobs feed.
 *
 * The owner-visible failure was stale listings presented as fresh. These pin
 * the rules: an absent window defaults to 72h on fresh feeds only, an explicit
 * "all open" (0) always wins, and personal/historical views never inherit it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { resolveFreshnessWindow } from '@/lib/job-discovery/service'
import { defaultFreshnessDays } from '@/lib/jobs/config'

describe('resolveFreshnessWindow', () => {
  it('defaults fresh feeds to the product window when unset', () => {
    expect(resolveFreshnessWindow('shortlist')).toBe(defaultFreshnessDays())
    expect(resolveFreshnessWindow('latest')).toBe(defaultFreshnessDays())
    expect(resolveFreshnessWindow('for-you')).toBe(defaultFreshnessDays())
  })

  it('never applies the default to personal or historical views', () => {
    for (const view of ['saved', 'applications', 'documents', 'history', 'prepared', 'in-progress'] as const) {
      expect(resolveFreshnessWindow(view)).toBeUndefined()
    }
  })

  it('honours an explicit all-open window over the default', () => {
    expect(resolveFreshnessWindow('shortlist', 0)).toBe(0)
  })

  it('honours an explicit narrower or wider window', () => {
    expect(resolveFreshnessWindow('shortlist', 1)).toBe(1)
    expect(resolveFreshnessWindow('shortlist', 7)).toBe(7)
  })
})

describe('defaultFreshnessDays', () => {
  const original = process.env.JOBS_DEFAULT_FRESHNESS_DAYS
  afterEach(() => {
    if (original === undefined) delete process.env.JOBS_DEFAULT_FRESHNESS_DAYS
    else process.env.JOBS_DEFAULT_FRESHNESS_DAYS = original
  })

  it('is 72 hours by default and configurable', () => {
    delete process.env.JOBS_DEFAULT_FRESHNESS_DAYS
    expect(defaultFreshnessDays()).toBe(3)
    process.env.JOBS_DEFAULT_FRESHNESS_DAYS = '1'
    expect(defaultFreshnessDays()).toBe(1)
  })

  it('falls back to 3 on garbage rather than disabling freshness', () => {
    process.env.JOBS_DEFAULT_FRESHNESS_DAYS = 'nonsense'
    expect(defaultFreshnessDays()).toBe(3)
  })
})
