import { describe, expect, it } from 'vitest'
import {
  REP_V3_EMPTY_STATE,
  REP_V3_PRIMARY_CTA,
  REP_V3_SECTION_ERROR,
  buildRepV3Actions,
  buildRepV3Metrics,
  sanitizeRepV3Error,
} from '@/lib/rep-home/v3-present'

/**
 * Optional sections must degrade instead of taking the page down. These pin the
 * presentation contract a degraded dashboard relies on: empty inputs produce
 * calm zero states, and an internal error never reaches the screen verbatim.
 */
describe('REP_V3_FAILURE_ISOLATION', () => {
  const silent = {
    actionable: 0,
    urgent: 0,
    repliesWaiting: 0,
    repliesOlderThan4h: 0,
    followUpsDue: 0,
    followUpsOverdue: 0,
    openTasks: 0,
    tasksDueToday: 0,
  }

  it('metrics render calm zero states when every section fails', () => {
    const metrics = buildRepV3Metrics(silent)
    expect(metrics).toHaveLength(4)
    expect(metrics.every((m) => m.value === 0)).toBe(true)
    expect(metrics.find((m) => m.key === 'needsAction')?.hint).toBe('Ranked for you')
  })

  it('the ranked list is empty rather than throwing when actions fail', () => {
    expect(buildRepV3Actions([], [])).toEqual([])
  })

  it('an optional-section failure shows the generic message, not raw internals', () => {
    expect(sanitizeRepV3Error(new Error('relation "lead_message_previews" does not exist')))
      .toBe(REP_V3_SECTION_ERROR)
    expect(sanitizeRepV3Error(undefined)).toBe(REP_V3_SECTION_ERROR)
  })

  it('the primary call to action survives a full section outage', () => {
    // Users must always be able to start work from an empty dashboard.
    expect(REP_V3_PRIMARY_CTA).toEqual({ label: 'Analyze Prospect', href: '/prospect' })
    expect(REP_V3_EMPTY_STATE.title.length).toBeGreaterThan(0)
  })
})
