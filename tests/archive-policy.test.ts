/**
 * One archival policy resolver: the state machine, inbox and cron must agree.
 * Windows are internal review deadlines, never claims about LinkedIn expiry.
 */
import { describe, expect, it } from 'vitest'
import { ARCHIVE_POLICY, resolveArchiveReview } from '@/lib/leads/archive-policy'

const NOW = new Date('2026-11-25T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

describe('resolveArchiveReview', () => {
  it('keeps pending connections aligned with the 14-day state-machine window', () => {
    const base = {
      status: 'contacted',
      connectionAcceptedAt: null,
      lockedReason: 'connection_note_sent',
      now: NOW,
    }
    expect(resolveArchiveReview({ ...base, lastOutboundAt: daysAgo(13) }).due).toBe(false)
    expect(resolveArchiveReview({ ...base, lastOutboundAt: daysAgo(ARCHIVE_POLICY.pendingConnectionDays) })).toMatchObject({
      due: true,
      reason: 'pending_connection',
      elapsedDays: ARCHIVE_POLICY.pendingConnectionDays,
    })
  })

  it('archives untouched new leads at the configured window', () => {
    expect(resolveArchiveReview({ status: 'new', createdAt: daysAgo(29), now: NOW }).due).toBe(false)
    expect(resolveArchiveReview({ status: 'new', createdAt: daysAgo(30), now: NOW }).due).toBe(true)
  })

  it('ends follow-ups only after all are used and the quiet window passed', () => {
    const base = { status: 'followed_up', followupCount: ARCHIVE_POLICY.maxFollowups, now: NOW }
    expect(resolveArchiveReview({ ...base, lastOutboundAt: daysAgo(2) }).due).toBe(false)
    expect(resolveArchiveReview({ ...base, lastOutboundAt: daysAgo(3) }).due).toBe(true)
  })

  it('never archives an active conversation or a terminal outcome', () => {
    expect(resolveArchiveReview({ status: 'replied', hasRepliedSinceLastSend: true, now: NOW }).reason).toBe('active')
    expect(resolveArchiveReview({ status: 'won', now: NOW }).reason).toBe('never')
    expect(resolveArchiveReview({ status: 'no', now: NOW }).reason).toBe('never')
  })
})
