import { describe, it, expect } from 'vitest'
import { generateWarnings, generateAdminWarnings } from '@/lib/relay/warning-service'
import type { DailyProgress } from '@/lib/domain/types'

describe('warning-service', () => {
  const baseProgress: DailyProgress = {
    qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
    connections: { completed: 20, target: 30, remaining: 10 },
    firstDms: { completed: 15, target: 30, remaining: 15 },
    emails: { completed: 25, target: 30, remaining: 5 },
    followups: { completed: 20, target: 25, remaining: 5 },
    dueReplies: { completed: 100, target: 100, remaining: 0 },
    meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
    logging: { completed: 100, target: 100, remaining: 0 },
  }

  describe('generateWarnings', () => {
    it('returns no warnings when not working', () => {
      const warnings = generateWarnings({
        progress: baseProgress,
        contracts: [],
        dayElapsed: 0.5,
        hasAssignments: true,
        isWorkingDay: false,
        availabilityStatus: 'leave',
        dayCloseStatus: null,
        totalRemaining: 35,
        totalCompleted: 80,
        totalTarget: 115,
      })
      expect(warnings.length).toBe(0)
    })

    it('shows no-assignments message when no assignments', () => {
      const warnings = generateWarnings({
        progress: {
          qualifiedProspects: { completed: 0, target: 0, remaining: 0 },
          connections: { completed: 0, target: 0, remaining: 0 },
          firstDms: { completed: 0, target: 0, remaining: 0 },
          emails: { completed: 0, target: 0, remaining: 0 },
          followups: { completed: 0, target: 0, remaining: 0 },
          dueReplies: { completed: 0, target: 0, remaining: 0 },
          meaningfulTouches: { completed: 0, target: 0, remaining: 0 },
          logging: { completed: 0, target: 0, remaining: 0 },
        },
        contracts: [],
        dayElapsed: 0.2,
        hasAssignments: false,
        isWorkingDay: true,
        availabilityStatus: 'working',
        dayCloseStatus: null,
        totalRemaining: 0,
        totalCompleted: 0,
        totalTarget: 0,
      })
      expect(warnings.length).toBe(1)
      expect(warnings[0].id).toBe('no-assignments')
    })

    it('shows early-day warning when nothing done', () => {
      const warnings = generateWarnings({
        progress: {
          ...baseProgress,
          connections: { completed: 0, target: 30, remaining: 30 },
          firstDms: { completed: 0, target: 30, remaining: 30 },
          emails: { completed: 0, target: 30, remaining: 30 },
          followups: { completed: 0, target: 25, remaining: 25 },
        },
        contracts: [],
        dayElapsed: 0.1,
        hasAssignments: true,
        isWorkingDay: true,
        availabilityStatus: 'working',
        dayCloseStatus: null,
        totalRemaining: 115,
        totalCompleted: 0,
        totalTarget: 115,
      })
      expect(warnings.length).toBe(1)
      expect(warnings[0].level).toBe('early')
      expect(warnings[0].actionable).toBe(true)
    })

    it('shows ready warning when all complete', () => {
      const warnings = generateWarnings({
        progress: {
          qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
          connections: { completed: 30, target: 30, remaining: 0 },
          firstDms: { completed: 30, target: 30, remaining: 0 },
          emails: { completed: 30, target: 30, remaining: 0 },
          followups: { completed: 25, target: 25, remaining: 0 },
          dueReplies: { completed: 100, target: 100, remaining: 0 },
          meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
          logging: { completed: 100, target: 100, remaining: 0 },
        },
        contracts: [],
        dayElapsed: 0.5,
        hasAssignments: true,
        isWorkingDay: true,
        availabilityStatus: 'working',
        dayCloseStatus: null,
        totalRemaining: 0,
        totalCompleted: 115,
        totalTarget: 115,
      })
      expect(warnings.length).toBe(1)
      expect(warnings[0].level).toBe('ready')
    })

    it('shows very-late warning when day nearly over with work remaining', () => {
      const warnings = generateWarnings({
        progress: baseProgress,
        contracts: [],
        dayElapsed: 0.9,
        hasAssignments: true,
        isWorkingDay: true,
        availabilityStatus: 'working',
        dayCloseStatus: null,
        totalRemaining: 35,
        totalCompleted: 80,
        totalTarget: 115,
      })
      expect(warnings.length).toBe(1)
      expect(warnings[0].level).toBe('very_late')
    })

    it('shows midday warning when behind pace', () => {
      const warnings = generateWarnings({
        progress: {
          ...baseProgress,
          connections: { completed: 5, target: 30, remaining: 25 },
          firstDms: { completed: 3, target: 30, remaining: 27 },
        },
        contracts: [],
        dayElapsed: 0.5,
        hasAssignments: true,
        isWorkingDay: true,
        availabilityStatus: 'working',
        dayCloseStatus: null,
        totalRemaining: 57,
        totalCompleted: 8,
        totalTarget: 60,
      })
      expect(warnings.length).toBe(1)
      expect(['midday', 'late']).toContain(warnings[0].level)
    })

    it('shows completion status when already closed', () => {
      const warnings = generateWarnings({
        progress: baseProgress,
        contracts: [],
        dayElapsed: 0.5,
        hasAssignments: true,
        isWorkingDay: true,
        availabilityStatus: 'working',
        dayCloseStatus: 'completed',
        totalRemaining: 0,
        totalCompleted: 115,
        totalTarget: 115,
      })
      expect(warnings.length).toBe(1)
      expect(warnings[0].id).toBe('day-complete')
    })

    it('provides actionable category links in warnings', () => {
      const warnings = generateWarnings({
        progress: baseProgress,
        contracts: [],
        dayElapsed: 0.9,
        hasAssignments: true,
        isWorkingDay: true,
        availabilityStatus: 'working',
        dayCloseStatus: null,
        totalRemaining: 35,
        totalCompleted: 80,
        totalTarget: 115,
      })
      expect(warnings[0].actionable).toBe(true)
      expect(warnings[0].categories.length).toBeGreaterThan(0)
      // Each category should have a href
      for (const cat of warnings[0].categories) {
        expect(cat.href).toBeTruthy()
      }
    })
  })

  describe('generateAdminWarnings', () => {
    it('generates warning for rep who has not started by midday', () => {
      const warnings = generateAdminWarnings([{
        repId: 'rep-1',
        repName: 'Hassan',
        identityName: 'Fizza',
        identityId: 'id-1',
        progress: {
          qualifiedProspects: { completed: 0, target: 50, remaining: 50 },
          connections: { completed: 0, target: 30, remaining: 30 },
          firstDms: { completed: 0, target: 30, remaining: 30 },
          emails: { completed: 0, target: 30, remaining: 30 },
          followups: { completed: 0, target: 25, remaining: 25 },
          dueReplies: { completed: 0, target: 100, remaining: 100 },
          meaningfulTouches: { completed: 0, target: 90, remaining: 90 },
          logging: { completed: 0, target: 100, remaining: 100 },
        },
        dayElapsed: 0.5,
        dayCloseStatus: null,
        exceptionReason: null,
        lastActivityAt: null,
      }])
      expect(warnings.length).toBe(1)
      expect(warnings[0].severity).toBe('warning')
      expect(warnings[0].message).toContain('Hassan')
    })

    it('generates warning for rep behind pace', () => {
      const warnings = generateAdminWarnings([{
        repId: 'rep-1',
        repName: 'Ahmed',
        identityName: 'Mehak',
        identityId: 'id-2',
        progress: {
          qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
          connections: { completed: 5, target: 30, remaining: 25 },
          firstDms: { completed: 3, target: 30, remaining: 27 },
          emails: { completed: 20, target: 30, remaining: 10 },
          followups: { completed: 20, target: 25, remaining: 5 },
          dueReplies: { completed: 100, target: 100, remaining: 0 },
          meaningfulTouches: { completed: 50, target: 90, remaining: 40 },
          logging: { completed: 100, target: 100, remaining: 0 },
        },
        dayElapsed: 0.7,
        dayCloseStatus: null,
        exceptionReason: null,
        lastActivityAt: '2024-01-15T10:00:00Z',
      }])
      expect(warnings.length).toBe(1)
      expect(warnings[0].message).toContain('Ahmed')
      expect(warnings[0].severity).toBe('critical')
    })

    it('shows exception requests', () => {
      const warnings = generateAdminWarnings([{
        repId: 'rep-1',
        repName: 'Abdullah',
        identityName: 'Aneeb',
        identityId: 'id-3',
        progress: {
          qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
          connections: { completed: 30, target: 30, remaining: 0 },
          firstDms: { completed: 20, target: 30, remaining: 10 },
          emails: { completed: 30, target: 30, remaining: 0 },
          followups: { completed: 25, target: 25, remaining: 0 },
          dueReplies: { completed: 100, target: 100, remaining: 0 },
          meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
          logging: { completed: 100, target: 100, remaining: 0 },
        },
        dayElapsed: 0.5,
        dayCloseStatus: null,
        exceptionReason: 'channel_limit',
        lastActivityAt: '2024-01-15T11:00:00Z',
      }])
      expect(warnings.length).toBe(1)
      expect(warnings[0].message).toContain('Abdullah')
      expect(warnings[0].message).toContain('channel_limit')
    })

    it('does not warn for completed reps', () => {
      const warnings = generateAdminWarnings([{
        repId: 'rep-1',
        repName: 'Hassan',
        identityName: 'Fizza',
        identityId: 'id-1',
        progress: {
          qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
          connections: { completed: 30, target: 30, remaining: 0 },
          firstDms: { completed: 30, target: 30, remaining: 0 },
          emails: { completed: 30, target: 30, remaining: 0 },
          followups: { completed: 25, target: 25, remaining: 0 },
          dueReplies: { completed: 100, target: 100, remaining: 0 },
          meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
          logging: { completed: 100, target: 100, remaining: 0 },
        },
        dayElapsed: 0.5,
        dayCloseStatus: 'completed',
        exceptionReason: null,
        lastActivityAt: '2024-01-15T15:00:00Z',
      }])
      expect(warnings.length).toBe(0)
    })
  })
})
