import { describe, it, expect } from 'vitest'
import {
  evaluateDayCloseEligibility,
  buildCompletionSnapshot,
  buildTargetSnapshot,
  validateExceptionRequest,
  availableExceptionReasons,
} from '@/lib/relay/day-close-service'
import type { DailyProgress } from '@/lib/domain/types'

describe('day-close-service', () => {
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

  const incompleteProgress: DailyProgress = {
    qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
    connections: { completed: 20, target: 30, remaining: 10 },
    firstDms: { completed: 15, target: 30, remaining: 15 },
    emails: { completed: 25, target: 30, remaining: 5 },
    followups: { completed: 20, target: 25, remaining: 5 },
    dueReplies: { completed: 100, target: 100, remaining: 0 },
    meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
    logging: { completed: 100, target: 100, remaining: 0 },
  }

  describe('evaluateDayCloseEligibility', () => {
    it('allows close when all targets met', () => {
      const result = evaluateDayCloseEligibility({
        progress: completeProgress,
        dayElapsed: 0.5,
        availabilityStatus: 'working',
        hasContract: true,
        existingDayCloseStatus: null,
        exceptionReason: null,
        exceptionApproved: false,
      })
      expect(result.eligible).toBe(true)
      expect(result.status).toBe('completed')
      expect(result.reason).toBeNull()
    })

    it('blocks close when work remains', () => {
      const result = evaluateDayCloseEligibility({
        progress: incompleteProgress,
        dayElapsed: 0.5,
        availabilityStatus: 'working',
        hasContract: true,
        existingDayCloseStatus: null,
        exceptionReason: null,
        exceptionApproved: false,
      })
      expect(result.eligible).toBe(false)
      expect(result.status).toBe('in_progress')
      expect(result.reason).toContain('blocked')
      expect(result.remainingByCategory.connections).toBe(10)
      expect(result.remainingByCategory.firstDms).toBe(15)
      expect(result.remainingByCategory.emails).toBe(5)
      expect(result.remainingByCategory.followups).toBe(5)
    })

    it('allows close with approved exception', () => {
      const result = evaluateDayCloseEligibility({
        progress: incompleteProgress,
        dayElapsed: 0.5,
        availabilityStatus: 'working',
        hasContract: true,
        existingDayCloseStatus: null,
        exceptionReason: 'channel_limit',
        exceptionApproved: true,
      })
      expect(result.eligible).toBe(true)
      expect(result.status).toBe('completed')
    })

    it('blocks when not available', () => {
      const result = evaluateDayCloseEligibility({
        progress: completeProgress,
        dayElapsed: 0.5,
        availabilityStatus: 'leave',
        hasContract: true,
        existingDayCloseStatus: null,
        exceptionReason: null,
        exceptionApproved: false,
      })
      expect(result.eligible).toBe(false)
      expect(result.status).toBe('not_started')
      expect(result.reason).toContain('leave')
    })

    it('returns idempotent for already completed', () => {
      const result = evaluateDayCloseEligibility({
        progress: incompleteProgress,
        dayElapsed: 0.5,
        availabilityStatus: 'working',
        hasContract: true,
        existingDayCloseStatus: 'completed',
        exceptionReason: null,
        exceptionApproved: false,
      })
      expect(result.eligible).toBe(true)
      expect(result.status).toBe('completed')
    })

    it('blocks when no contract', () => {
      const result = evaluateDayCloseEligibility({
        progress: completeProgress,
        dayElapsed: 0.5,
        availabilityStatus: 'working',
        hasContract: false,
        existingDayCloseStatus: null,
        exceptionReason: null,
        exceptionApproved: false,
      })
      expect(result.eligible).toBe(false)
      expect(result.reason).toContain('No active contract')
    })

    it('indicates exception can resolve when blocked', () => {
      const result = evaluateDayCloseEligibility({
        progress: incompleteProgress,
        dayElapsed: 0.5,
        availabilityStatus: 'working',
        hasContract: true,
        existingDayCloseStatus: null,
        exceptionReason: null,
        exceptionApproved: false,
      })
      expect(result.exceptionCanResolve).toBe(true)
    })
  })

  describe('buildCompletionSnapshot', () => {
    it('captures all metric counts', () => {
      const snapshot = buildCompletionSnapshot(incompleteProgress)
      expect(snapshot.connections).toBe(20)
      expect(snapshot.firstDms).toBe(15)
      expect(snapshot.emails).toBe(25)
      expect(snapshot.followups).toBe(20)
      expect(snapshot.qualifiedProspects).toBe(50)
    })
  })

  describe('buildTargetSnapshot', () => {
    it('captures all target counts', () => {
      const snapshot = buildTargetSnapshot(incompleteProgress)
      expect(snapshot.connections).toBe(30)
      expect(snapshot.firstDms).toBe(30)
      expect(snapshot.emails).toBe(30)
      expect(snapshot.followups).toBe(25)
    })
  })

  describe('validateExceptionRequest', () => {
    it('validates exception with remaining work', () => {
      const result = validateExceptionRequest('channel_limit', 'LinkedIn daily limit', incompleteProgress)
      expect(result.valid).toBe(true)
    })

    it('rejects exception when no remaining work', () => {
      const result = validateExceptionRequest('other', 'test', completeProgress)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('No remaining work')
    })

    it('requires note for "other" reason', () => {
      const result = validateExceptionRequest('other', '', incompleteProgress)
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('details')
    })

    it('accepts "other" with sufficient note', () => {
      const result = validateExceptionRequest('other', 'Detailed explanation here.', incompleteProgress)
      expect(result.valid).toBe(true)
    })
  })

  describe('availableExceptionReasons', () => {
    it('returns all standard reasons', () => {
      const reasons = availableExceptionReasons(incompleteProgress)
      expect(reasons.length).toBe(7)
      expect(reasons.map((r) => r.reason)).toContain('no_qualified_inventory')
      expect(reasons.map((r) => r.reason)).toContain('channel_limit')
      expect(reasons.map((r) => r.reason)).toContain('identity_blocked')
      expect(reasons.map((r) => r.reason)).toContain('system_issue')
      expect(reasons.map((r) => r.reason)).toContain('client_priority')
      expect(reasons.map((r) => r.reason)).toContain('manager_approved')
      expect(reasons.map((r) => r.reason)).toContain('other')
    })
  })
})
