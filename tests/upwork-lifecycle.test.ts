/**
 * Canonical Upwork lifecycle: one state per job, derived follow-up and archive
 * facts, and the hard invariant that a generated proposal is not an application.
 * Pure — no database, no clock.
 */
import { describe, it, expect } from 'vitest'
import {
  UPWORK_JOB_STATUSES,
  isUpworkJobStatus,
  mapLegacyStatus,
  canTransition,
  followUpDueAt,
  isArchiveCandidate,
  responseTimeMs,
  type UpworkJobStatus,
} from '@/lib/upwork/lifecycle'

describe('canonical job states', () => {
  it('is exactly the eight lifecycle states', () => {
    expect(UPWORK_JOB_STATUSES).toEqual([
      'SAVED',
      'DRAFT_READY',
      'APPLIED',
      'CLIENT_REPLIED',
      'INTERVIEW',
      'WON',
      'LOST',
      'ARCHIVED',
    ])
  })

  it('accepts canonical states and rejects legacy ones', () => {
    expect(isUpworkJobStatus('SAVED')).toBe(true)
    expect(isUpworkJobStatus('APPLIED')).toBe(true)
    expect(isUpworkJobStatus('new')).toBe(false)
    expect(isUpworkJobStatus('shortlisted')).toBe(false)
    expect(isUpworkJobStatus('')).toBe(false)
  })
})

describe('legacy status mapping', () => {
  it('maps every legacy state onto the lifecycle', () => {
    expect(mapLegacyStatus('new')).toBe('SAVED')
    expect(mapLegacyStatus('drafted')).toBe('DRAFT_READY')
    expect(mapLegacyStatus('applied')).toBe('APPLIED')
    expect(mapLegacyStatus('replied')).toBe('CLIENT_REPLIED')
    expect(mapLegacyStatus('dead')).toBe('ARCHIVED')
  })

  it('maps the unused "no" state to ARCHIVED rather than guessing LOST', () => {
    expect(mapLegacyStatus('no')).toBe('ARCHIVED')
  })

  it('passes canonical states through unchanged', () => {
    for (const status of UPWORK_JOB_STATUSES) expect(mapLegacyStatus(status)).toBe(status)
  })
})

describe('transitions', () => {
  const cases: Array<[UpworkJobStatus, UpworkJobStatus, boolean]> = [
    ['SAVED', 'DRAFT_READY', true],
    ['SAVED', 'APPLIED', true],
    ['DRAFT_READY', 'APPLIED', true],
    ['SAVED', 'CLIENT_REPLIED', false],
    ['APPLIED', 'INTERVIEW', false],
    ['CLIENT_REPLIED', 'INTERVIEW', true],
    ['INTERVIEW', 'WON', true],
    ['INTERVIEW', 'LOST', true],
    ['APPLIED', 'WON', false],
    ['WON', 'LOST', false],
    ['WON', 'ARCHIVED', true],
    ['LOST', 'ARCHIVED', true],
    ['ARCHIVED', 'APPLIED', false],
  ]
  for (const [from, to, allowed] of cases) {
    it(`${from} → ${to} is ${allowed ? 'allowed' : 'blocked'}`, () => {
      expect(canTransition(from, to)).toBe(allowed)
    })
  }
})

describe('follow-up policy', () => {
  const submittedAt = '2026-11-01T09:00:00.000Z'

  it('is not due before an application exists', () => {
    expect(followUpDueAt(null, [], null)).toBeNull()
  })

  it('first follow-up is 4 days after submission', () => {
    expect(followUpDueAt(submittedAt, [], null)).toBe('2026-11-05T09:00:00.000Z')
  })

  it('second follow-up is 4 days after the first, not the application', () => {
    const first = '2026-11-05T09:00:00.000Z'
    expect(followUpDueAt(submittedAt, [first], null)).toBe('2026-11-09T09:00:00.000Z')
  })

  it('is not due after two follow-ups', () => {
    expect(followUpDueAt(submittedAt, ['2026-11-05T09:00:00.000Z', '2026-11-09T09:00:00.000Z'], null)).toBeNull()
  })

  it('is not due once the client replied', () => {
    expect(followUpDueAt(submittedAt, [], '2026-11-03T09:00:00.000Z')).toBeNull()
  })
})

describe('archive candidate', () => {
  const submittedAt = '2026-11-01T09:00:00.000Z'

  it('requires two follow-ups and no reply', () => {
    const two: [string, string] = ['2026-11-05T09:00:00.000Z', '2026-11-09T09:00:00.000Z']
    expect(isArchiveCandidate(submittedAt, two, null, '2026-11-15T09:00:00.000Z')).toBe(false)
    expect(isArchiveCandidate(submittedAt, two, null, '2026-11-17T09:00:00.000Z')).toBe(true)
  })

  it('is not a candidate while a reply is waiting', () => {
    const two: [string, string] = ['2026-11-05T09:00:00.000Z', '2026-11-09T09:00:00.000Z']
    expect(isArchiveCandidate(submittedAt, two, '2026-11-10T09:00:00.000Z', '2026-11-20T09:00:00.000Z')).toBe(false)
  })

  it('is not a candidate without an application', () => {
    expect(isArchiveCandidate(null, [], null, '2026-11-20T09:00:00.000Z')).toBe(false)
  })
})

describe('response time', () => {
  it('is first reply minus submission', () => {
    expect(responseTimeMs('2026-11-01T09:00:00.000Z', '2026-11-03T09:00:00.000Z')).toBe(2 * 86_400_000)
  })

  it('is null without both ends', () => {
    expect(responseTimeMs(null, '2026-11-03T09:00:00.000Z')).toBeNull()
    expect(responseTimeMs('2026-11-01T09:00:00.000Z', null)).toBeNull()
  })
})
