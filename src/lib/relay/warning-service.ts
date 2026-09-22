import type { DailyProgress, DailyContract } from '@/lib/domain/types'

/**
 * Deterministic Warning Generator.
 *
 * Produces actionable, deduplicated warnings based on real progress data.
 * No AI. No spam. Every warning links to work that resolves it.
 */

export type WarningLevel = 'info' | 'early' | 'midday' | 'late' | 'very_late' | 'ready'

export interface Warning {
  id: string
  level: WarningLevel
  message: string
  /** Categories that still need work */
  categories: Array<{
    key: string
    label: string
    remaining: number
    href: string
  }>
  /** Dedupe key — prevents showing the same warning repeatedly */
  dedupeKey: string
  /** Whether this is an actionable warning (has work links) */
  actionable: boolean
}

export interface WarningInput {
  progress: DailyProgress
  contracts: DailyContract[]
  dayElapsed: number
  hasAssignments: boolean
  isWorkingDay: boolean
  availabilityStatus: 'working' | 'leave' | 'holiday' | 'approved_unavailable'
  dayCloseStatus: string | null
  totalRemaining: number
  totalCompleted: number
  totalTarget: number
}

const CATEGORY_HREF_MAP: Record<string, string> = {
  connections: '/leads?filter=connect',
  firstDms: '/leads?filter=dm',
  emails: '/leads?filter=email',
  followups: '/leads?filter=followup',
}

const CATEGORY_LABELS: Record<string, string> = {
  connections: 'Connections',
  firstDms: 'First DMs',
  emails: 'Emails',
  followups: 'Follow-ups',
}

function getIncompleteCategories(progress: DailyProgress): Array<{ key: string; label: string; remaining: number; href: string }> {
  const result: Array<{ key: string; label: string; remaining: number; href: string }> = []

  const checks: Array<{ key: keyof DailyProgress; label: string }> = [
    { key: 'connections', label: 'Connections' },
    { key: 'firstDms', label: 'First DMs' },
    { key: 'emails', label: 'Emails' },
    { key: 'followups', label: 'Follow-ups' },
  ]

  for (const check of checks) {
    const cat = progress[check.key]
    if (cat.target > 0 && cat.remaining > 0) {
      result.push({
        key: check.key,
        label: CATEGORY_LABELS[check.key] ?? check.label,
        remaining: cat.remaining,
        href: CATEGORY_HREF_MAP[check.key] ?? '/leads',
      })
    }
  }

  return result
}

/**
 * Generate warnings deterministically from progress data.
 * Returns at most the single most relevant warning (deduped).
 */
export function generateWarnings(input: WarningInput): Warning[] {
  const {
    progress,
    dayElapsed,
    hasAssignments,
    isWorkingDay,
    availabilityStatus,
    dayCloseStatus,
    totalRemaining,
    totalCompleted,
    totalTarget,
  } = input

  // Not working today → no warnings
  if (!isWorkingDay || availabilityStatus !== 'working') return []

  // Already closed → confirm completion
  if (dayCloseStatus === 'completed' || dayCloseStatus === 'completed_with_exception') {
    return [{
      id: 'day-complete',
      level: 'ready',
      message: dayCloseStatus === 'completed_with_exception'
        ? 'Day complete with approved exception.'
        : "Today's required work is complete. You can close your day.",
      categories: [],
      dedupeKey: `ready:complete:${dayCloseStatus}`,
      actionable: false,
    }]
  }

  // No assignments → gentle notice
  if (!hasAssignments) {
    return [{
      id: 'no-assignments',
      level: 'info',
      message: 'No revenue identity assigned. Ask your admin to assign one.',
      categories: [],
      dedupeKey: 'info:no-assignments',
      actionable: false,
    }]
  }

  // All complete → ready
  if (totalRemaining === 0 && totalTarget > 0) {
    return [{
      id: 'ready-to-close',
      level: 'ready',
      message: "Today's required work is complete. You can close your day.",
      categories: [],
      dedupeKey: 'ready:all_complete',
      actionable: false,
    }]
  }

  // No work done yet → early day
  if (totalCompleted === 0 && dayElapsed < 0.3) {
    const incomplete = getIncompleteCategories(progress)
    return [{
      id: 'early-day',
      level: 'early',
      message: `You have ${totalTarget} actions due today. Start with the most important category.`,
      categories: incomplete,
      dedupeKey: `early:not_started:${totalRemaining}`,
      actionable: true,
    }]
  }

  // Very late in the day with work remaining → urgent
  if (dayElapsed >= 0.85 && totalRemaining > 0) {
    const incomplete = getIncompleteCategories(progress)
    return [{
      id: 'very-late',
      level: 'very_late',
      message: `Your workday is nearly over. Complete the remaining ${totalRemaining} actions or request an exception before closing.`,
      categories: incomplete,
      dedupeKey: `very_late:${totalRemaining}`,
      actionable: true,
    }]
  }

  // Late in the day with significant work remaining
  if (dayElapsed >= 0.65 && totalRemaining > 0) {
    const incomplete = getIncompleteCategories(progress)
    const categoryList = incomplete.slice(0, 3).map((c) => `${c.remaining} ${c.label.toLowerCase()}`).join(', ')
    return [{
      id: 'late-day',
      level: 'late',
      message: `Day Close is currently blocked. You still have ${categoryList} remaining.`,
      categories: incomplete,
      dedupeKey: `late:${totalRemaining}`,
      actionable: true,
    }]
  }

  // Midday — check if behind pace
  if (dayElapsed >= 0.35 && totalRemaining > 0) {
    const expectedByNow = Math.round(totalTarget * dayElapsed)
    const isBehind = totalCompleted < expectedByNow * 0.7

    if (isBehind) {
      const incomplete = getIncompleteCategories(progress)
      const categoryList = incomplete.slice(0, 2).map((c) => `${c.remaining} ${c.label.toLowerCase()}`).join(' and ')
      return [{
        id: 'midday-behind',
        level: 'midday',
        message: `You're behind today's pace. ${categoryList} remain.`,
        categories: incomplete,
        dedupeKey: `midday:behind:${totalRemaining}`,
        actionable: true,
      }]
    }
  }

  return []
}

/**
 * Generate admin-level warnings for a team member.
 */
export interface AdminWarningInput {
  repId: string
  repName: string
  identityName: string
  identityId: string
  progress: DailyProgress
  dayElapsed: number
  dayCloseStatus: string | null
  exceptionReason: string | null
  lastActivityAt: string | null
}

export interface AdminWarning {
  id: string
  repId: string
  repName: string
  identityId: string
  identityName: string
  severity: 'warning' | 'critical'
  message: string
  detail: string
}

export function generateAdminWarnings(inputs: AdminWarningInput[]): AdminWarning[] {
  const warnings: AdminWarning[] = []

  for (const input of inputs) {
    const { repId, repName, identityName, identityId, progress, dayElapsed, dayCloseStatus, exceptionReason } = input

    if (exceptionReason) {
      warnings.push({
        id: `exception:${repId}:${identityId}`,
        repId,
        repName,
        identityId,
        identityName,
        severity: 'warning',
        message: `${repName} requested ${exceptionReason} for ${identityName}`,
        detail: `Exception: ${exceptionReason}`,
      })
      continue
    }

    if (dayCloseStatus === 'completed' || dayCloseStatus === 'completed_with_exception') continue

    const totalRemaining =
      progress.connections.remaining +
      progress.firstDms.remaining +
      progress.emails.remaining +
      progress.followups.remaining

    if (totalRemaining === 0) continue

    // Not started by midday
    const totalCompleted =
      progress.connections.completed +
      progress.firstDms.completed +
      progress.emails.completed +
      progress.followups.completed

    if (totalCompleted === 0 && dayElapsed >= 0.4) {
      warnings.push({
        id: `not-started:${repId}:${identityId}`,
        repId,
        repName,
        identityId,
        identityName,
        severity: 'warning',
        message: `${repName} has not started ${identityName} work.`,
        detail: `${totalRemaining} actions due, 0 completed.`,
      })
      continue
    }

    // Behind pace
    if (dayElapsed >= 0.5) {
      const totalTarget = totalRemaining + totalCompleted
      const expected = Math.round(totalTarget * dayElapsed)
      if (totalCompleted < expected * 0.6) {
        const missingCategories: string[] = []
        if (progress.connections.remaining > 0) missingCategories.push(`${progress.connections.remaining} connections`)
        if (progress.firstDms.remaining > 0) missingCategories.push(`${progress.firstDms.remaining} DMs`)
        if (progress.emails.remaining > 0) missingCategories.push(`${progress.emails.remaining} emails`)
        if (progress.followups.remaining > 0) missingCategories.push(`${progress.followups.remaining} follow-ups`)

        warnings.push({
          id: `behind:${repId}:${identityId}`,
          repId,
          repName,
          identityId,
          identityName,
          severity: totalRemaining > 10 ? 'critical' : 'warning',
          message: `${repName} is behind on ${identityName}: ${missingCategories.slice(0, 2).join(', ')} remaining.`,
          detail: `${totalCompleted}/${totalTarget} complete, ${Math.round(dayElapsed * 100)}% of day elapsed.`,
        })
      }
    }
  }

  return warnings
}
