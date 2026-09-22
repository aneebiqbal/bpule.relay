import type { DailyProgress, DayCloseStatus, ExceptionReason } from '@/lib/domain/types'
import { canCloseDay, computeOverallStatus } from './accountability-engine'

/**
 * Strict Day Close Service.
 *
 * Server-authoritative Day Close eligibility and execution.
 * The browser's progress calculation is never trusted.
 */

export interface DayCloseEligibilityInput {
  progress: DailyProgress
  dayElapsed: number
  availabilityStatus: 'working' | 'leave' | 'holiday' | 'approved_unavailable'
  hasContract: boolean
  existingDayCloseStatus: DayCloseStatus | null
  exceptionReason: ExceptionReason | null
  exceptionApproved: boolean
}

export interface DayCloseEligibilityResult {
  eligible: boolean
  status: DayCloseStatus
  /** Human-readable reason if blocked */
  reason: string | null
  /** Remaining work by category (if blocked) */
  remainingByCategory: Record<string, number>
  /** Whether an exception can resolve this */
  exceptionCanResolve: boolean
}

/**
 * Determine Day Close eligibility server-side.
 * This is the single source of truth — never trust the browser.
 */
export function evaluateDayCloseEligibility(input: DayCloseEligibilityInput): DayCloseEligibilityResult {
  const {
    progress,
    availabilityStatus,
    hasContract,
    existingDayCloseStatus,
    exceptionReason,
    exceptionApproved,
  } = input

  // Already closed → idempotent return
  if (existingDayCloseStatus === 'completed') {
    return {
      eligible: true,
      status: 'completed',
      reason: null,
      remainingByCategory: {},
      exceptionCanResolve: false,
    }
  }
  if (existingDayCloseStatus === 'completed_with_exception') {
    return {
      eligible: true,
      status: 'completed_with_exception',
      reason: null,
      remainingByCategory: {},
      exceptionCanResolve: false,
    }
  }
  if (existingDayCloseStatus === 'missed') {
    return {
      eligible: false,
      status: 'missed',
      reason: 'Day was already marked as missed.',
      remainingByCategory: {},
      exceptionCanResolve: false,
    }
  }

  // Not available today
  if (availabilityStatus !== 'working') {
    return {
      eligible: false,
      status: 'not_started',
      reason: availabilityStatus === 'leave'
        ? 'You are on leave today.'
        : availabilityStatus === 'holiday'
          ? 'Today is a holiday.'
          : 'You are marked as unavailable today.',
      remainingByCategory: {},
      exceptionCanResolve: false,
    }
  }

  // No contract → nothing to close
  if (!hasContract) {
    return {
      eligible: false,
      status: 'not_started',
      reason: 'No active contract for today.',
      remainingByCategory: {},
      exceptionCanResolve: false,
    }
  }

  // Check remaining work
  const { eligible, remaining } = canCloseDay(progress, exceptionApproved)

  if (eligible) {
    return {
      eligible: true,
      status: 'completed',
      reason: null,
      remainingByCategory: {},
      exceptionCanResolve: false,
    }
  }

  // Not eligible — provide detail on what's blocking
  const remainingCount = Object.values(remaining).reduce((a, b) => a + b, 0)
  const categoryCount = Object.keys(remaining).length

  let reason: string
  if (exceptionReason && !exceptionApproved) {
    reason = `Day Close blocked: ${remainingCount} actions remaining across ${categoryCount} categories. Your exception request is pending review.`
  } else {
    reason = `Day Close is blocked. You still have ${remainingCount} mandatory actions remaining.`
  }

  return {
    eligible: false,
    status: 'in_progress',
    reason,
    remainingByCategory: remaining,
    exceptionCanResolve: true,
  }
}

/**
 * Build the completion snapshot for an immutable historical record.
 * Captures everything needed for auditing without allowing future changes.
 */
export function buildCompletionSnapshot(progress: DailyProgress): Record<string, number> {
  return {
    qualifiedProspects: progress.qualifiedProspects.completed,
    connections: progress.connections.completed,
    firstDms: progress.firstDms.completed,
    emails: progress.emails.completed,
    followups: progress.followups.completed,
    dueReplies: progress.dueReplies.completed,
    meaningfulTouches: progress.meaningfulTouches.completed,
    logging: progress.logging.completed,
  }
}

/**
 * Build the target snapshot alongside completion for full auditability.
 */
export function buildTargetSnapshot(progress: DailyProgress): Record<string, number> {
  return {
    qualifiedProspects: progress.qualifiedProspects.target,
    connections: progress.connections.target,
    firstDms: progress.firstDms.target,
    emails: progress.emails.target,
    followups: progress.followups.target,
    dueReplies: progress.dueReplies.target,
    meaningfulTouches: progress.meaningfulTouches.target,
    logging: progress.logging.target,
  }
}

/**
 * Validate exception request.
 * Exceptions never fabricate activity.
 */
export interface ExceptionValidationResult {
  valid: boolean
  reason: string | null
}

export function validateExceptionRequest(
  reason: ExceptionReason,
  note: string | undefined,
  progress: DailyProgress,
): ExceptionValidationResult {
  const totalRemaining =
    progress.connections.remaining +
    progress.firstDms.remaining +
    progress.emails.remaining +
    progress.followups.remaining

  // Must have remaining work to request exception
  if (totalRemaining === 0) {
    return { valid: false, reason: 'No remaining work — no exception needed.' }
  }

  // 'other' requires a note
  if (reason === 'other' && (!note || note.trim().length < 10)) {
    return { valid: false, reason: 'Please provide details for the "other" exception reason.' }
  }

  return { valid: true, reason: null }
}

/**
 * Determine the appropriate exception reasons available given current progress.
 */
export function availableExceptionReasons(progress: DailyProgress): Array<{
  reason: ExceptionReason
  label: string
  description: string
}> {
  const reasons: Array<{ reason: ExceptionReason; label: string; description: string }> = [
    { reason: 'no_qualified_inventory', label: 'No Qualified Inventory', description: 'Not enough qualified prospects to contact.' },
    { reason: 'channel_limit', label: 'Channel Limit', description: 'LinkedIn/Upwork daily limit reached.' },
    { reason: 'identity_blocked', label: 'Identity Blocked', description: 'Revenue identity is blocked or unavailable.' },
    { reason: 'system_issue', label: 'System Issue', description: 'Technical issue preventing work.' },
    { reason: 'client_priority', label: 'Client Priority', description: 'Urgent client work took priority.' },
    { reason: 'manager_approved', label: 'Manager Approved', description: 'Manager has approved early close.' },
    { reason: 'other', label: 'Other', description: 'Provide details below.' },
  ]

  return reasons
}
