import { describe, it, expect } from 'vitest'
import {
  computeStatus,
  dayProgress,
  closeDayStatus,
  countConsecutiveMisses,
  isWorkingDay,
  notificationDedupeKey,
  remaining,
  needsAttention,
} from '@/lib/relay/accountability-engine'
import type { AccountabilityStatus } from '@/lib/domain/types'

describe('accountability-engine', () => {
  describe('computeStatus', () => {
    it('returns completed when target met', () => {
      expect(computeStatus(35, 35, 0.5)).toBe('completed')
      expect(computeStatus(35, 40, 0.3)).toBe('completed')
    })

    it('returns completed when no target', () => {
      expect(computeStatus(0, 0, 0.5)).toBe('completed')
    })

    it('returns on_track when progress is proportional', () => {
      // 50% progress, 45% done → within tolerance
      expect(computeStatus(100, 45, 0.5)).toBe('on_track')
    })

    it('returns at_risk when significantly behind', () => {
      // 60% progress, 20% done → more than 25% behind
      expect(computeStatus(100, 20, 0.6)).toBe('at_risk')
    })

    it('returns on_track at start of day', () => {
      expect(computeStatus(35, 0, 0)).toBe('on_track')
    })
  })

  describe('dayProgress', () => {
    it('returns 0 before business hours', () => {
      const d = new Date('2024-01-15T08:00:00Z')
      expect(dayProgress(d, 'UTC')).toBe(0)
    })

    it('returns 1 after business hours', () => {
      const d = new Date('2024-01-15T18:00:00Z')
      expect(dayProgress(d, 'UTC')).toBe(1)
    })

    it('returns midpoint at noon', () => {
      const d = new Date('2024-01-15T13:00:00Z')
      // 13:00 UTC = 4 hours into 8-hour day = 0.5
      expect(dayProgress(d, 'UTC')).toBeCloseTo(0.5, 1)
    })
  })

  describe('closeDayStatus', () => {
    it('returns completed when target met', () => {
      expect(closeDayStatus(35, 35)).toBe('completed')
      expect(closeDayStatus(10, 15)).toBe('completed')
    })

    it('returns missed when target not met', () => {
      expect(closeDayStatus(35, 34)).toBe('missed')
      expect(closeDayStatus(10, 0)).toBe('missed')
    })
  })

  describe('countConsecutiveMisses', () => {
    it('counts consecutive missed days from start', () => {
      const days = [
        { date: '2024-01-15', status: 'missed' as AccountabilityStatus },
        { date: '2024-01-14', status: 'missed' as AccountabilityStatus },
        { date: '2024-01-13', status: 'missed' as AccountabilityStatus },
        { date: '2024-01-12', status: 'completed' as AccountabilityStatus },
      ]
      expect(countConsecutiveMisses(days)).toBe(3)
    })

    it('stops at first non-missed day', () => {
      const days = [
        { date: '2024-01-15', status: 'completed' as AccountabilityStatus },
        { date: '2024-01-14', status: 'missed' as AccountabilityStatus },
      ]
      expect(countConsecutiveMisses(days)).toBe(0)
    })

    it('returns 0 for empty array', () => {
      expect(countConsecutiveMisses([])).toBe(0)
    })
  })

  describe('isWorkingDay', () => {
    it('returns true for weekdays', () => {
      // 2024-01-15 is a Monday
      const monday = new Date('2024-01-15T12:00:00')
      expect(isWorkingDay(monday, [1, 2, 3, 4, 5])).toBe(true)
    })

    it('returns false for weekends', () => {
      // 2024-01-13 is a Saturday
      const saturday = new Date('2024-01-13T12:00:00')
      expect(isWorkingDay(saturday, [1, 2, 3, 4, 5])).toBe(false)
    })

    it('uses default Mon-Fri when no workingDays provided', () => {
      const sunday = new Date('2024-01-14T12:00:00')
      expect(isWorkingDay(sunday)).toBe(false)
    })
  })

  describe('notificationDedupeKey', () => {
    it('generates consistent keys', () => {
      expect(notificationDedupeKey('behind', 'rep-1', 'id-1', '2024-01-15', 'dm'))
        .toBe('behind:rep-1:id-1:2024-01-15:dm')
    })

    it('handles null identity', () => {
      expect(notificationDedupeKey('missed', 'rep-1', null, '2024-01-15'))
        .toBe('missed:rep-1:none:2024-01-15')
    })
  })

  describe('remaining', () => {
    it('floors at zero', () => {
      expect(remaining(35, 40)).toBe(0)
      expect(remaining(35, 35)).toBe(0)
    })

    it('returns difference', () => {
      expect(remaining(35, 22)).toBe(13)
    })
  })

  describe('needsAttention', () => {
    it('returns false when target met', () => {
      expect(needsAttention(35, 35, 0.9, 0).needs).toBe(false)
    })

    it('returns critical for 3+ consecutive misses', () => {
      const result = needsAttention(35, 10, 0.5, 3)
      expect(result.needs).toBe(true)
      expect(result.severity).toBe('critical')
      expect(result.reason).toContain('3-day')
    })

    it('returns warning when at risk', () => {
      const result = needsAttention(100, 20, 0.6, 0)
      expect(result.needs).toBe(true)
      expect(result.severity).toBe('warning')
    })

    it('returns false when no target', () => {
      expect(needsAttention(0, 0, 0.5, 0).needs).toBe(false)
    })
  })
})
