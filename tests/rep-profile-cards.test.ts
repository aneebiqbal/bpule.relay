/**
 * Rep profile execution cards — presentation contracts.
 *
 * The card is a pure projection of canonical facts: `ProfileToday` (targets +
 * daily accountability) and `CoverageProfileResult.work` (Inbox + assigned
 * tasks). These contracts guard the presentation rules the Rep Home cards
 * promise — remaining parity, real activity categories, no fake zero progress,
 * attention parity, coverage context and one card per responsibility.
 */
import { describe, expect, it } from 'vitest'
import {
  buildActivityBreakdown,
  buildAttentionLine,
  buildProfileCards,
  ownershipLine,
  sortProfileCards,
  statusLabel,
  statusTone,
  summarizeProfileCards,
} from '@/lib/rep-home/profile-card-view'
import type { CoverageProfileResult } from '@/lib/coverage/engine'
import type { ProfileCompletionStatus, ProfileToday } from '@/lib/rep-home/profile-completion'

function profile(overrides: Partial<CoverageProfileResult> = {}): CoverageProfileResult {
  return {
    profileId: 'p1',
    name: 'Hassan',
    channels: ['linkedin'],
    identityIds: ['i1'],
    primaryRepId: 'r1',
    primaryRepName: 'Dawood',
    primaryAvailability: 'WORKING',
    primaryIsAvailable: true,
    backups: [],
    activeCoveringRepId: null,
    activeCoveringRepName: null,
    activeCoverageUntil: null,
    status: 'COVERED',
    recommendation: 'NONE',
    recommendedRepId: null,
    recommendedRepName: null,
    recommendationReasons: [],
    recommendedReady: false,
    ineligibleReason: null,
    coverageExpiring: false,
    primaryReady: true,
    work: { replies: 0, followUps: 0, tasks: 0 },
    ...overrides,
  }
}

function progress(overrides: Partial<ProfileToday> = {}): ProfileToday {
  return {
    profileId: 'p1',
    name: 'Hassan',
    title: null,
    channels: ['linkedin'],
    identityIds: ['i1'],
    targetCount: 10,
    completedCount: 6,
    remaining: 4,
    status: 'ON_TRACK',
    targets: [
      { activityType: 'dm', label: 'DMs', targetCount: 5, completedCount: 3, remaining: 2 },
      { activityType: 'followup', label: 'Follow-ups', targetCount: 2, completedCount: 1, remaining: 1 },
      { activityType: 'prospect_extracted', label: 'Prospects', targetCount: 3, completedCount: 2, remaining: 1 },
    ],
    ...overrides,
  }
}

function card(
  id: string,
  status: ProfileCompletionStatus | null,
  kind: 'own' | 'covering' = 'own',
  overrides: Partial<ProfileToday> = {},
) {
  return {
    profile: profile({ profileId: id, name: id }),
    kind,
    progress: progress({ profileId: id, status, ...overrides }),
  }
}

describe('REP_PROFILE_CARD_REMAINING_PARITY', () => {
  it('remaining is canonical max(target - completed, 0), summed across cards', () => {
    const summary = summarizeProfileCards(
      [
        card('a', 'ON_TRACK', 'own', { targetCount: 10, completedCount: 6, remaining: 4 }),
        card('b', 'BEHIND', 'own', { targetCount: 8, completedCount: 3, remaining: 5 }),
      ],
      0,
    )
    expect(summary.totalTarget).toBe(18)
    expect(summary.totalCompleted).toBe(9)
    expect(summary.totalRemaining).toBe(9)
    expect(summary.percent).toBe(50)
  })

  it('a complete card contributes zero remaining and is never negative', () => {
    const summary = summarizeProfileCards(
      [card('a', 'COMPLETE', 'own', { targetCount: 10, completedCount: 10, remaining: 0 })],
      0,
    )
    expect(summary.totalRemaining).toBe(0)
    expect(summary.percent).toBe(100)
  })

  it('counts only behind and at-risk profiles as needing attention', () => {
    const summary = summarizeProfileCards(
      [
        card('a', 'AT_RISK', 'own'),
        card('b', 'BEHIND', 'own'),
        card('c', 'ON_TRACK', 'own'),
        card('d', 'COMPLETE', 'own'),
        card('e', null, 'own', { targetCount: 0, completedCount: 0, remaining: 0 }),
      ],
      0,
    )
    expect(summary.behindCount).toBe(2)
  })
})

describe('REP_PROFILE_CARD_TARGET_BREAKDOWN', () => {
  it('keeps only real categories, most-left first, capped at four', () => {
    const { items, more } = buildActivityBreakdown(
      progress({
        targets: [
          { activityType: 'dm', label: 'DMs', targetCount: 5, completedCount: 3, remaining: 2 },
          { activityType: 'followup', label: 'Follow-ups', targetCount: 2, completedCount: 1, remaining: 1 },
          { activityType: 'prospect_extracted', label: 'Prospects', targetCount: 0, completedCount: 0, remaining: 0 },
          { activityType: 'application', label: 'Proposals', targetCount: 4, completedCount: 1, remaining: 3 },
          { activityType: 'email', label: 'Emails', targetCount: 3, completedCount: 1, remaining: 2 },
          { activityType: 'connection_request', label: 'Connections', targetCount: 2, completedCount: 0, remaining: 2 },
        ],
      }),
    )
    expect(items).toHaveLength(4)
    expect(more).toBe(1)
    expect(items[0].label).toBe('Proposals')
    expect(items.some((item) => item.label === 'Prospects')).toBe(false)
  })

  it('passes canonical target numbers through without recalculating them', () => {
    const { items } = buildActivityBreakdown(
      progress({
        targets: [
          { activityType: 'dm', label: 'DMs', targetCount: 5, completedCount: 3, remaining: 2 },
        ],
      }),
    )
    expect(items[0]).toMatchObject({ targetCount: 5, completedCount: 3, remaining: 2, complete: false })
  })

  it('marks a finished category complete instead of inventing a new state', () => {
    const { items } = buildActivityBreakdown(
      progress({
        targets: [
          { activityType: 'prospect_extracted', label: 'Prospects', targetCount: 2, completedCount: 2, remaining: 0 },
        ],
      }),
    )
    expect(items[0].complete).toBe(true)
  })
})

describe('REP_PROFILE_CARD_NO_FAKE_ZERO_TARGET', () => {
  it('a profile with no target renders No target, never a zero progress bar', () => {
    expect(statusLabel(null, false)).toBe('No target')
    expect(statusTone(null, false)).toBe('neutral')
    const bare = progress({ targetCount: 0, completedCount: 0, remaining: 0, status: null, targets: [] })
    expect(buildActivityBreakdown(bare).items).toHaveLength(0)
    expect(buildActivityBreakdown(bare).more).toBe(0)
  })
})

describe('REP_PROFILE_CARD_ATTENTION_PARITY', () => {
  it('attention is the canonical work truth, verbatim', () => {
    expect(buildAttentionLine({ replies: 2, followUps: 1, tasks: 1 }).text).toBe(
      '2 replies waiting · 1 follow-up · 1 task',
    )
    expect(buildAttentionLine({ replies: 1, followUps: 0, tasks: 2 }).text).toBe('1 reply waiting · 2 tasks')
  })

  it('a clear inbox states so instead of rendering an empty warning', () => {
    expect(buildAttentionLine({ replies: 0, followUps: 0, tasks: 0 })).toEqual({
      text: 'Inbox clear · No overdue work',
      tone: 'neutral',
    })
  })
})

describe('REP_PROFILE_CARD_COVERAGE_CONTEXT', () => {
  it('a covering card names the primary and the end date', () => {
    const covering = {
      profile: profile({ primaryRepName: 'Dawood', activeCoverageUntil: '2026-11-09' }),
      kind: 'covering' as const,
      progress: null,
    }
    expect(ownershipLine(covering, 'Nov 9')).toBe('Covering for Dawood · until Nov 9')
  })

  it('a primary card uses ownership language, not assignment terminology', () => {
    const own = { profile: profile(), kind: 'own' as const, progress: null }
    expect(ownershipLine(own, null)).toBe('Primary responsibility')
  })
})

describe('REP_PROFILE_CARD_UNIQUE_RESPONSIBILITY', () => {
  it('a profile that is both own and covering renders exactly one card, as primary', () => {
    const cards = buildProfileCards(
      [profile({ profileId: 'p1', name: 'Hassan' })],
      [profile({ profileId: 'p1', name: 'Hassan', activeCoveringRepId: 'r2' })],
      new Map(),
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].kind).toBe('own')
  })

  it('orders by canonical severity, primary before covering at equal severity', () => {
    const ordered = sortProfileCards([
      card('complete', 'COMPLETE'),
      card('ontrack', 'ON_TRACK'),
      card('notstarted', 'NOT_STARTED'),
      card('behind', 'BEHIND'),
      card('atrisk', 'AT_RISK'),
      card('atrisk-cover', 'AT_RISK', 'covering'),
    ])
    expect(ordered.map((entry) => entry.profile.profileId)).toEqual([
      'atrisk',
      'atrisk-cover',
      'behind',
      'notstarted',
      'ontrack',
      'complete',
    ])
  })
})
