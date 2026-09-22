import { describe, it, expect } from 'vitest'
import {
  computeCategoryStatus,
  computeOverallStatus,
  canCloseDay,
  determineDayCloseStatus,
  dayProgress,
  workingMinutesRemaining,
  aggregateProgress,
  remaining,
} from '@/lib/relay/accountability-engine'
import type { DailyProgress, DailyContract } from '@/lib/domain/types'

describe('enhanced accountability-engine', () => {
  describe('computeCategoryStatus', () => {
    it('returns completed when target is met', () => {
      expect(computeCategoryStatus(30, 30, 0.5)).toBe('completed')
      expect(computeCategoryStatus(30, 35, 0.5)).toBe('completed')
    })

    it('returns completed when target is 0', () => {
      expect(computeCategoryStatus(0, 0, 0.5)).toBe('completed')
    })

    it('returns on_track when progress is proportional', () => {
      // 50% day elapsed, 45% done → within tolerance
      expect(computeCategoryStatus(100, 45, 0.5)).toBe('on_track')
    })

    it('returns at_risk when significantly behind', () => {
      // 72% day elapsed, only 30% done → behind
      expect(computeCategoryStatus(90, 27, 0.72)).toBe('at_risk')
    })

    it('returns at_risk when very late with little done', () => {
      expect(computeCategoryStatus(30, 5, 0.85)).toBe('at_risk')
    })

    it('returns on_track at start of day', () => {
      expect(computeCategoryStatus(30, 0, 0)).toBe('on_track')
    })
  })

  describe('computeOverallStatus', () => {
    const baseProgress: DailyProgress = {
      qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
      connections: { completed: 30, target: 30, remaining: 0 },
      firstDms: { completed: 30, target: 30, remaining: 0 },
      emails: { completed: 30, target: 30, remaining: 0 },
      followups: { completed: 25, target: 25, remaining: 0 },
      dueReplies: { completed: 100, target: 100, remaining: 0 },
      meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
      logging: { completed: 100, target: 100, remaining: 0 },
    }

    it('returns completed when all categories complete', () => {
      expect(computeOverallStatus(baseProgress, 0.5)).toBe('completed')
    })

    it('returns at_risk when one category is behind', () => {
      const progress: DailyProgress = {
        ...baseProgress,
        firstDms: { completed: 5, target: 30, remaining: 25 },
      }
      expect(computeOverallStatus(progress, 0.72)).toBe('at_risk')
    })

    it('returns completed when no targets exist', () => {
      const emptyProgress: DailyProgress = {
        qualifiedProspects: { completed: 0, target: 0, remaining: 0 },
        connections: { completed: 0, target: 0, remaining: 0 },
        firstDms: { completed: 0, target: 0, remaining: 0 },
        emails: { completed: 0, target: 0, remaining: 0 },
        followups: { completed: 0, target: 0, remaining: 0 },
        dueReplies: { completed: 0, target: 0, remaining: 0 },
        meaningfulTouches: { completed: 0, target: 0, remaining: 0 },
        logging: { completed: 0, target: 0, remaining: 0 },
      }
      expect(computeOverallStatus(emptyProgress, 0.5)).toBe('completed')
    })

    it('prevents 90 connections from hiding 0 DMs', () => {
      const progress: DailyProgress = {
        ...baseProgress,
        connections: { completed: 90, target: 30, remaining: 0 },
        firstDms: { completed: 0, target: 30, remaining: 30 },
      }
      expect(computeOverallStatus(progress, 0.5)).toBe('at_risk')
    })
  })

  describe('canCloseDay', () => {
    const completeProgress: DailyProgress = {
      qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
      connections: { completed: 30, target: 30, remaining: 0 },
      firstDms: { completed: 30, target: 30, remaining: 0 },
      emails: { completed: 30, target: 30, remaining: 0 },
      followups: { completed: 25, target: 25, remaining: 0 },
      dueReplies: { completed: 100, target: 100, remaining: 0 },
      meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
      logging: { completed: 100, target: 100, remaining: 0 },
    }

    it('allows close when all targets met', () => {
      const result = canCloseDay(completeProgress, false)
      expect(result.eligible).toBe(true)
      expect(Object.keys(result.remaining).length).toBe(0)
    })

    it('blocks close when connections remain', () => {
      const progress: DailyProgress = {
        ...completeProgress,
        connections: { completed: 20, target: 30, remaining: 10 },
      }
      const result = canCloseDay(progress, false)
      expect(result.eligible).toBe(false)
      expect(result.remaining.connections).toBe(10)
    })

    it('blocks close when multiple categories remain', () => {
      const progress: DailyProgress = {
        ...completeProgress,
        connections: { completed: 20, target: 30, remaining: 10 },
        firstDms: { completed: 15, target: 30, remaining: 15 },
        followups: { completed: 20, target: 25, remaining: 5 },
      }
      const result = canCloseDay(progress, false)
      expect(result.eligible).toBe(false)
      expect(result.remaining.connections).toBe(10)
      expect(result.remaining.firstDms).toBe(15)
      expect(result.remaining.followups).toBe(5)
    })

    it('allows close with approved exception even with remaining work', () => {
      const progress: DailyProgress = {
        ...completeProgress,
        connections: { completed: 20, target: 30, remaining: 10 },
      }
      const result = canCloseDay(progress, true)
      expect(result.eligible).toBe(true)
    })

    it('ignores categories with no target', () => {
      const progress: DailyProgress = {
        qualifiedProspects: { completed: 0, target: 0, remaining: 0 },
        connections: { completed: 30, target: 30, remaining: 0 },
        firstDms: { completed: 0, target: 0, remaining: 0 },
        emails: { completed: 0, target: 0, remaining: 0 },
        followups: { completed: 0, target: 0, remaining: 0 },
        dueReplies: { completed: 0, target: 0, remaining: 0 },
        meaningfulTouches: { completed: 0, target: 0, remaining: 0 },
        logging: { completed: 0, target: 0, remaining: 0 },
      }
      const result = canCloseDay(progress, false)
      expect(result.eligible).toBe(true)
    })
  })

  describe('determineDayCloseStatus', () => {
    const completeProgress: DailyProgress = {
      qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
      connections: { completed: 30, target: 30, remaining: 0 },
      firstDms: { completed: 30, target: 30, remaining: 0 },
      emails: { completed: 30, target: 30, remaining: 0 },
      followups: { completed: 25, target: 25, remaining: 0 },
      dueReplies: { completed: 100, target: 100, remaining: 0 },
      meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
      logging: { completed: 100, target: 100, remaining: 0 },
    }

    it('returns completed when all work done', () => {
      expect(determineDayCloseStatus(completeProgress, false, false, true)).toBe('completed')
    })

    it('returns completed_with_exception when exception approved', () => {
      const incompleteProgress: DailyProgress = {
        ...completeProgress,
        connections: { completed: 20, target: 30, remaining: 10 },
      }
      expect(determineDayCloseStatus(incompleteProgress, true, true, true)).toBe('completed_with_exception')
    })

    it('returns missed when work remains and no exception', () => {
      const incompleteProgress: DailyProgress = {
        ...completeProgress,
        connections: { completed: 20, target: 30, remaining: 10 },
      }
      expect(determineDayCloseStatus(incompleteProgress, false, false, true)).toBe('missed')
    })

    it('returns at_risk (missed) when not available', () => {
      // When not available, the day is treated as missed (no work possible)
      expect(determineDayCloseStatus(completeProgress, false, false, false)).toBe('missed')
    })
  })

  describe('workingMinutesRemaining', () => {
    it('returns correct remaining minutes at noon UTC', () => {
      const d = new Date('2024-01-15T12:00:00Z')
      // 12:00 → 5 hours remaining (12:00 to 17:00) = 300 minutes
      expect(workingMinutesRemaining(d, 'UTC')).toBe(300)
    })

    it('returns 0 after end of day', () => {
      const d = new Date('2024-01-15T18:00:00Z')
      expect(workingMinutesRemaining(d, 'UTC')).toBe(0)
    })
  })

  describe('aggregateProgress', () => {
    it('aggregates multiple identities', () => {
      const contracts: DailyContract[] = [
        { revenueIdentityId: 'a', identityName: 'A', annualRevenueTarget: 100000, qualifiedProspects: 25, connections: 15, firstDms: 15, emails: 15, followups: 12, dueRepliesPct: 100, meaningfulTouches: 45, loggingCompletenessPct: 100, allocationPct: 50 },
        { revenueIdentityId: 'b', identityName: 'B', annualRevenueTarget: 100000, qualifiedProspects: 25, connections: 15, firstDms: 15, emails: 15, followups: 12, dueRepliesPct: 100, meaningfulTouches: 45, loggingCompletenessPct: 100, allocationPct: 50 },
      ]
      const progresses: DailyProgress[] = [
        {
          qualifiedProspects: { completed: 25, target: 25, remaining: 0 },
          connections: { completed: 15, target: 15, remaining: 0 },
          firstDms: { completed: 15, target: 15, remaining: 0 },
          emails: { completed: 15, target: 15, remaining: 0 },
          followups: { completed: 12, target: 12, remaining: 0 },
          dueReplies: { completed: 100, target: 100, remaining: 0 },
          meaningfulTouches: { completed: 45, target: 45, remaining: 0 },
          logging: { completed: 100, target: 100, remaining: 0 },
        },
        {
          qualifiedProspects: { completed: 20, target: 25, remaining: 5 },
          connections: { completed: 10, target: 15, remaining: 5 },
          firstDms: { completed: 10, target: 15, remaining: 5 },
          emails: { completed: 10, target: 15, remaining: 5 },
          followups: { completed: 8, target: 12, remaining: 4 },
          dueReplies: { completed: 100, target: 100, remaining: 0 },
          meaningfulTouches: { completed: 40, target: 45, remaining: 5 },
          logging: { completed: 100, target: 100, remaining: 0 },
        },
      ]

      const result = aggregateProgress(contracts, progresses)
      expect(result.totalTarget).toBe(204) // (15+15+15+12+45) * 2
      expect(result.totalCompleted).toBe(180) // sum of completed across both
      expect(result.byProgress.connections.target).toBe(30) // 15 + 15
      expect(result.byProgress.connections.completed).toBe(25) // 15 + 10
      expect(result.byProgress.connections.remaining).toBe(5)
    })

    it('returns zero progress for empty input', () => {
      const result = aggregateProgress([], [])
      expect(result.totalTarget).toBe(0)
      expect(result.totalCompleted).toBe(0)
    })
  })
})
