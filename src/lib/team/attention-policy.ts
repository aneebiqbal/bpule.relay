/**
 * Manager team attention — one deterministic authority.
 *
 * Thresholds are hours overdue / waiting. Severity never comes from AI or
 * raw score alone. High-priority untouched uses pre-computed counts that
 * already applied canonical qualification elsewhere.
 */

export type AttentionCategory =
  | 'REPLIES_WAITING'
  | 'FOLLOWUPS_OVERDUE'
  | 'HIGH_PRIORITY_UNTOUCHED'
  | 'TASKS_OVERDUE'
  | 'UNASSIGNED_TASKS'
  | 'NO_PROFILE_ASSIGNMENT'
  | 'NO_ACTIVITY'
  | 'TARGET_AT_RISK'

export type AttentionSeverity = 'normal' | 'attention' | 'critical'

export const ATTENTION_THRESHOLDS = {
  replies: { attentionHours: 4, criticalHours: 12 },
  followups: { attentionHours: 4, criticalHours: 24 },
  highPriorityUntouched: { attentionHours: 24, criticalHours: 72 },
  noActivityHours: 24,
  targetAtRiskPct: 50,
} as const

export interface ManagerRepSnapshot {
  repId: string
  repName: string
  activeProfile: string | null
  completedToday: number
  repliesWaiting: number
  followUpsOverdue: number
  highPriorityUntouched: number
  /** Open assigned tasks past dueAt. */
  overdueTasks: number
  meetings: number
  wins: number
  targetPct: number
  /** Oldest reply age in hours when known; null if unknown / none. */
  oldestReplyAgeHours: number | null
  oldestFollowUpAgeHours: number | null
  oldestHighPriorityAgeHours: number | null
  oldestOverdueTaskAgeHours: number | null
  lastActivityAt: string | null
  hasProfileAssignment: boolean
  requiredRemaining: number
  /** Rep-day state from loadTeamDay when available. */
  dayState?: string | null
}

export interface AttentionSignal {
  category: AttentionCategory
  repId: string
  repName: string
  count: number
  reason: string
  severity: AttentionSeverity
  oldestAgeHours: number | null
  href: string
}

export type RepStatus = 'On track' | 'Attention' | 'Critical'

export function severityFromHours(
  hours: number | null,
  attentionHours: number,
  criticalHours: number,
  count: number,
): AttentionSeverity {
  if (count <= 0) return 'normal'
  if (hours == null) {
    // Count without age: mild attention when anything waits.
    return count >= 3 ? 'attention' : 'normal'
  }
  if (hours > criticalHours) return 'critical'
  if (hours >= attentionHours) return 'attention'
  return 'normal'
}

export function formatAgeHours(hours: number | null): string | null {
  if (hours == null || hours < 0) return null
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

/** Build ordered attention signals for one rep. Empty when healthy. */
export function buildRepAttentionSignals(
  snap: ManagerRepSnapshot,
  now = Date.now(),
): AttentionSignal[] {
  const signals: AttentionSignal[] = []
  const t = ATTENTION_THRESHOLDS

  if (snap.repliesWaiting > 0) {
    const severity = severityFromHours(
      snap.oldestReplyAgeHours,
      t.replies.attentionHours,
      t.replies.criticalHours,
      snap.repliesWaiting,
    )
    if (severity !== 'normal' || snap.repliesWaiting >= 1) {
      const age = formatAgeHours(snap.oldestReplyAgeHours)
      signals.push({
        category: 'REPLIES_WAITING',
        repId: snap.repId,
        repName: snap.repName,
        count: snap.repliesWaiting,
        reason: age
          ? `${snap.repliesWaiting} replies waiting · oldest ${age}`
          : `${snap.repliesWaiting} replies waiting`,
        severity: severity === 'normal' && snap.repliesWaiting > 0 ? 'attention' : severity,
        oldestAgeHours: snap.oldestReplyAgeHours,
        href: `/team/${snap.repId}?focus=replies`,
      })
    }
  }

  if (snap.followUpsOverdue > 0) {
    const severity = severityFromHours(
      snap.oldestFollowUpAgeHours,
      t.followups.attentionHours,
      t.followups.criticalHours,
      snap.followUpsOverdue,
    )
    const age = formatAgeHours(snap.oldestFollowUpAgeHours)
    signals.push({
      category: 'FOLLOWUPS_OVERDUE',
      repId: snap.repId,
      repName: snap.repName,
      count: snap.followUpsOverdue,
      reason: age
        ? `${snap.followUpsOverdue} overdue follow-ups · oldest ${age}`
        : `${snap.followUpsOverdue} overdue follow-ups`,
      severity: severity === 'normal' ? 'attention' : severity,
      oldestAgeHours: snap.oldestFollowUpAgeHours,
      href: `/team/${snap.repId}?focus=followups`,
    })
  }

  if (snap.highPriorityUntouched > 0) {
    const severity = severityFromHours(
      snap.oldestHighPriorityAgeHours,
      t.highPriorityUntouched.attentionHours,
      t.highPriorityUntouched.criticalHours,
      snap.highPriorityUntouched,
    )
    const age = formatAgeHours(snap.oldestHighPriorityAgeHours)
    signals.push({
      category: 'HIGH_PRIORITY_UNTOUCHED',
      repId: snap.repId,
      repName: snap.repName,
      count: snap.highPriorityUntouched,
      reason: age
        ? `${snap.highPriorityUntouched} high-priority opportunities untouched · oldest ${age}`
        : `${snap.highPriorityUntouched} high-priority opportunities untouched`,
      severity: severity === 'normal' ? 'attention' : severity,
      oldestAgeHours: snap.oldestHighPriorityAgeHours,
      href: `/team/${snap.repId}?focus=priority`,
    })
  }

  if (snap.overdueTasks > 0) {
    const age = formatAgeHours(snap.oldestOverdueTaskAgeHours)
    signals.push({
      category: 'TASKS_OVERDUE',
      repId: snap.repId,
      repName: snap.repName,
      count: snap.overdueTasks,
      reason: age
        ? `${snap.overdueTasks} overdue tasks · oldest ${age}`
        : `${snap.overdueTasks} overdue tasks`,
      severity: snap.overdueTasks >= 3 || (snap.oldestOverdueTaskAgeHours ?? 0) > 24
        ? 'critical'
        : 'attention',
      oldestAgeHours: snap.oldestOverdueTaskAgeHours,
      href: `/tasks?assignee=${snap.repId}&view=overdue`,
    })
  }

  if (!snap.hasProfileAssignment) {
    signals.push({
      category: 'NO_PROFILE_ASSIGNMENT',
      repId: snap.repId,
      repName: snap.repName,
      count: 1,
      reason: 'No sending profile assigned',
      severity: 'attention',
      oldestAgeHours: null,
      href: `/team/${snap.repId}`,
    })
  }

  if (snap.lastActivityAt) {
    const idleHours = (now - new Date(snap.lastActivityAt).getTime()) / 3_600_000
    if (idleHours >= t.noActivityHours && snap.completedToday === 0) {
      signals.push({
        category: 'NO_ACTIVITY',
        repId: snap.repId,
        repName: snap.repName,
        count: 1,
        reason: `No activity in ${formatAgeHours(idleHours) ?? `${Math.round(idleHours)}h`}`,
        severity: idleHours >= 48 ? 'critical' : 'attention',
        oldestAgeHours: idleHours,
        href: `/team/${snap.repId}`,
      })
    }
  } else if (snap.completedToday === 0 && snap.repliesWaiting === 0) {
    // Working day with zero signal — surface lightly when target exists.
    if (snap.requiredRemaining > 0) {
      signals.push({
        category: 'NO_ACTIVITY',
        repId: snap.repId,
        repName: snap.repName,
        count: 1,
        reason: 'No activity logged today',
        severity: 'attention',
        oldestAgeHours: null,
        href: `/team/${snap.repId}`,
      })
    }
  }

  if (snap.dayState === 'AT_RISK' || snap.dayState === 'CRITICAL') {
    signals.push({
      category: 'TARGET_AT_RISK',
      repId: snap.repId,
      repName: snap.repName,
      count: snap.requiredRemaining,
      reason:
        snap.dayState === 'CRITICAL'
          ? 'Day is critical — target at risk'
          : `Target at risk · ${snap.requiredRemaining} remaining · ${Math.round(snap.targetPct)}%`,
      severity: snap.dayState === 'CRITICAL' ? 'critical' : 'attention',
      oldestAgeHours: null,
      href: `/team/${snap.repId}`,
    })
  }

  return signals
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  critical: 0,
  attention: 1,
  normal: 2,
}

/** Team-wide signals: critical first, then by count, then name. */
export function rankAttentionSignals(signals: AttentionSignal[]): AttentionSignal[] {
  return [...signals].sort((a, b) => {
    const bySev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySev !== 0) return bySev
    if (b.count !== a.count) return b.count - a.count
    return a.repName.localeCompare(b.repName)
  })
}

export function deriveRepStatus(signals: AttentionSignal[]): RepStatus {
  if (signals.some((s) => s.severity === 'critical')) return 'Critical'
  if (signals.some((s) => s.severity === 'attention')) return 'Attention'
  return 'On track'
}

export function buildTeamAttention(snaps: ManagerRepSnapshot[], now = Date.now()): AttentionSignal[] {
  const all = snaps.flatMap((snap) => buildRepAttentionSignals(snap, now))
  return rankAttentionSignals(all)
}

/**
 * Team attention from directory rows — the same authority as
 * `buildTeamAttention`, so the Overview and People surfaces agree. Ages are
 * null here (the directory does not carry them), matching the snapshots the
 * directory itself builds.
 */
export function buildTeamAttentionFromPeople(
  rows: Array<{
    repId: string
    repName: string
    activeProfile: string | null
    completedToday: number
    repliesWaiting: number
    followUpsOverdue: number
    highPriority: number
    overdueTasks: number
    meetings: number
    wins: number
    targetPct: number
    lastActivityAt: string | null
    dayState: string | null
  }>,
  now = Date.now(),
): AttentionSignal[] {
  return buildTeamAttention(
    rows.map((r) => ({
      repId: r.repId,
      repName: r.repName,
      activeProfile: r.activeProfile,
      completedToday: r.completedToday,
      repliesWaiting: r.repliesWaiting,
      followUpsOverdue: r.followUpsOverdue,
      highPriorityUntouched: r.highPriority,
      overdueTasks: r.overdueTasks,
      meetings: r.meetings,
      wins: r.wins,
      targetPct: r.targetPct,
      oldestReplyAgeHours: null,
      oldestFollowUpAgeHours: null,
      oldestHighPriorityAgeHours: null,
      oldestOverdueTaskAgeHours: null,
      lastActivityAt: r.lastActivityAt,
      hasProfileAssignment: r.activeProfile != null,
      requiredRemaining: 0,
      dayState: r.dayState,
    })),
    now,
  )
}
