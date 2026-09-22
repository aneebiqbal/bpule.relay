import type { AccountabilityStatus, DailyProgress, DailyContract, DayCloseStatus } from '@/lib/domain/types'

/**
 * Accountability Engine — deterministic, no AI.
 *
 * Pure functions that compute accountability status from inputs.
 * Used by both the API layer and any scheduled job that closes days.
 */

// ── Working-day time model ──────────────────────────────────────────────────

export interface WorkingDayConfig {
  startHour: number
  endHour: number
  timezone: string
}

export const DEFAULT_WORKING_DAY: WorkingDayConfig = {
  startHour: 9,
  endHour: 17,
  timezone: 'UTC',
}

/** Fraction of the working day elapsed, 0..1 */
export function dayProgress(now: Date, timezone: string, config: WorkingDayConfig = DEFAULT_WORKING_DAY): number {
  const localStr = now.toLocaleString('en-US', { timeZone: timezone })
  const local = new Date(localStr)
  const hour = local.getHours()
  const minute = local.getMinutes()

  const startHour = config.startHour
  const endHour = config.endHour
  const totalMinutes = (endHour - startHour) * 60
  const elapsedMinutes = (hour - startHour) * 60 + minute

  if (elapsedMinutes <= 0) return 0
  if (elapsedMinutes >= totalMinutes) return 1
  return elapsedMinutes / totalMinutes
}

/** Remaining working minutes in the day */
export function workingMinutesRemaining(now: Date, timezone: string, config: WorkingDayConfig = DEFAULT_WORKING_DAY): number {
  const localStr = now.toLocaleString('en-US', { timeZone: timezone })
  const local = new Date(localStr)
  const hour = local.getHours()
  const minute = local.getMinutes()

  const endMinutes = config.endHour * 60
  const currentMinutes = hour * 60 + minute

  return Math.max(0, endMinutes - currentMinutes)
}

// ── Status computation ───────────────────────────────────────────────────────

export type DailyStatus =
  | AccountabilityStatus
  | DayCloseStatus
  | 'approved_unavailable'

/**
 * Compute per-category status deterministically.
 * Category matters — aggregate cannot hide missing categories.
 */
export function computeCategoryStatus(
  target: number,
  completed: number,
  dayElapsed: number,
): AccountabilityStatus {
  if (target <= 0) return 'completed'
  if (completed >= target) return 'completed'

  const ratio = completed / target

  // 80%+ of day elapsed but less than 50% done → behind
  if (dayElapsed >= 0.8 && ratio < 0.5) return 'at_risk'
  // More than 30% behind expected pace → at risk
  if (dayElapsed > 0.3 && ratio < dayElapsed - 0.3) return 'at_risk'
  // Slightly behind but within tolerance
  if (ratio >= dayElapsed - 0.1) return 'on_track'

  return 'at_risk'
}

/**
 * Original computeStatus (preserved for backward compat).
 */
export function computeStatus(
  targetCount: number,
  completedCount: number,
  progress: number,
): AccountabilityStatus {
  if (targetCount <= 0) return 'completed'
  if (completedCount >= targetCount) return 'completed'

  const ratio = completedCount / targetCount

  if (progress > 0.3 && ratio < progress - 0.25) return 'at_risk'
  if (ratio >= progress - 0.1) return 'on_track'

  return 'at_risk'
}

/**
 * Compute overall daily status from multi-category progress.
 * Status is the WORST of any incomplete category (not average).
 * This prevents 90 connections hiding 0 DMs.
 */
export function computeOverallStatus(
  progress: DailyProgress,
  dayElapsed: number,
): AccountabilityStatus {
  const categories = [
    progress.connections,
    progress.firstDms,
    progress.emails,
    progress.followups,
  ]

  // Filter out categories with no target
  const activeCategories = categories.filter((c) => c.target > 0)

  if (activeCategories.length === 0) return 'completed'

  // If all complete
  const allComplete = activeCategories.every((c) => c.remaining === 0)
  if (allComplete) return 'completed'

  // Find the worst category status
  let worst: AccountabilityStatus = 'on_track'
  const priority: Record<string, number> = {
    at_risk: 3,
    on_track: 2,
    completed: 1,
    missed: 4,
  }

  for (const cat of activeCategories) {
    if (cat.remaining === 0) continue
    const status = computeCategoryStatus(cat.target, cat.completed, dayElapsed)
    if ((priority[status] ?? 0) > (priority[worst] ?? 0)) {
      worst = status
    }
  }

  return worst
}

/**
 * Determine if the day can be closed.
 * Strict: ALL categories with targets must be at 0 remaining, OR an approved exception exists.
 */
export function canCloseDay(
  progress: DailyProgress,
  hasApprovedException: boolean,
): { eligible: boolean; remaining: Record<string, number> } {
  if (hasApprovedException) {
    return { eligible: true, remaining: {} }
  }

  const remaining: Record<string, number> = {}
  let totalRemaining = 0

  const categories: Array<{ key: string; label: string; value: { target: number; remaining: number } }> = [
    { key: 'connections', label: 'Connections', value: progress.connections },
    { key: 'firstDms', label: 'First DMs', value: progress.firstDms },
    { key: 'emails', label: 'Emails', value: progress.emails },
    { key: 'followups', label: 'Follow-ups', value: progress.followups },
  ]

  for (const cat of categories) {
    if (cat.value.target > 0 && cat.value.remaining > 0) {
      remaining[cat.key] = cat.value.remaining
      totalRemaining += cat.value.remaining
    }
  }

  return {
    eligible: totalRemaining === 0,
    remaining,
  }
}

// ── Close day ───────────────────────────────────────────────────────────────

export function closeDayStatus(
  targetCount: number,
  completedCount: number,
): AccountabilityStatus {
  if (completedCount >= targetCount) return 'completed'
  return 'missed'
}

/**
 * Determine final day close status from progress snapshot.
 */
export function determineDayCloseStatus(
  progress: DailyProgress,
  hasException: boolean,
  exceptionApproved: boolean,
  isAvailable: boolean,
): DayCloseStatus {
  if (!isAvailable) return 'missed'

  // Check if all work is actually done (no exception needed)
  const allWorkDone =
    progress.connections.remaining === 0 &&
    progress.firstDms.remaining === 0 &&
    progress.emails.remaining === 0 &&
    progress.followups.remaining === 0

  if (allWorkDone) return 'completed'

  // Work remains — exception path
  if (hasException && exceptionApproved) return 'completed_with_exception'
  return 'missed'
}

// ── Consecutive misses ──────────────────────────────────────────────────────

export function countConsecutiveMisses(
  dailyResults: { date: string; status: AccountabilityStatus }[],
): number {
  let streak = 0
  for (const day of dailyResults) {
    if (day.status === 'missed') {
      streak++
    } else {
      break
    }
  }
  return streak
}

// ── Working day ─────────────────────────────────────────────────────────────

export function isWorkingDay(date: Date, workingDays: number[] = [1, 2, 3, 4, 5]): boolean {
  const dow = date.getDay()
  return workingDays.includes(dow)
}

// ── Notification / Warning helpers ─────────────────────────────────────────

export function notificationDedupeKey(
  type: string,
  repId: string,
  identityId: string | null,
  date: string,
  activityType?: string,
): string {
  const parts = [type, repId, identityId ?? 'none', date]
  if (activityType) parts.push(activityType)
  return parts.join(':')
}

/** Compute remaining actions, floored at zero. */
export function remaining(target: number, completed: number): number {
  return Math.max(0, target - completed)
}

/**
 * Determine if a rep needs attention today (original — preserved).
 */
export function needsAttention(
  targetCount: number,
  completedCount: number,
  progress: number,
  consecutiveMisses: number,
): { needs: boolean; severity: 'warning' | 'critical' | null; reason: string | null } {
  if (targetCount <= 0) return { needs: false, severity: null, reason: null }
  if (completedCount >= targetCount) return { needs: false, severity: null, reason: null }

  if (consecutiveMisses >= 3) {
    return {
      needs: true,
      severity: 'critical',
      reason: `${consecutiveMisses}-day target miss`,
    }
  }

  const status = computeStatus(targetCount, completedCount, progress)
  if (status === 'at_risk') {
    return {
      needs: true,
      severity: 'warning',
      reason: `At ${completedCount}/${targetCount} with day ${Math.round(progress * 100)}% elapsed`,
    }
  }

  return { needs: false, severity: null, reason: null }
}

// ── Multi-identity aggregation ──────────────────────────────────────────────

/**
 * Aggregate progress across multiple contracts/identities.
 * Used for rep today view with multiple assignments.
 */
export function aggregateProgress(contracts: DailyContract[], progresses: DailyProgress[]): {
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  byProgress: DailyProgress
} {
  if (progresses.length === 0) {
    return {
      totalTarget: 0,
      totalCompleted: 0,
      totalRemaining: 0,
      byProgress: {
        qualifiedProspects: { completed: 0, target: 0, remaining: 0 },
        connections: { completed: 0, target: 0, remaining: 0 },
        firstDms: { completed: 0, target: 0, remaining: 0 },
        emails: { completed: 0, target: 0, remaining: 0 },
        followups: { completed: 0, target: 0, remaining: 0 },
        dueReplies: { completed: 0, target: 0, remaining: 0 },
        meaningfulTouches: { completed: 0, target: 0, remaining: 0 },
        logging: { completed: 0, target: 0, remaining: 0 },
      },
    }
  }

  const agg = (key: keyof DailyProgress) => {
    const target = progresses.reduce((s, p) => s + p[key].target, 0)
    const completed = progresses.reduce((s, p) => s + p[key].completed, 0)
    return { completed, target, remaining: remaining(target, completed) }
  }

  const byProgress: DailyProgress = {
    qualifiedProspects: agg('qualifiedProspects'),
    connections: agg('connections'),
    firstDms: agg('firstDms'),
    emails: agg('emails'),
    followups: agg('followups'),
    dueReplies: agg('dueReplies'),
    meaningfulTouches: agg('meaningfulTouches'),
    logging: agg('logging'),
  }

  const totalTarget = byProgress.connections.target + byProgress.firstDms.target + byProgress.emails.target + byProgress.followups.target + byProgress.meaningfulTouches.target
  const totalCompleted = byProgress.connections.completed + byProgress.firstDms.completed + byProgress.emails.completed + byProgress.followups.completed + byProgress.meaningfulTouches.completed

  return {
    totalTarget,
    totalCompleted,
    totalRemaining: remaining(totalTarget, totalCompleted),
    byProgress,
  }
}
