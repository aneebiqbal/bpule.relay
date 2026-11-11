import type { CoverageProfileResult } from '@/lib/coverage/engine'
import type { ProfileCompletionStatus, ProfileToday } from '@/lib/rep-home/profile-completion'

/**
 * Rep Home — per-profile execution card view.
 *
 * Pure presentation over canonical facts. The card never recomputes a target,
 * a completion or an attention count: everything comes from `ProfileToday`
 * (canonical targets + daily accountability) and `CoverageProfileResult.work`
 * (canonical Inbox truth + assigned tasks).
 */

export type ProfileCardKind = 'own' | 'operator' | 'covering'

export interface ProfileCardModel {
  profile: CoverageProfileResult
  kind: ProfileCardKind
  progress: ProfileToday | null
}

export type ProfileCardTone = 'neutral' | 'danger' | 'warning' | 'success' | 'info'

export const STATUS_LABEL: Record<ProfileCompletionStatus, string> = {
  COMPLETE: 'Complete',
  ON_TRACK: 'On track',
  BEHIND: 'Behind',
  AT_RISK: 'At risk',
  NOT_STARTED: 'Not started',
}

export const STATUS_TONE: Record<ProfileCompletionStatus, ProfileCardTone> = {
  COMPLETE: 'success',
  ON_TRACK: 'info',
  BEHIND: 'warning',
  AT_RISK: 'danger',
  NOT_STARTED: 'warning',
}

/** Canonical pace status, or NO TARGET when there is nothing to be behind on. */
export function statusLabel(status: ProfileCompletionStatus | null, hasTarget: boolean): string {
  if (!hasTarget || !status) return 'No target'
  return STATUS_LABEL[status]
}

export function statusTone(status: ProfileCompletionStatus | null, hasTarget: boolean): ProfileCardTone {
  if (!hasTarget || !status) return 'neutral'
  return STATUS_TONE[status]
}

/**
 * One card per logical responsibility. A profile that appears as both own and
 * covering renders once, as primary. Severity order only — never a numeric
 * score — with primary before covering at equal severity.
 */
export function buildProfileCards(
  own: CoverageProfileResult[],
  covering: CoverageProfileResult[],
  progressById: Map<string, ProfileToday>,
  operatorProfileIds: ReadonlySet<string> = new Set(),
): ProfileCardModel[] {
  const ownIds = new Set(own.map((profile) => profile.profileId))
  const seen = new Set<string>()
  const cards: ProfileCardModel[] = []
  for (const profile of [...own, ...covering]) {
    if (seen.has(profile.profileId)) continue
    seen.add(profile.profileId)
    cards.push({
      profile,
      kind: operatorProfileIds.has(profile.profileId)
        ? 'operator'
        : ownIds.has(profile.profileId)
          ? 'own'
          : 'covering',
      progress: progressById.get(profile.profileId) ?? null,
    })
  }
  return sortProfileCards(cards)
}

export function sortProfileCards(cards: ProfileCardModel[]): ProfileCardModel[] {
  const severity = (card: ProfileCardModel): number => {
    if (!card.progress || card.progress.targetCount <= 0) return 3
    switch (card.progress.status) {
      case 'AT_RISK':
        return 0
      case 'BEHIND':
        return 1
      case 'NOT_STARTED':
        return 2
      case 'ON_TRACK':
        return 3
      case 'COMPLETE':
        return 4
      default:
        return 3
    }
  }
  return [...cards].sort((a, b) => {
    const bySeverity = severity(a) - severity(b)
    if (bySeverity !== 0) return bySeverity
    const kindRank = (kind: ProfileCardKind): number => (kind === 'own' ? 0 : kind === 'operator' ? 1 : 2)
    const byKind = kindRank(a.kind) - kindRank(b.kind)
    if (byKind !== 0) return byKind
    return a.profile.name.localeCompare(b.profile.name)
  })
}

export interface ActivityBreakdownItem {
  activityType: string
  label: string
  targetCount: number
  completedCount: number
  profileCompletedCount: number
  remaining: number
  complete: boolean
}

/**
 * Only activity types that actually belong to this profile/day, most-left
 * first. Canonical target rows are passed through — never recalculated.
 */
export function buildActivityBreakdown(
  progress: ProfileToday | null,
  limit = 4,
): { items: ActivityBreakdownItem[]; more: number } {
  const targets = (progress?.targets ?? []).filter((target) => target.targetCount > 0)
  const sorted = [...targets].sort(
    (a, b) => b.remaining - a.remaining || a.label.localeCompare(b.label),
  )
  return {
    items: sorted.slice(0, limit).map((target) => ({
      activityType: target.activityType,
      label: target.label,
      targetCount: target.targetCount,
      completedCount: target.completedCount,
      profileCompletedCount: target.profileCompletedCount ?? target.completedCount,
      remaining: target.remaining,
      complete: target.remaining <= 0,
    })),
    more: Math.max(0, sorted.length - limit),
  }
}

export interface AttentionPart {
  kind: 'replies' | 'followUps' | 'tasks'
  count: number
  label: string
}

export interface AttentionLine {
  text: string
  tone: 'warning' | 'neutral'
  /** Same truth as structured parts, so each segment can deep-link to its exact dataset. */
  parts: AttentionPart[]
}

/** Canonical Inbox + assigned-work truth, presented verbatim. */
export function buildAttentionLine(work: {
  replies: number
  followUps: number
  tasks: number
}): AttentionLine {
  const parts: AttentionPart[] = []
  if (work.replies > 0) {
    parts.push({ kind: 'replies', count: work.replies, label: `${work.replies} ${work.replies === 1 ? 'reply' : 'replies'} waiting` })
  }
  if (work.followUps > 0) {
    parts.push({ kind: 'followUps', count: work.followUps, label: `${work.followUps} follow-up${work.followUps === 1 ? '' : 's'}` })
  }
  if (work.tasks > 0) {
    parts.push({ kind: 'tasks', count: work.tasks, label: `${work.tasks} task${work.tasks === 1 ? '' : 's'}` })
  }
  if (parts.length === 0) return { text: 'Inbox clear · No overdue work', tone: 'neutral', parts }
  return { text: parts.map((part) => part.label).join(' · '), tone: 'warning', parts }
}

/** Ownership line — never internal assignment terminology. */
export function ownershipLine(card: ProfileCardModel, coveringUntil: string | null): string {
  if (card.kind === 'operator') {
    return `Active operator · primary ${card.profile.primaryRepName ?? 'unassigned'}`
  }
  if (card.kind === 'covering') {
    return `Covering for ${card.profile.primaryRepName ?? 'primary'}${coveringUntil ? ` · until ${coveringUntil}` : ''}`
  }
  return 'Primary responsibility'
}

export interface ProfileSummary {
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  percent: number | null
  behindCount: number
  needsAccess: number
}

export function summarizeProfileCards(cards: ProfileCardModel[], needsAccess: number): ProfileSummary {
  let totalTarget = 0
  let totalCompleted = 0
  let behindCount = 0
  for (const card of cards) {
    const progress = card.progress
    if (!progress) continue
    totalTarget += progress.targetCount
    totalCompleted += progress.completedCount
    if (progress.targetCount > 0 && (progress.status === 'BEHIND' || progress.status === 'AT_RISK')) {
      behindCount += 1
    }
  }
  return {
    totalTarget,
    totalCompleted,
    totalRemaining: Math.max(0, totalTarget - totalCompleted),
    percent: totalTarget > 0 ? Math.min(100, Math.round((totalCompleted / totalTarget) * 100)) : null,
    behindCount,
    needsAccess,
  }
}
