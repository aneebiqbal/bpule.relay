import { describe, expect, it } from 'vitest'
import {
  isArchiveEligible,
  ARCHIVE_ELIGIBLE_FOLLOWUP_COUNT,
  ARCHIVE_ELIGIBLE_DAYS_SINCE_LAST_SEND,
} from '@/lib/leads/followup'

/**
 * Lead archival eligibility (approved product design).
 *
 * A lead becomes archive-eligible when BOTH hold:
 *   1. followupCount >= 3 (all 3 follow-ups used — same cap as the
 *      follow-up-sending gate in followup-engine.ts)
 *   2. At least 3 full CALENDAR days (not business days — this is a
 *      housekeeping sweep, not an outreach-timing decision) have passed
 *      since the last outbound send, with no reply since.
 *
 * Extracted as a pure function in src/lib/leads/followup.ts so it is
 * unit-testable without mocking Supabase.
 */

const NOW = new Date('2026-01-10T12:00:00.000Z')

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
}

describe('isArchiveEligible', () => {
  it('exposes the documented constants', () => {
    expect(ARCHIVE_ELIGIBLE_FOLLOWUP_COUNT).toBe(3)
    expect(ARCHIVE_ELIGIBLE_DAYS_SINCE_LAST_SEND).toBe(3)
  })

  it('is eligible when both conditions hold: 3 follow-ups used AND 3+ calendar days quiet with no reply', () => {
    const result = isArchiveEligible({
      followupCount: 3,
      lastSendAt: daysAgo(3),
      hasRepliedSinceLastSend: false,
      now: NOW,
    })
    expect(result).toBe(true)
  })

  it('is eligible well past the 3-day window too', () => {
    const result = isArchiveEligible({
      followupCount: 3,
      lastSendAt: daysAgo(30),
      hasRepliedSinceLastSend: false,
      now: NOW,
    })
    expect(result).toBe(true)
  })

  it('is NOT eligible when followupCount is below 3, even if the lead has gone quiet for a long time', () => {
    const result = isArchiveEligible({
      followupCount: 2,
      lastSendAt: daysAgo(30),
      hasRepliedSinceLastSend: false,
      now: NOW,
    })
    expect(result).toBe(false)
  })

  it('is NOT eligible when followupCount is 0', () => {
    const result = isArchiveEligible({
      followupCount: 0,
      lastSendAt: daysAgo(30),
      hasRepliedSinceLastSend: false,
      now: NOW,
    })
    expect(result).toBe(false)
  })

  it('is NOT eligible when fewer than 3 calendar days have passed since the last send, even with 3 follow-ups used', () => {
    const result = isArchiveEligible({
      followupCount: 3,
      lastSendAt: daysAgo(2),
      hasRepliedSinceLastSend: false,
      now: NOW,
    })
    expect(result).toBe(false)
  })

  it('is NOT eligible when the lead replied, even though both counters would otherwise qualify', () => {
    const result = isArchiveEligible({
      followupCount: 3,
      lastSendAt: daysAgo(30),
      hasRepliedSinceLastSend: true,
      now: NOW,
    })
    expect(result).toBe(false)
  })

  it('is NOT eligible when there has never been an outbound send', () => {
    const result = isArchiveEligible({
      followupCount: 3,
      lastSendAt: null,
      hasRepliedSinceLastSend: false,
      now: NOW,
    })
    expect(result).toBe(false)
  })

  it('uses plain calendar days, not business days — a weekend does not delay eligibility', () => {
    // 3 calendar days that happen to span a weekend must still count fully,
    // unlike the 5-BUSINESS-day follow-up-due window (isFollowupDue) which
    // deliberately skips weekends. This is a housekeeping sweep, not an
    // outreach-timing decision.
    const friday = new Date('2026-01-09T12:00:00.000Z') // a Friday
    const mondayThreeDaysLater = new Date('2026-01-12T12:00:00.000Z') // 3 calendar days later
    const result = isArchiveEligible({
      followupCount: 3,
      lastSendAt: friday.toISOString(),
      hasRepliedSinceLastSend: false,
      now: mondayThreeDaysLater,
    })
    expect(result).toBe(true)
  })

  it('is eligible at exactly 3.0 calendar days (boundary)', () => {
    const result = isArchiveEligible({
      followupCount: 3,
      lastSendAt: daysAgo(3),
      hasRepliedSinceLastSend: false,
      now: NOW,
    })
    expect(result).toBe(true)
  })

  it('is NOT eligible at just under 3 calendar days (boundary)', () => {
    const almostThreeDaysAgo = new Date(NOW.getTime() - (3 * 24 * 60 * 60 * 1000 - 1000))
    const result = isArchiveEligible({
      followupCount: 3,
      lastSendAt: almostThreeDaysAgo.toISOString(),
      hasRepliedSinceLastSend: false,
      now: NOW,
    })
    expect(result).toBe(false)
  })
})
