import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { AccountabilityService } from '@/lib/relay/accountability-service'
import type {
  AccountabilityTemplate,
  RevenueIdentityContract,
  ContractAllocation,
  DayClose,
  MonthlyAccountabilityReview,
  RewardPolicy,
  RewardEligibility,
  OperatorAvailability,
  DailyProgress,
} from '@/lib/domain/types'
import type { AccountabilityStore } from '@/lib/relay/accountability-service'

function createMockStore(overrides: Partial<AccountabilityStore> = {}): AccountabilityStore {
  return {
    listAccountabilityTemplates: vi.fn().mockResolvedValue([]),
    getAccountabilityTemplate: vi.fn().mockResolvedValue(null),
    createAccountabilityTemplate: vi.fn().mockResolvedValue({} as AccountabilityTemplate),
    updateAccountabilityTemplate: vi.fn().mockResolvedValue({} as AccountabilityTemplate),
    deleteAccountabilityTemplate: vi.fn().mockResolvedValue(undefined),
    getActiveContract: vi.fn().mockResolvedValue(null),
    getDailyProgress: vi.fn().mockResolvedValue(null),
    getContractById: vi.fn().mockResolvedValue(null),
    createContract: vi.fn().mockResolvedValue({} as RevenueIdentityContract),
    updateContract: vi.fn().mockResolvedValue({} as RevenueIdentityContract),
    supersedeContract: vi.fn().mockResolvedValue(undefined),
    listContractAllocations: vi.fn().mockResolvedValue([]),
    setContractAllocations: vi.fn().mockResolvedValue(undefined),
    getPersonAllocations: vi.fn().mockResolvedValue([]),
    getDayClose: vi.fn().mockResolvedValue(null),
    getDayCloseById: vi.fn().mockResolvedValue(null),
    createDayClose: vi.fn().mockResolvedValue({} as DayClose),
    updateDayClose: vi.fn().mockResolvedValue({} as DayClose),
    listDayCloses: vi.fn().mockResolvedValue([]),
    listTeamDayCloses: vi.fn().mockResolvedValue([]),
    getMonthlyReview: vi.fn().mockResolvedValue(null),
    createMonthlyReview: vi.fn().mockResolvedValue({} as MonthlyAccountabilityReview),
    updateMonthlyReview: vi.fn().mockResolvedValue({} as MonthlyAccountabilityReview),
    listMonthlyReviews: vi.fn().mockResolvedValue([]),
    listRewardPolicies: vi.fn().mockResolvedValue([]),
    createRewardPolicy: vi.fn().mockResolvedValue({} as RewardPolicy),
    updateRewardPolicy: vi.fn().mockResolvedValue({} as RewardPolicy),
    deleteRewardPolicy: vi.fn().mockResolvedValue(undefined),
    listRewardEligibility: vi.fn().mockResolvedValue([]),
    createRewardEligibility: vi.fn().mockResolvedValue({} as RewardEligibility),
    updateRewardEligibility: vi.fn().mockResolvedValue({} as RewardEligibility),
    getOperatorAvailability: vi.fn().mockResolvedValue(null),
    setOperatorAvailability: vi.fn().mockResolvedValue({} as OperatorAvailability),
    listOperatorAvailability: vi.fn().mockResolvedValue([]),
    getMyDayView: vi.fn().mockResolvedValue({} as any),
    getTeamAccountabilityView: vi.fn().mockResolvedValue({} as any),
    getIdentityAccountabilityView: vi.fn().mockResolvedValue({} as any),
    getOwnerCommandCenterView: vi.fn().mockResolvedValue({} as any),
    getMonthlyReviewView: vi.fn().mockResolvedValue({} as any),
    ...overrides,
  }
}

const defaultContract: RevenueIdentityContract = {
  id: 'contract-1',
  revenueIdentityId: 'identity-1',
  templateId: 'template-1',
  annualRevenueTarget: 100000,
  qualifiedProspects: 50,
  connections: 25,
  firstDms: 30,
  emails: 30,
  followups: 25,
  dueRepliesPct: 100,
  meaningfulTouches: 90,
  loggingCompletenessPct: 100,
  effectiveFrom: '2026-09-01',
  effectiveTo: null,
  status: 'active',
  version: 1,
  createdBy: 'admin-1',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}

const defaultProgress: DailyProgress = {
  qualifiedProspects: { completed: 50, target: 50, remaining: 0 },
  connections: { completed: 25, target: 25, remaining: 0 },
  firstDms: { completed: 30, target: 30, remaining: 0 },
  emails: { completed: 30, target: 30, remaining: 0 },
  followups: { completed: 25, target: 25, remaining: 0 },
  dueReplies: { completed: 100, target: 100, remaining: 0 },
  meaningfulTouches: { completed: 90, target: 90, remaining: 0 },
  logging: { completed: 100, target: 100, remaining: 0 },
}

describe('AccountabilityService', () => {
  let store: AccountabilityStore
  let service: AccountabilityService

  beforeEach(() => {
    store = createMockStore()
    service = new AccountabilityService(store)
  })

  describe('getDailyContract', () => {
    it('returns null when no active contract exists', async () => {
      store.getActiveContract = vi.fn().mockResolvedValue(null)
      const result = await service.getDailyContract('person-1', 'identity-1')
      expect(result).toBeNull()
    })

    it('returns contract with 100% allocation when no allocations exist', async () => {
      store.getActiveContract = vi.fn().mockResolvedValue(defaultContract)
      store.listContractAllocations = vi.fn().mockResolvedValue([])

      const result = await service.getDailyContract('person-1', 'identity-1')

      expect(result).not.toBeNull()
      expect(result?.allocationPct).toBe(100)
      expect(result?.qualifiedProspects).toBe(50)
      expect(result?.meaningfulTouches).toBe(90)
    })

    it('returns contract with correct allocation percentage', async () => {
      store.getActiveContract = vi.fn().mockResolvedValue(defaultContract)
      store.listContractAllocations = vi.fn().mockResolvedValue([
        { id: 'alloc-1', contractId: 'contract-1', personId: 'person-1', allocationPct: 60, createdAt: '', updatedAt: '' },
        { id: 'alloc-2', contractId: 'contract-1', personId: 'person-2', allocationPct: 40, createdAt: '', updatedAt: '' },
      ])

      const result = await service.getDailyContract('person-1', 'identity-1')

      expect(result?.allocationPct).toBe(60)
      expect(result?.qualifiedProspects).toBe(30)
      expect(result?.connections).toBe(15)
      expect(result?.meaningfulTouches).toBe(54)
    })
  })

  describe('getDailyProgress', () => {
    it('returns null when no active contract exists', async () => {
      store.getActiveContract = vi.fn().mockResolvedValue(null)
      const result = await service.getDailyProgress('person-1', 'identity-1')
      expect(result).toBeNull()
    })

    it('returns progress from day close snapshot', async () => {
      store.getActiveContract = vi.fn().mockResolvedValue(defaultContract)
      store.getDayClose = vi.fn().mockResolvedValue({
        id: 'dc-1',
        completionSnapshot: {
          qualifiedProspects: 25,
          connections: 10,
          firstDms: 15,
          emails: 20,
          followups: 10,
          dueReplies: 100,
          meaningfulTouches: 45,
          logging: 100,
        },
      })

      const result = await service.getDailyProgress('person-1', 'identity-1')

      expect(result).not.toBeNull()
      expect(result?.qualifiedProspects.completed).toBe(25)
      expect(result?.qualifiedProspects.remaining).toBe(25)
      expect(result?.meaningfulTouches.completed).toBe(45)
    })
  })

  describe('canCloseDay', () => {
    it('returns false when no day close exists', async () => {
      store.getDayClose = vi.fn().mockResolvedValue(null)
      const result = await service.canCloseDay('person-1', 'identity-1')
      expect(result).toBe(false)
    })

    it('returns true when day close status is ready_to_close', async () => {
      store.getDayClose = vi.fn().mockResolvedValue({ status: 'ready_to_close' })
      const result = await service.canCloseDay('person-1', 'identity-1')
      expect(result).toBe(true)
    })

    it('returns false when day close status is not_started', async () => {
      store.getDayClose = vi.fn().mockResolvedValue({ status: 'not_started' })
      const result = await service.canCloseDay('person-1', 'identity-1')
      expect(result).toBe(false)
    })
  })

  describe('closeDay', () => {
    it('marks day as completed when all targets met', async () => {
      store.getActiveContract = vi.fn().mockResolvedValue(defaultContract)
      store.getDayClose = vi.fn().mockResolvedValue(null)
      store.getDailyProgress = vi.fn().mockResolvedValue(defaultProgress)
      store.createDayClose = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'completed' })

      const result = await service.closeDay('person-1', 'identity-1')

      expect(result.status).toBe('completed')
      expect(store.createDayClose).toHaveBeenCalled()
    })

    it('marks day as missed when targets not met', async () => {
      const incompleteProgress: DailyProgress = {
        ...defaultProgress,
        qualifiedProspects: { completed: 20, target: 50, remaining: 30 },
        meaningfulTouches: { completed: 40, target: 90, remaining: 50 },
      }
      store.getActiveContract = vi.fn().mockResolvedValue(defaultContract)
      store.getDayClose = vi.fn().mockResolvedValue(null)
      store.getDailyProgress = vi.fn().mockResolvedValue(incompleteProgress)
      store.createDayClose = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'missed' })

      const result = await service.closeDay('person-1', 'identity-1')

      expect(result.status).toBe('missed')
    })

    it('returns existing day close if already completed', async () => {
      store.getDayClose = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'completed' })

      const result = await service.closeDay('person-1', 'identity-1')

      expect(result.status).toBe('completed')
      expect(store.createDayClose).not.toHaveBeenCalled()
    })
  })

  describe('requestException', () => {
    it('creates exception with reason and note', async () => {
      store.getActiveContract = vi.fn().mockResolvedValue(defaultContract)
      store.getDayClose = vi.fn().mockResolvedValue(null)
      store.getDailyProgress = vi.fn().mockResolvedValue(defaultProgress)
      store.createDayClose = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'completed_with_exception' })

      const result = await service.requestException('person-1', 'identity-1', 'no_qualified_inventory', 'No prospects available')

      expect(result.status).toBe('completed_with_exception')
      expect(store.createDayClose).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed_with_exception',
          exceptionReason: 'no_qualified_inventory',
          exceptionNote: 'No prospects available',
        }),
      )
    })

    it('updates existing day close with exception', async () => {
      store.getActiveContract = vi.fn().mockResolvedValue(defaultContract)
      store.getDayClose = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'in_progress' })
      store.getDailyProgress = vi.fn().mockResolvedValue(defaultProgress)
      store.updateDayClose = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'completed_with_exception' })

      const result = await service.requestException('person-1', 'identity-1', 'channel_limit')

      expect(result.status).toBe('completed_with_exception')
      expect(store.updateDayClose).toHaveBeenCalled()
    })
  })

  describe('reviewException', () => {
    it('approves exception', async () => {
      store.getDayCloseById = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'completed_with_exception' })
      store.updateDayClose = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'completed_with_exception' })

      const result = await service.reviewException('dc-1', true, 'manager-1')

      expect(result.status).toBe('completed_with_exception')
      expect(store.updateDayClose).toHaveBeenCalledWith(
        'dc-1',
        expect.objectContaining({ status: 'completed_with_exception', reviewedBy: 'manager-1' }),
      )
    })

    it('rejects exception and marks as missed', async () => {
      store.getDayCloseById = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'completed_with_exception' })
      store.updateDayClose = vi.fn().mockResolvedValue({ id: 'dc-1', status: 'missed' })

      const result = await service.reviewException('dc-1', false, 'manager-1')

      expect(result.status).toBe('missed')
    })
  })

  describe('computeDailyCompletion', () => {
    it('returns 100 when all targets met', () => {
      const result = service.computeDailyCompletion(defaultProgress)
      expect(result).toBe(100)
    })

    it('returns correct percentage for partial completion', () => {
      const partialProgress: DailyProgress = {
        ...defaultProgress,
        qualifiedProspects: { completed: 25, target: 50, remaining: 25 },
        connections: { completed: 10, target: 25, remaining: 15 },
      }
      const result = service.computeDailyCompletion(partialProgress)
      expect(result).toBeLessThan(100)
    })

    it('returns 0 when no targets', () => {
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
      const result = service.computeDailyCompletion(emptyProgress)
      expect(result).toBe(0)
    })
  })

  describe('computeStatus', () => {
    it('returns completed when completion is 100%', () => {
      const result = service.computeStatus(defaultProgress)
      expect(result).toBe('completed')
    })

    it('returns on_track when completion is above 70%', () => {
      const progress: DailyProgress = {
        ...defaultProgress,
        qualifiedProspects: { completed: 40, target: 50, remaining: 10 },
        connections: { completed: 20, target: 25, remaining: 5 },
      }
      const result = service.computeStatus(progress)
      expect(result).toBe('on_track')
    })

    it('returns at_risk when completion is below 40%', () => {
      const progress: DailyProgress = {
        ...defaultProgress,
        qualifiedProspects: { completed: 10, target: 50, remaining: 40 },
        connections: { completed: 5, target: 25, remaining: 20 },
        firstDms: { completed: 5, target: 30, remaining: 25 },
        emails: { completed: 5, target: 30, remaining: 25 },
        followups: { completed: 5, target: 25, remaining: 20 },
        meaningfulTouches: { completed: 20, target: 90, remaining: 70 },
      }
      const result = service.computeStatus(progress)
      expect(result).toBe('at_risk')
    })
  })

  describe('isExpectedWorkingDay', () => {
    it('returns true when no availability record exists', () => {
      const result = service.isExpectedWorkingDay('2026-09-21', null)
      expect(result).toBe(true)
    })

    it('returns true when status is working', () => {
      const availability: OperatorAvailability = {
        id: 'oa-1', organizationId: 'org-1', personId: 'person-1',
        date: '2026-09-21', status: 'working', note: null, createdAt: '', updatedAt: '',
      }
      const result = service.isExpectedWorkingDay('2026-09-21', availability)
      expect(result).toBe(true)
    })

    it('returns false when status is leave', () => {
      const availability: OperatorAvailability = {
        id: 'oa-1', organizationId: 'org-1', personId: 'person-1',
        date: '2026-09-21', status: 'leave', note: null, createdAt: '', updatedAt: '',
      }
      const result = service.isExpectedWorkingDay('2026-09-21', availability)
      expect(result).toBe(false)
    })

    it('returns false when status is holiday', () => {
      const availability: OperatorAvailability = {
        id: 'oa-1', organizationId: 'org-1', personId: 'person-1',
        date: '2026-09-21', status: 'holiday', note: null, createdAt: '', updatedAt: '',
      }
      const result = service.isExpectedWorkingDay('2026-09-21', availability)
      expect(result).toBe(false)
    })
  })

  describe('getStreak', () => {
    it('counts consecutive completed days', () => {
      const dayCloses: DayClose[] = [
        { id: 'dc-1', status: 'completed', date: '2026-09-21' } as DayClose,
        { id: 'dc-2', status: 'completed', date: '2026-09-20' } as DayClose,
        { id: 'dc-3', status: 'completed', date: '2026-09-19' } as DayClose,
        { id: 'dc-4', status: 'missed', date: '2026-09-18' } as DayClose,
      ]
      const result = service.getStreak(dayCloses)
      expect(result).toBe(3)
    })

    it('counts completed_with_exception as part of streak', () => {
      const dayCloses: DayClose[] = [
        { id: 'dc-1', status: 'completed_with_exception', date: '2026-09-21' } as DayClose,
        { id: 'dc-2', status: 'completed', date: '2026-09-20' } as DayClose,
      ]
      const result = service.getStreak(dayCloses)
      expect(result).toBe(2)
    })

    it('returns 0 when most recent day is missed', () => {
      const dayCloses: DayClose[] = [
        { id: 'dc-1', status: 'missed', date: '2026-09-21' } as DayClose,
        { id: 'dc-2', status: 'completed', date: '2026-09-20' } as DayClose,
      ]
      const result = service.getStreak(dayCloses)
      expect(result).toBe(0)
    })
  })
})
