/**
 * REL-QA-003 / REL-QA-004 — Today KPI and section parity (production QA, 26 Oct 2026).
 *
 * Reported: "Replies waiting" read 2 on the card and 6 in the list; "Follow-ups
 * due" read 0 on the card and 1 in the list.
 *
 * Root cause: the card counted leads by stored `status` (`replied` / `followed_up`)
 * while the sections counted canonical ranked actions. Two definitions of the
 * same KPI.
 *
 * Fix: one selector (`deriveTodayCounts`) feeds the card, and the section rows
 * are the same actions (`selectTodaySection`), so they cannot disagree.
 */
import { describe, expect, it } from 'vitest'
import {
  deriveTodayCounts,
  selectTodaySection,
  TODAY_FOLLOWUP_KINDS,
  TODAY_REPLY_KINDS,
} from '@/lib/relay/today-counts'

const ACTIONS = [
  { kind: 'reply_needed' },
  { kind: 'reply_needed' },
  { kind: 'followup_due' },
  { kind: 'high_fit_lead' },
  { kind: 'reply_needed' },
  { kind: 'connection_dm_due' },
]

describe('REL-QA-003 — replies waiting parity', () => {
  it('the KPI count equals the section row count', () => {
    const counts = deriveTodayCounts(ACTIONS)
    const rows = selectTodaySection(ACTIONS, TODAY_REPLY_KINDS)
    expect(counts.repliesWaiting).toBe(rows.length)
    expect(counts.repliesWaiting).toBe(3)
  })

  it('a lead the rep owes a reply to counts even when its stored status is not "replied"', () => {
    // The old card counted status only; a live reply whose status lags must
    // still be counted here.
    const counts = deriveTodayCounts([{ kind: 'reply_needed' }])
    expect(counts.repliesWaiting).toBe(1)
  })
})

describe('REL-QA-004 — follow-ups due parity', () => {
  it('the KPI count equals the section row count', () => {
    const counts = deriveTodayCounts(ACTIONS)
    const rows = selectTodaySection(ACTIONS, TODAY_FOLLOWUP_KINDS)
    expect(counts.followUpsDue).toBe(rows.length)
    expect(counts.followUpsDue).toBe(1)
  })

  it('a follow-up due counts even when the stored status is not "followed_up"', () => {
    const counts = deriveTodayCounts([{ kind: 'followup_due' }])
    expect(counts.followUpsDue).toBe(1)
  })

  it('unrelated action kinds never leak into either count', () => {
    const counts = deriveTodayCounts(ACTIONS)
    expect(counts.repliesWaiting + counts.followUpsDue).toBeLessThan(ACTIONS.length)
  })
})
