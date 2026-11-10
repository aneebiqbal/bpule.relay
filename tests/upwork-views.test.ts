/**
 * Upwork job views and next actions, derived from canonical facts only.
 * Follow-up due and archive candidate are computed, never stored statuses.
 */
import { describe, it, expect } from 'vitest'
import { upworkJobView, upworkNextAction, isNeedsAction, type UpworkJobFacts } from '@/lib/upwork/views'

const base: UpworkJobFacts = {
  status: 'APPLIED',
  submittedAt: '2026-11-01T09:00:00.000Z',
  followUps: [],
  firstReplyAt: null,
  now: '2026-11-10T09:00:00.000Z',
}

describe('upworkJobView', () => {
  it('maps the lifecycle status to its view', () => {
    expect(upworkJobView({ ...base, status: 'SAVED' })).toBe('saved')
    expect(upworkJobView({ ...base, status: 'DRAFT_READY' })).toBe('draft_ready')
    expect(upworkJobView({ ...base, status: 'APPLIED' })).toBe('applied')
    expect(upworkJobView({ ...base, status: 'CLIENT_REPLIED' })).toBe('client_replied')
    expect(upworkJobView({ ...base, status: 'INTERVIEW' })).toBe('interview')
    expect(upworkJobView({ ...base, status: 'WON' })).toBe('won')
    expect(upworkJobView({ ...base, status: 'LOST' })).toBe('lost')
    expect(upworkJobView({ ...base, status: 'ARCHIVED' })).toBe('archived')
  })
})

describe('isNeedsAction', () => {
  it('needs action for a saved job and a draft ready to apply', () => {
    expect(isNeedsAction({ ...base, status: 'SAVED' })).toBe(true)
    expect(isNeedsAction({ ...base, status: 'DRAFT_READY' })).toBe(true)
  })

  it('needs action when the first follow-up is due', () => {
    expect(isNeedsAction(base)).toBe(true)
  })

  it('does not need action while the follow-up window is open', () => {
    expect(isNeedsAction({ ...base, now: '2026-11-04T09:00:00.000Z' })).toBe(false)
  })

  it('needs action once the client replied', () => {
    expect(isNeedsAction({ ...base, status: 'CLIENT_REPLIED', firstReplyAt: '2026-11-03T09:00:00.000Z' })).toBe(true)
  })

  it('needs action for an archive candidate after two follow-ups and the stale window', () => {
    const facts: UpworkJobFacts = {
      ...base,
      followUps: ['2026-11-05T09:00:00.000Z', '2026-11-09T09:00:00.000Z'],
      now: '2026-11-17T09:00:00.000Z',
    }
    expect(isNeedsAction(facts)).toBe(true)
  })

  it('does not need action for won, lost or archived jobs', () => {
    expect(isNeedsAction({ ...base, status: 'WON' })).toBe(false)
    expect(isNeedsAction({ ...base, status: 'LOST' })).toBe(false)
    expect(isNeedsAction({ ...base, status: 'ARCHIVED' })).toBe(false)
  })
})

describe('upworkNextAction', () => {
  it('names the next action per state', () => {
    expect(upworkNextAction({ ...base, status: 'SAVED' })).toBe('Review this job')
    expect(upworkNextAction({ ...base, status: 'DRAFT_READY' })).toBe('Apply now')
    expect(upworkNextAction(base)).toBe('Follow up')
    expect(upworkNextAction({ ...base, status: 'CLIENT_REPLIED', firstReplyAt: '2026-11-03T09:00:00.000Z' })).toBe('Reply to the client')
    expect(upworkNextAction({ ...base, status: 'INTERVIEW' })).toBe('Prepare for the interview')
  })

  it('names the archive candidate', () => {
    const facts: UpworkJobFacts = {
      ...base,
      followUps: ['2026-11-05T09:00:00.000Z', '2026-11-09T09:00:00.000Z'],
      now: '2026-11-17T09:00:00.000Z',
    }
    expect(upworkNextAction(facts)).toBe('Ready to archive')
  })

  it('is null when nothing is owed', () => {
    expect(upworkNextAction({ ...base, now: '2026-11-04T09:00:00.000Z' })).toBeNull()
    expect(upworkNextAction({ ...base, status: 'WON' })).toBeNull()
  })
})
