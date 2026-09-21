import type {
  AccountabilityTemplate,
  RevenueIdentityContract,
  ContractAllocation,
  DayClose,
  DayCloseStatus,
  ExceptionReason,
  MonthlyAccountabilityReview,
  RewardPolicy,
  RewardEligibility,
  OperatorAvailability,
  AvailabilityStatus,
  DailyContract,
  DailyProgress,
  MyDayView,
  TeamMemberView,
  TeamAccountabilityView,
  IdentityAccountabilityView,
  MonthlyReviewView,
  OwnerCommandCenterView,
  AccountabilityStatus,
} from '@/lib/domain/types'
import { computeStatus, remaining } from './accountability-engine'

export interface AccountabilityStore {
  listAccountabilityTemplates(): Promise<AccountabilityTemplate[]>
  getAccountabilityTemplate(id: string): Promise<AccountabilityTemplate | null>
  createAccountabilityTemplate(input: {
    name: string
    qualifiedProspects: number
    connections: number
    firstDms: number
    emails: number
    followups: number
    dueRepliesPct: number
    meaningfulTouches: number
    loggingCompletenessPct: number
    isDefault?: boolean
  }): Promise<AccountabilityTemplate>
  updateAccountabilityTemplate(id: string, patches: Record<string, unknown>): Promise<AccountabilityTemplate>
  deleteAccountabilityTemplate(id: string): Promise<void>

  getActiveContract(identityId: string): Promise<RevenueIdentityContract | null>
  getContractById(contractId: string): Promise<RevenueIdentityContract | null>
  createContract(input: {
    revenueIdentityId: string
    templateId?: string | null
    annualRevenueTarget?: number
    qualifiedProspects?: number
    connections?: number
    firstDms?: number
    emails?: number
    followups?: number
    dueRepliesPct?: number
    meaningfulTouches?: number
    loggingCompletenessPct?: number
    effectiveFrom?: string
  }): Promise<RevenueIdentityContract>
  updateContract(contractId: string, patches: Record<string, unknown>): Promise<RevenueIdentityContract>
  supersedeContract(contractId: string, effectiveTo: string): Promise<void>

  listContractAllocations(contractId: string): Promise<ContractAllocation[]>
  setContractAllocations(contractId: string, allocations: { personId: string; allocationPct: number }[]): Promise<void>
  getPersonAllocations(personId: string): Promise<ContractAllocation[]>

  getDayClose(personId: string, identityId: string, date: string): Promise<DayClose | null>
  getDayCloseById(id: string): Promise<DayClose | null>
  createDayClose(input: {
    personId: string
    revenueIdentityId: string
    contractId?: string | null
    date: string
    status?: DayCloseStatus
    completionSnapshot?: Record<string, unknown>
    exceptionReason?: ExceptionReason | null
    exceptionNote?: string | null
  }): Promise<DayClose>
  updateDayClose(id: string, patches: Record<string, unknown>): Promise<DayClose>
  listDayCloses(personId: string, identityId?: string, startDate?: string, endDate?: string): Promise<DayClose[]>
  listTeamDayCloses(date: string): Promise<DayClose[]>

  getMonthlyReview(personId: string, identityId: string, month: string): Promise<MonthlyAccountabilityReview | null>
  createMonthlyReview(input: {
    personId: string
    revenueIdentityId: string
    contractId?: string | null
    month: string
    executionSnapshot?: Record<string, unknown>
    qualitySnapshot?: Record<string, unknown>
    outcomeSnapshot?: Record<string, unknown>
    consistencySnapshot?: Record<string, unknown>
  }): Promise<MonthlyAccountabilityReview>
  updateMonthlyReview(id: string, patches: Record<string, unknown>): Promise<MonthlyAccountabilityReview>
  listMonthlyReviews(month: string): Promise<MonthlyAccountabilityReview[]>

  listRewardPolicies(): Promise<RewardPolicy[]>
  createRewardPolicy(input: {
    name: string
    tier: 'bronze' | 'silver' | 'gold'
    criteria: Record<string, unknown>
    rewardType: 'custom' | 'bonus_eligibility' | 'commission_review' | 'time_off_review' | 'gift_review' | 'recognition_only'
    description?: string | null
  }): Promise<RewardPolicy>
  updateRewardPolicy(id: string, patches: Record<string, unknown>): Promise<RewardPolicy>
  deleteRewardPolicy(id: string): Promise<void>

  listRewardEligibility(reviewId: string): Promise<RewardEligibility[]>
  createRewardEligibility(input: {
    monthlyReviewId: string
    policyId: string
    reasonSnapshot?: Record<string, unknown>
  }): Promise<RewardEligibility>
  updateRewardEligibility(id: string, patches: Record<string, unknown>): Promise<RewardEligibility>

  getOperatorAvailability(personId: string, date: string): Promise<OperatorAvailability | null>
  setOperatorAvailability(input: {
    personId: string
    date: string
    status: AvailabilityStatus
    note?: string | null
  }): Promise<OperatorAvailability>
  listOperatorAvailability(personId: string, startDate: string, endDate: string): Promise<OperatorAvailability[]>

  getMyDayView(): Promise<MyDayView>
  getTeamAccountabilityView(date?: string): Promise<TeamAccountabilityView>
  getIdentityAccountabilityView(identityId: string): Promise<IdentityAccountabilityView>
  getOwnerCommandCenterView(): Promise<OwnerCommandCenterView>
  getMonthlyReviewView(reviewId: string): Promise<MonthlyReviewView>
}

export class AccountabilityService {
  constructor(private store: AccountabilityStore) {}

  async getDailyContract(personId: string, identityId: string): Promise<DailyContract | null> {
    const contract = await this.store.getActiveContract(identityId)
    if (!contract) return null

    const allocations = await this.store.listContractAllocations(contract.id)
    const myAllocation = allocations.find((a) => a.personId === personId)
    const allocationPct = myAllocation?.allocationPct ?? (allocations.length === 0 ? 100 : 0)

    const pct = allocationPct / 100

    return {
      revenueIdentityId: contract.revenueIdentityId,
      identityName: '',
      annualRevenueTarget: contract.annualRevenueTarget,
      qualifiedProspects: Math.round(contract.qualifiedProspects * pct),
      connections: Math.round(contract.connections * pct),
      firstDms: Math.round(contract.firstDms * pct),
      emails: Math.round(contract.emails * pct),
      followups: Math.round(contract.followups * pct),
      dueRepliesPct: contract.dueRepliesPct,
      meaningfulTouches: Math.round(contract.meaningfulTouches * pct),
      loggingCompletenessPct: contract.loggingCompletenessPct,
      allocationPct,
    }
  }

  async getDailyProgress(personId: string, identityId: string): Promise<DailyProgress | null> {
    const contract = await this.store.getActiveContract(identityId)
    if (!contract) return null

    const today = new Date().toISOString().slice(0, 10)
    const dayClose = await this.store.getDayClose(personId, identityId, today)

    const snapshot = dayClose?.completionSnapshot ?? {}
    const getCount = (key: string) => (snapshot[key] as number) ?? 0

    const allocations = await this.store.listContractAllocations(contract.id)
    const myAllocation = allocations.find((a) => a.personId === personId)
    const pct = (myAllocation?.allocationPct ?? (allocations.length === 0 ? 100 : 0)) / 100

    const qualifiedProspects = Math.round(contract.qualifiedProspects * pct)
    const connections = Math.round(contract.connections * pct)
    const firstDms = Math.round(contract.firstDms * pct)
    const emails = Math.round(contract.emails * pct)
    const followups = Math.round(contract.followups * pct)
    const meaningfulTouches = Math.round(contract.meaningfulTouches * pct)

    return {
      qualifiedProspects: { completed: getCount('qualifiedProspects'), target: qualifiedProspects, remaining: remaining(qualifiedProspects, getCount('qualifiedProspects')) },
      connections: { completed: getCount('connections'), target: connections, remaining: remaining(connections, getCount('connections')) },
      firstDms: { completed: getCount('firstDms'), target: firstDms, remaining: remaining(firstDms, getCount('firstDms')) },
      emails: { completed: getCount('emails'), target: emails, remaining: remaining(emails, getCount('emails')) },
      followups: { completed: getCount('followups'), target: followups, remaining: remaining(followups, getCount('followups')) },
      dueReplies: { completed: getCount('dueReplies'), target: contract.dueRepliesPct, remaining: remaining(contract.dueRepliesPct, getCount('dueReplies')) },
      meaningfulTouches: { completed: getCount('meaningfulTouches'), target: meaningfulTouches, remaining: remaining(meaningfulTouches, getCount('meaningfulTouches')) },
      logging: { completed: getCount('logging'), target: contract.loggingCompletenessPct, remaining: remaining(contract.loggingCompletenessPct, getCount('logging')) },
    }
  }

  async getRemainingRequirements(personId: string, identityId: string): Promise<DailyProgress | null> {
    return this.getDailyProgress(personId, identityId)
  }

  async canCloseDay(personId: string, identityId: string): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10)
    const dayClose = await this.store.getDayClose(personId, identityId, today)
    if (!dayClose) return false
    return dayClose.status === 'ready_to_close' || dayClose.status === 'in_progress'
  }

  async closeDay(personId: string, identityId: string): Promise<DayClose> {
    const today = new Date().toISOString().slice(0, 10)
    const existing = await this.store.getDayClose(personId, identityId, today)
    if (existing && (existing.status === 'completed' || existing.status === 'completed_with_exception' || existing.status === 'missed')) {
      return existing
    }

    const progress = await this.getDailyProgress(personId, identityId)
    if (!progress) throw new Error('No active contract for this identity')

    const allComplete =
      progress.qualifiedProspects.remaining === 0 &&
      progress.connections.remaining === 0 &&
      progress.firstDms.remaining === 0 &&
      progress.emails.remaining === 0 &&
      progress.followups.remaining === 0 &&
      progress.dueReplies.remaining === 0 &&
      progress.meaningfulTouches.remaining === 0

    const status: DayCloseStatus = allComplete ? 'completed' : 'missed'
    const snapshot = {
      qualifiedProspects: progress.qualifiedProspects.completed,
      connections: progress.connections.completed,
      firstDms: progress.firstDms.completed,
      emails: progress.emails.completed,
      followups: progress.followups.completed,
      dueReplies: progress.dueReplies.completed,
      meaningfulTouches: progress.meaningfulTouches.completed,
      logging: progress.logging.completed,
    }

    if (existing) {
      return this.store.updateDayClose(existing.id, { status, completionSnapshot: snapshot })
    }

    return this.store.createDayClose({
      personId,
      revenueIdentityId: identityId,
      date: today,
      status,
      completionSnapshot: snapshot,
    })
  }

  async requestException(
    personId: string,
    identityId: string,
    reason: ExceptionReason,
    note?: string,
  ): Promise<DayClose> {
    const today = new Date().toISOString().slice(0, 10)
    const existing = await this.store.getDayClose(personId, identityId, today)

    if (existing && (existing.status === 'completed' || existing.status === 'completed_with_exception' || existing.status === 'missed')) {
      return existing
    }

    const progress = await this.getDailyProgress(personId, identityId)
    const snapshot = progress ? {
      qualifiedProspects: progress.qualifiedProspects.completed,
      connections: progress.connections.completed,
      firstDms: progress.firstDms.completed,
      emails: progress.emails.completed,
      followups: progress.followups.completed,
      dueReplies: progress.dueReplies.completed,
      meaningfulTouches: progress.meaningfulTouches.completed,
      logging: progress.logging.completed,
    } : {}

    if (existing) {
      return this.store.updateDayClose(existing.id, {
        status: 'completed_with_exception',
        exceptionReason: reason,
        exceptionNote: note ?? null,
        completionSnapshot: snapshot,
      })
    }

    return this.store.createDayClose({
      personId,
      revenueIdentityId: identityId,
      date: today,
      status: 'completed_with_exception',
      exceptionReason: reason,
      exceptionNote: note ?? null,
      completionSnapshot: snapshot,
    })
  }

  async reviewException(
    dayCloseId: string,
    approved: boolean,
    reviewerId: string,
  ): Promise<DayClose> {
    const dayClose = await this.store.getDayCloseById(dayCloseId)
    if (!dayClose) throw new Error('Day close not found')

    return this.store.updateDayClose(dayCloseId, {
      status: approved ? 'completed_with_exception' : 'missed',
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
    })
  }

  async getMonthlyReview(personId: string, identityId: string, month: string): Promise<MonthlyAccountabilityReview | null> {
    return this.store.getMonthlyReview(personId, identityId, month)
  }

  async calculateRewardEligibility(reviewId: string): Promise<RewardEligibility[]> {
    const review = await this.store.getMonthlyReview('', '', '')
    const policies = await this.store.listRewardPolicies()
    const existing = await this.store.listRewardEligibility(reviewId)

    const results: RewardEligibility[] = []

    for (const policy of policies) {
      if (!policy.enabled) continue

      const already = existing.find((e) => e.policyId === policy.id)
      if (already) {
        results.push(already)
        continue
      }

      const eligible = this.evaluatePolicy(policy, review)
      const eligibility = await this.store.createRewardEligibility({
        monthlyReviewId: reviewId,
        policyId: policy.id,
        reasonSnapshot: eligible,
      })
      results.push(eligibility)
    }

    return results
  }

  private evaluatePolicy(
    policy: RewardPolicy,
    review: MonthlyAccountabilityReview | null,
  ): Record<string, unknown> {
    if (!review) return { eligible: false, reason: 'No review data' }

    const execution = review.executionSnapshot as Record<string, number> | undefined
    const quality = review.qualitySnapshot as Record<string, number> | undefined
    const outcome = review.outcomeSnapshot as Record<string, number> | undefined
    const consistency = review.consistencySnapshot as Record<string, number> | undefined

    const criteria = policy.criteria as Record<string, unknown> | undefined
    const minCompletion = (criteria?.minCompletionPct as number) ?? 90
    const minQuality = (criteria?.minQualityScore as number) ?? 80

    const completionRate = execution?.completionRate ?? 0
    const qualityScore = quality?.overallScore ?? 0

    const eligible = completionRate >= minCompletion && qualityScore >= minQuality

    return {
      eligible,
      completionRate,
      qualityScore,
      minCompletion,
      minQuality,
      tier: policy.tier,
    }
  }

  async getTeamAccountability(date?: string): Promise<TeamAccountabilityView> {
    return this.store.getTeamAccountabilityView(date)
  }

  async getIdentityAccountability(identityId: string): Promise<IdentityAccountabilityView> {
    return this.store.getIdentityAccountabilityView(identityId)
  }

  computeDailyCompletion(progress: DailyProgress): number {
    const targets = [
      progress.qualifiedProspects.target,
      progress.connections.target,
      progress.firstDms.target,
      progress.emails.target,
      progress.followups.target,
      progress.meaningfulTouches.target,
    ]
    const completed = [
      progress.qualifiedProspects.completed,
      progress.connections.completed,
      progress.firstDms.completed,
      progress.emails.completed,
      progress.followups.completed,
      progress.meaningfulTouches.completed,
    ]

    const totalTarget = targets.reduce((a, b) => a + b, 0)
    const totalCompleted = completed.reduce((a, b) => a + b, 0)

    if (totalTarget === 0) return 0
    return Math.round((totalCompleted / totalTarget) * 100)
  }

  computeStatus(progress: DailyProgress): AccountabilityStatus {
    const completion = this.computeDailyCompletion(progress)
    if (completion >= 100) return 'completed'
    if (completion >= 70) return 'on_track'
    if (completion >= 40) return 'at_risk'
    return 'at_risk'
  }

  isExpectedWorkingDay(date: string, availability: OperatorAvailability | null): boolean {
    if (!availability) return true
    return availability.status === 'working'
  }

  getStreak(dayCloses: DayClose[]): number {
    let streak = 0
    const sorted = [...dayCloses].sort((a, b) => b.date.localeCompare(a.date))
    for (const dc of sorted) {
      if (dc.status === 'completed' || dc.status === 'completed_with_exception') {
        streak++
      } else {
        break
      }
    }
    return streak
  }
}
