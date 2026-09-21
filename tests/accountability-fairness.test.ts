import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AccountabilityService } from '@/lib/relay/accountability-service'
import type { AccountabilityStore } from '@/lib/relay/accountability-service'
import type { DayClose, OperatorAvailability, DailyProgress } from '@/lib/domain/types'

function createMockStore(overrides: Partial<AccountabilityStore> = {}): AccountabilityStore {
  return {
    listAccountabilityTemplates: vi.fn().mockResolvedValue([]),
    getAccountabilityTemplate: vi.fn().mockResolvedValue(null),
    createAccountabilityTemplate: vi.fn().mockResolvedValue({} as any),
    updateAccountabilityTemplate: vi.fn().mockResolvedValue({} as any),
    deleteAccountabilityTemplate: vi.fn().mockResolvedValue(undefined),
    getActiveContract: vi.fn().mockResolvedValue(null),
    getContractById: vi.fn().mockResolvedValue(null),
    createContract: vi.fn().mockResolvedValue({} as any),
    updateContract: vi.fn().mockResolvedValue({} as any),
    supersedeContract: vi.fn().mockResolvedValue(undefined),
    listContractAllocations: vi.fn().mockResolvedValue([]),
    setContractAllocations: vi.fn().mockResolvedValue(undefined),
    getPersonAllocations: vi.fn().mockResolvedValue([]),
    getDayClose: vi.fn().mockResolvedValue(null),
    getDayCloseById: vi.fn().mockResolvedValue(null),
    createDayClose: vi.fn().mockResolvedValue({} as any),
    updateDayClose: vi.fn().mockResolvedValue({} as any),
    listDayCloses: vi.fn().mockResolvedValue([]),
    listTeamDayCloses: vi.fn().mockResolvedValue([]),
    getMonthlyReview: vi.fn().mockResolvedValue(null),
    createMonthlyReview: vi.fn().mockResolvedValue({} as any),
    updateMonthlyReview: vi.fn().mockResolvedValue({} as any),
    listMonthlyReviews: vi.fn().mockResolvedValue([]),
    listRewardPolicies: vi.fn().mockResolvedValue([]),
    createRewardPolicy: vi.fn().mockResolvedValue({} as any),
    updateRewardPolicy: vi.fn().mockResolvedValue({} as any),
    deleteRewardPolicy: vi.fn().mockResolvedValue(undefined),
    listRewardEligibility: vi.fn().mockResolvedValue([]),
    createRewardEligibility: vi.fn().mockResolvedValue({} as any),
    updateRewardEligibility: vi.fn().mockResolvedValue({} as any),
    getOperatorAvailability: vi.fn().mockResolvedValue(null),
    setOperatorAvailability: vi.fn().mockResolvedValue({} as any),
    listOperatorAvailability: vi.fn().mockResolvedValue([]),
    getMyDayView: vi.fn().mockResolvedValue({} as any),
    getTeamAccountabilityView: vi.fn().mockResolvedValue({} as any),
    getIdentityAccountabilityView: vi.fn().mockResolvedValue({} as any),
    getOwnerCommandCenterView: vi.fn().mockResolvedValue({} as any),
    getMonthlyReviewView: vi.fn().mockResolvedValue({} as any),
    ...overrides,
  }
}

describe('Accountability Fairness', () => {
  describe('Leave is not missed', () => {
    it('operator on leave should not be marked as missed', () => {
      const store = createMockStore()
      const service = new AccountabilityService(store)

      const availability: OperatorAvailability = {
        id: 'oa-1', organizationId: 'org-1', personId: 'person-1',
        date: '2026-09-21', status: 'leave', note: 'Annual leave', createdAt: '', updatedAt: '',
      }

      const result = service.isExpectedWorkingDay('2026-09-21', availability)
      expect(result).toBe(false)
    })

    it('operator on holiday should not be marked as missed', () => {
      const store = createMockStore()
      const service = new AccountabilityService(store)

      const availability: OperatorAvailability = {
        id: 'oa-1', organizationId: 'org-1', personId: 'person-1',
        date: '2026-09-21', status: 'holiday', note: 'Public holiday', createdAt: '', updatedAt: '',
      }

      const result = service.isExpectedWorkingDay('2026-09-21', availability)
      expect(result).toBe(false)
    })

    it('operator with approved_unavailable should not be marked as missed', () => {
      const store = createMockStore()
      const service = new AccountabilityService(store)

      const availability: OperatorAvailability = {
        id: 'oa-1', organizationId: 'org-1', personId: 'person-1',
        date: '2026-09-21', status: 'approved_unavailable', note: 'Doctor appointment', createdAt: '', updatedAt: '',
      }

      const result = service.isExpectedWorkingDay('2026-09-21', availability)
      expect(result).toBe(false)
    })
  })

  describe('Approved exception preserves consistency', () => {
    it('completed_with_exception counts toward streak', () => {
      const store = createMockStore()
      const service = new AccountabilityService(store)

      const dayCloses: DayClose[] = [
        { id: 'dc-1', status: 'completed_with_exception', date: '2026-09-21' } as DayClose,
        { id: 'dc-2', status: 'completed', date: '2026-09-20' } as DayClose,
        { id: 'dc-3', status: 'completed', date: '2026-09-19' } as DayClose,
      ]

      const streak = service.getStreak(dayCloses)
      expect(streak).toBe(3)
    })
  })

  describe('Insufficient data returns unknown', () => {
    it('quality status is unknown when no data exists', () => {
      const store = createMockStore()
      const service = new AccountabilityService(store)

      const progress: DailyProgress = {
        qualifiedProspects: { completed: 0, target: 0, remaining: 0 },
        connections: { completed: 0, target: 0, remaining: 0 },
        firstDms: { completed: 0, target: 0, remaining: 0 },
        emails: { completed: 0, target: 0, remaining: 0 },
        followups: { completed: 0, target: 0, remaining: 0 },
        dueReplies: { completed: 0, target: 0, remaining: 0 },
        meaningfulTouches: { completed: 0, target: 0, remaining: 0 },
        logging: { completed: 0, target: 0, remaining: 0 },
      }

      const completion = service.computeDailyCompletion(progress)
      expect(completion).toBe(0)
    })
  })

  describe('No fake zero conversion', () => {
    it('does not convert insufficient data to zero completion', () => {
      const store = createMockStore()
      const service = new AccountabilityService(store)

      const progress: DailyProgress = {
        qualifiedProspects: { completed: 0, target: 0, remaining: 0 },
        connections: { completed: 0, target: 0, remaining: 0 },
        firstDms: { completed: 0, target: 0, remaining: 0 },
        emails: { completed: 0, target: 0, remaining: 0 },
        followups: { completed: 0, target: 0, remaining: 0 },
        dueReplies: { completed: 0, target: 0, remaining: 0 },
        meaningfulTouches: { completed: 0, target: 0, remaining: 0 },
        logging: { completed: 0, target: 0, remaining: 0 },
      }

      const completion = service.computeDailyCompletion(progress)
      expect(completion).toBe(0)
    })
  })
})
