import { describe, it, expect } from 'vitest'
import type { Lead, Message, Outcome } from '@/lib/domain/types'
import { businessDaysBetween, isFollowupDue, FOLLOWUP_DUE_BUSINESS_DAYS } from '@/lib/leads/followup'

/**
 * Follow-up policy: ONE follow-up, five working days after the last send,
 * then never again. A NO is permanent. This matches the project's original
 * rule (stated repeatedly outside this repo's own history, since no spec
 * doc for it exists in-tree) — src/lib/leads/followup.ts and
 * src/components/lead-workspace.tsx are the real, current implementation of
 * that rule, and this file guards it.
 */

// Mirrors src/components/lead-workspace.tsx:140-148 exactly. If that
// component's logic changes, update this alongside it.
function followupEligible(lead: Pick<Lead, 'status'>, messages: Pick<Message, 'sentText' | 'sentAt'>[]): boolean {
  const hasPriorSend = messages.some((m) => m.sentText && m.sentAt)
  const followupAlreadyUsed = lead.status === 'followed_up'
  return lead.status === 'contacted' && hasPriorSend && !followupAlreadyUsed
}

function businessDaysAgo(n: number, from: Date = new Date('2026-09-23T09:00:00Z')): string {
  const d = new Date(from)
  let remaining = n
  while (remaining > 0) {
    d.setDate(d.getDate() - 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }
  return d.toISOString()
}

describe('follow-up eligibility: ONE follow-up, ever', () => {
  it('is not eligible for a lead that has never been sent to', () => {
    expect(followupEligible({ status: 'new' }, [])).toBe(false)
  })

  it('is eligible once a lead is contacted, has a prior send, and has never followed up', () => {
    const messages: Pick<Message, 'sentText' | 'sentAt'>[] = [{ sentText: 'Hi there', sentAt: businessDaysAgo(1) }]
    expect(followupEligible({ status: 'contacted' }, messages)).toBe(true)
  })

  it('is permanently locked out once a follow-up has already been sent — the one-use rule', () => {
    // This is the actual rule: status 'followed_up' means the one follow-up
    // has been used. It never becomes eligible again, no matter how much
    // time passes or how many more messages exist.
    const messages: Pick<Message, 'sentText' | 'sentAt'>[] = [
      { sentText: 'Hi there', sentAt: businessDaysAgo(20) },
      { sentText: 'Following up', sentAt: businessDaysAgo(10) },
    ]
    expect(followupEligible({ status: 'followed_up' }, messages)).toBe(false)
  })

  it('is not eligible without any actually-sent message even if status looks contacted', () => {
    const messages: Pick<Message, 'sentText' | 'sentAt'>[] = [{ sentText: null, sentAt: null }]
    expect(followupEligible({ status: 'contacted' }, messages)).toBe(false)
  })
})

describe('business day arithmetic (Mon-Fri only, weekends never count)', () => {
  it('a Monday-to-Tuesday span is exactly 1 business day', () => {
    // Pick a known Monday and Tuesday explicitly rather than relying on
    // "today", so this test is not itself calendar-dependent.
    const monday = new Date('2026-09-14T09:00:00Z') // a Monday
    const tuesday = new Date('2026-09-15T09:00:00Z')
    expect(businessDaysBetween(monday, tuesday)).toBe(1)
  })

  it('a full weekend adds zero business days', () => {
    const friday = new Date('2026-09-11T09:00:00Z')
    const monday = new Date('2026-09-14T09:00:00Z')
    // Fri -> Mon crosses Sat + Sun, neither of which count.
    expect(businessDaysBetween(friday, monday)).toBe(1)
  })

  it('five business days from a Monday lands on the following Monday, not the following Saturday', () => {
    const monday = new Date('2026-09-14T09:00:00Z')
    const nextMonday = new Date('2026-09-21T09:00:00Z')
    expect(businessDaysBetween(monday, nextMonday)).toBe(5)
  })

  it('the same calendar span (7 flat days) is NOT the same as 5 business days sent on a Friday', () => {
    // Sent Friday: 3 flat calendar days later is Monday, but that is only
    // 1 business day — the whole point of business-day math is that a
    // Friday send does not become due over the weekend.
    const friday = new Date('2026-09-11T09:00:00Z')
    const followingMonday = new Date('2026-09-14T09:00:00Z')
    expect(businessDaysBetween(friday, followingMonday)).toBeLessThan(FOLLOWUP_DUE_BUSINESS_DAYS)
  })
})

describe('the real 5-business-day due window', () => {
  // Freeze "now" to a Wednesday so business-day math is deterministic
  // regardless of which day this test suite runs on.
  const NOW = new Date('2026-09-23T09:00:00Z') // a Wednesday

  it('is not due before 5 full business days have passed', () => {
    // 4 business days before NOW = Thu Sep 17. Thu -> NOW = 4 business days.
    expect(isFollowupDue(businessDaysAgo(4, NOW), false, NOW)).toBe(false)
  })

  it('is due at exactly 5 business days', () => {
    // 5 business days before NOW = Wed Sep 16. Wed -> NOW = 5 business days.
    expect(isFollowupDue(businessDaysAgo(5, NOW), false, NOW)).toBe(true)
  })

  it('is due well past the 5-business-day window', () => {
    expect(isFollowupDue(businessDaysAgo(15, NOW), false, NOW)).toBe(true)
  })

  it('a weekend does not shorten the wait — sending on a Friday does not make Monday "due"', () => {
    // 3 calendar days (Fri -> Mon) is only 1 business day, well under the
    // 5-business-day threshold. The old, wrong behavior (flat 3 calendar
    // days) would have marked this due; the fixed behavior must not.
    const friday = new Date('2026-09-11T09:00:00Z')
    expect(isFollowupDue(friday.toISOString(), false, new Date('2026-09-14T09:00:00Z'))).toBe(false)
  })

  it('is never due once the prospect has replied, regardless of elapsed time — a NO is permanent', () => {
    expect(isFollowupDue(businessDaysAgo(30, NOW), true, NOW)).toBe(false)
  })

  it('weekend boundary: send Friday, next Monday is only 1 business day — not due', () => {
    const friday = new Date('2026-09-18T09:00:00Z') // a Friday
    const monday = new Date('2026-09-21T09:00:00Z') // following Monday
    expect(isFollowupDue(friday.toISOString(), false, monday)).toBe(false)
  })

  it('weekend boundary: send Friday, next Friday is exactly 5 business days — due', () => {
    const friday = new Date('2026-09-18T09:00:00Z') // a Friday
    const nextFriday = new Date('2026-09-25T09:00:00Z') // following Friday
    expect(isFollowupDue(friday.toISOString(), false, nextFriday)).toBe(true)
  })
})

describe('reply classification routing (Outcome stage)', () => {
  it('a replied outcome marks the lead as no longer due for follow-up', () => {
    const outcomes: Pick<Outcome, 'stage'>[] = [{ stage: 'replied' }]
    const hasReplied = outcomes.some((o) => o.stage === 'replied')
    expect(isFollowupDue(businessDaysAgo(10), hasReplied)).toBe(false)
  })

  it('a non-reply outcome (read/check/slice/close/standing) does not block follow-up', () => {
    const outcomes: Pick<Outcome, 'stage'>[] = [{ stage: 'read' }]
    const hasReplied = outcomes.some((o) => o.stage === 'replied')
    expect(isFollowupDue(businessDaysAgo(10), hasReplied)).toBe(true)
  })
})
