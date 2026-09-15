import type { AccountabilityStatus } from '@/lib/domain/types'

/**
 * Accountability Engine — deterministic, no AI.
 *
 * Pure functions that compute accountability status from inputs.
 * Used by both the API layer and any scheduled job that closes days.
 */

/** Fraction of the working day elapsed, 0..1. Assumes an 8-hour business day. */
export function dayProgress(now: Date, timezone: string): number {
  const localStr = now.toLocaleString('en-US', { timeZone: timezone })
  const local = new Date(localStr)
  const hour = local.getHours()
  const minute = local.getMinutes()

  // Business day: 09:00 - 17:00 = 8 hours
  const startHour = 9
  const endHour = 17
  const totalMinutes = (endHour - startHour) * 60
  const elapsedMinutes = (hour - startHour) * 60 + minute

  if (elapsedMinutes <= 0) return 0
  if (elapsedMinutes >= totalMinutes) return 1
  return elapsedMinutes / totalMinutes
}

/**
 * Compute accountability status deterministically.
 *
 * Rules:
 * - completed: completedCount >= targetCount
 * - on_track: progress is proportional or ahead
 * - at_risk: day is well advanced but significantly behind
 * - missed: only set when the day is closed (handled separately)
 */
export function computeStatus(
  targetCount: number,
  completedCount: number,
  progress: number,
): AccountabilityStatus {
  if (targetCount <= 0) return 'completed'
  if (completedCount >= targetCount) return 'completed'

  const ratio = completedCount / targetCount

  // Behind by more than 25% of expected progress → at risk
  if (progress > 0.3 && ratio < progress - 0.25) return 'at_risk'
  // Slightly behind but within tolerance
  if (ratio >= progress - 0.1) return 'on_track'

  return 'at_risk'
}

/**
 * Close out a day: if target not met, mark as missed.
 */
export function closeDayStatus(
  targetCount: number,
  completedCount: number,
): AccountabilityStatus {
  if (completedCount >= targetCount) return 'completed'
  return 'missed'
}

/**
 * Count consecutive missed days working backwards from today.
 * Stops at first non-missed day.
 */
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

/**
 * Determine if an accountability row should be auto-created for a date.
 * Only create for working days (Mon-Fri by default, org-configurable).
 */
export function isWorkingDay(date: Date, workingDays: number[] = [1, 2, 3, 4, 5]): boolean {
  const dow = date.getDay()
  return workingDays.includes(dow)
}

/**
 * Generate the dedupe key for a notification.
 * Format: {type}:{repId}:{identityId}:{date}:{activityType}
 */
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

/**
 * Compute remaining actions, floored at zero.
 */
export function remaining(target: number, completed: number): number {
  return Math.max(0, target - completed)
}

/**
 * Determine if a rep needs attention today.
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
