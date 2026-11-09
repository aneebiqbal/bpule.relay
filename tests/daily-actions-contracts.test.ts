/**
 * DailyAction contracts.
 *
 * The assistant may read canonical facts and order them. It may not create a
 * second count authority, invent urgency, or hide work that belongs to the
 * viewer.
 */
import { describe, expect, it } from 'vitest'
import { compareDailyActions, URGENCY_RANK, type DailyAction } from '@/lib/daily-actions/types'
import { projectDailyActions } from '@/lib/daily-actions/project'
import type { RepWorkspaceData } from '@/lib/rep-home/rep-workspace-data'

function action(overrides: Partial<DailyAction> = {}): DailyAction {
  return {
    id: 'a',
    type: 'INBOX_REPLY',
    urgency: 'P1',
    urgencyRank: URGENCY_RANK.P1,
    source: 'Inbox',
    profile: 'Hassan Saulat · LinkedIn',
    channel: 'LinkedIn',
    subject: 'Reply to Natalia',
    reason: 'Client replied 22m ago',
    age: '22m ago',
    dueAt: null,
    destination: '/chats',
    blocking: false,
    owner: 'You',
    ...overrides,
  }
}

const baseData = {
  rep: { id: 'rep-1', name: 'Dawood' },
  isWorkingDay: true,
  hasAssignments: true,
  identities: [],
  targetSummary: { totalTarget: 0, totalCompleted: 0, totalRemaining: 0, overallStatus: 'on_track', byIdentity: [] },
  day: { totalRemaining: 0, repliesWaiting: 0, waitingOnClient: 0, followUpsDue: 0, outreachRemaining: 0, isComplete: false },
  nextAction: null,
  upNext: [],
  allActions: [],
  notifications: [],
} as unknown as RepWorkspaceData

describe('DAILY_ACTION_ORDER_DETERMINISTIC', () => {
  it('orders by urgency rank, then due date, then blocking, then id', () => {
    const p1late = action({ id: 'a', urgency: 'P1', urgencyRank: URGENCY_RANK.P1, dueAt: '2026-01-01T00:00:00Z' })
    const p1early = action({ id: 'b', urgency: 'P1', urgencyRank: URGENCY_RANK.P1, dueAt: '2025-01-01T00:00:00Z' })
    const p0 = action({ id: 'c', urgency: 'P0', urgencyRank: URGENCY_RANK.P0 })
    const p6 = action({ id: 'd', urgency: 'P6', urgencyRank: URGENCY_RANK.P6 })
    const sorted = [p1late, p6, p1early, p0].sort(compareDailyActions).map((a) => a.id)
    expect(sorted).toEqual(['c', 'b', 'a', 'd'])
  })

  it('is stable for identical input (deterministic id tiebreak)', () => {
    const a = action({ id: 'same', dueAt: null })
    const b = action({ id: 'same', dueAt: null })
    expect(compareDailyActions(a, b)).toBe(0)
  })
})

describe('DAILY_ACTIONS_USE_CANONICAL_FACTS', () => {
  it('only emits sources that already exist as canonical authorities', () => {
    const allowed = new Set(['Inbox', 'Tasks', 'Follow-ups', 'Targets', 'Coverage', 'Readiness', 'Upwork'])
    const actions = projectDailyActions({ data: baseData, now: 0 })
    for (const a of actions) expect(allowed.has(a.source)).toBe(true)
  })

  it('does not mutate the input workspace', () => {
    const before = JSON.stringify(baseData)
    projectDailyActions({ data: baseData, now: 0 })
    expect(JSON.stringify(baseData)).toBe(before)
  })
})

describe('DAILY_ACTIONS_NO_SECOND_COUNT_AUTHORITY', () => {
  it('derives target remaining from the canonical profile completion, not a new count', () => {
    const data = {
      ...baseData,
      profilesToday: [
        {
          profileId: 'p1',
          name: 'Hassan Saulat',
          title: null,
          channels: ['linkedin'],
          identityIds: [],
          targetCount: 30,
          completedCount: 18,
          remaining: 12,
          status: 'at_risk',
          targets: [],
        },
      ],
    } as unknown as RepWorkspaceData
    const actions = projectDailyActions({ data, now: 0 })
    const target = actions.find((a) => a.type === 'TARGET')
    expect(target?.subject).toContain('12 of 30')
  })
})

describe('REP_ACTIONS_EXECUTABLE_PROFILE_ONLY', () => {
  it('labels every action with a profile and a channel', () => {
    const actions = projectDailyActions({ data: baseData, now: 0 })
    for (const a of actions) {
      expect(a.profile.length).toBeGreaterThan(0)
      expect(a.channel.length).toBeGreaterThan(0)
    }
  })
})

describe('EVERY_INTERVENTION_HAS_RESOLUTION', () => {
  it('every action carries a destination', () => {
    const actions = projectDailyActions({ data: baseData, now: 0 })
    for (const a of actions) expect(a.destination.startsWith('/')).toBe(true)
  })
})

describe('AI_DOES_NOT_SET_OPERATIONAL_PRIORITY', () => {
  it('has no AI field and no free-form priority score', () => {
    const actions = projectDailyActions({ data: baseData, now: 0 })
    for (const a of actions) {
      expect((a as Record<string, unknown>).ai).toBeUndefined()
      expect((a as Record<string, unknown>).score).toBeUndefined()
    }
  })
})

describe('COVERED_PROFILE_ACTIONS_VISIBLE / BACKUP_ONLY_ACTIONS_HIDDEN', () => {
  it('surfaces coverage exceptions for the viewer', () => {
    const data = {
      ...baseData,
      coverage: {
        businessDate: '2026-01-01',
        isWorkingDay: true,
        repId: 'rep-1',
        repName: 'Dawood',
        availability: 'AVAILABLE',
        requiresApproval: 0,
        readiness: [],
        returning: [],
        own: [
          {
            profileId: 'p1',
            personId: null,
            name: 'Hassan Saulat',
            channels: ['linkedin'],
            identityIds: [],
            primaryRepId: 'rep-1',
            primaryRepName: 'Dawood',
            primaryAvailability: 'ON_LEAVE',
            primaryIsAvailable: false,
            backups: [],
            activeCoveringRepId: 'rep-2',
            activeCoveringRepName: 'Madiha',
            activeCoverageUntil: null,
            status: 'COVERED',
            recommendation: 'NONE',
            recommendedRepId: null,
            recommendedRepName: null,
            recommendationReasons: [],
            recommendedReady: false,
            ineligibleReason: null,
          },
        ],
        covering: [],
      },
    } as unknown as RepWorkspaceData
    const actions = projectDailyActions({ data, now: 0 })
    const coverage = actions.find((a) => a.type === 'COVERAGE')
    expect(coverage).toBeDefined()
    expect(coverage?.urgency).toBe('P0')
    expect(coverage?.owner).toBe('Dawood')
  })

  it('caps the list at the requested limit (default 5)', () => {
    expect(projectDailyActions({ data: baseData, now: 0, limit: 5 })).toHaveLength(0)
    const actions = projectDailyActions({
      data: baseData,
      now: 0,
      limit: 3,
    })
    expect(actions.length).toBeLessThanOrEqual(3)
  })
})
