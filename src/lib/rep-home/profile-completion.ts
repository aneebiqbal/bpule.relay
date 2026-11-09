import type { ActivityType } from '@/lib/domain/types'
import type { AuthorizedIdentity } from '@/lib/auth/workspace'
import type { WarningThresholds } from '@/lib/org-clock'
import { computePace } from '@/lib/rep-day/pacing'

/**
 * Per-profile daily completion, derived from the canonical targets and
 * accountability rows the rep-day OS already reads.
 *
 * A profile is a `profiles` row; its channel identities are the assigned
 * `revenue_identities` that point at it. Completion is the sum of those
 * identities' targets. Status comes from the canonical pacing function, never
 * a new score.
 */

export type ProfileCompletionStatus = 'COMPLETE' | 'ON_TRACK' | 'BEHIND' | 'AT_RISK' | 'NOT_STARTED'

export interface ProfileTodayTarget {
  activityType: ActivityType
  label: string
  targetCount: number
  completedCount: number
  remaining: number
}

export interface ProfileToday {
  profileId: string
  name: string
  title: string | null
  channels: string[]
  identityIds: string[]
  targetCount: number
  completedCount: number
  remaining: number
  status: ProfileCompletionStatus | null
  targets: ProfileTodayTarget[]
}

const METRIC_LABELS: Record<ActivityType, string> = {
  prospect_extracted: 'Prospects',
  connection_request: 'Connections',
  dm: 'DMs',
  email: 'Emails',
  followup: 'Follow-ups',
  application: 'Proposals',
  proposal: 'Qualified',
  other: 'Other',
}

/** Null when there is no target to be behind on — unknown is not zero. */
export function profileCompletionStatus(
  targetCount: number,
  completedCount: number,
  workdayProgress: number,
  thresholds: WarningThresholds,
): ProfileCompletionStatus | null {
  if (targetCount <= 0) return null
  if (completedCount >= targetCount) return 'COMPLETE'

  const pace = computePace({
    workdayProgress,
    commitmentProgress: completedCount / targetCount,
    mandatoryRemaining: 0,
    exceptionApproved: false,
    thresholds,
  })

  switch (pace.band) {
    case 'complete':
      return 'COMPLETE'
    case 'on_pace':
      return 'ON_TRACK'
    case 'behind':
      return 'BEHIND'
    case 'materially_behind':
      return 'AT_RISK'
    case 'not_started':
      return 'NOT_STARTED'
    case 'waived':
      return 'ON_TRACK'
  }
}

export interface ProfileWarning {
  id: string
  message: string
  tone: 'info' | 'warning' | 'danger'
}

/**
 * Operational warnings from canonical facts only — remaining work, unanswered
 * replies, due follow-ups, and profiles that have not been started.
 */
export function buildProfileWarnings(
  profiles: ProfileToday[],
  day: { repliesWaiting: number; followUpsDue: number; isComplete: boolean },
): ProfileWarning[] {
  if (day.isComplete) {
    return [{ id: 'complete', message: "Today's work is complete.", tone: 'info' }]
  }

  const warnings: ProfileWarning[] = []
  if (day.repliesWaiting > 0) {
    warnings.push({
      id: 'replies-waiting',
      message: `${day.repliesWaiting} ${day.repliesWaiting === 1 ? 'reply has' : 'replies have'} waited for an answer today.`,
      tone: 'warning',
    })
  }
  if (day.followUpsDue > 0) {
    warnings.push({
      id: 'followups-due',
      message: `${day.followUpsDue} follow-up${day.followUpsDue === 1 ? '' : 's'} due.`,
      tone: 'warning',
    })
  }

  for (const profile of profiles) {
    if (profile.targetCount === 0) continue
    if (profile.completedCount === 0) {
      warnings.push({
        id: `not-started-${profile.profileId}`,
        message: `${profile.name} has not been started today.`,
        tone: 'warning',
      })
    } else if (profile.remaining > 0 && (profile.status === 'BEHIND' || profile.status === 'AT_RISK')) {
      warnings.push({
        id: `behind-${profile.profileId}`,
        message: `${profile.name} has ${profile.remaining} remaining.`,
        tone: profile.status === 'AT_RISK' ? 'danger' : 'warning',
      })
    }
  }

  return warnings
}

export function buildProfilesToday(
  identities: AuthorizedIdentity[],
  byIdentity: Array<{
    revenueIdentityId: string
    identityName: string
    title: string | null
    channel: string
    targets: Array<{
      activityType: string
      targetCount: number
      completedCount: number
      remaining: number
    }>
  }>,
  workdayProgress: number,
  thresholds: WarningThresholds,
): ProfileToday[] {
  // Group by the canonical person, not the sender account: a person who sells
  // on two channels must see one card whose total is the sum of both lanes.
  const profileIdByIdentity = new Map(
    identities.map((i) => [i.revenueIdentityId, i.personId ?? i.profileId]),
  )
  const grouped = new Map<string, ProfileToday>()

  for (const row of byIdentity) {
    // An identity with no linked profile is its own profile key.
    const profileId = profileIdByIdentity.get(row.revenueIdentityId) ?? row.revenueIdentityId
    let entry = grouped.get(profileId)
    if (!entry) {
      entry = {
        profileId,
        name: row.identityName,
        title: row.title,
        channels: [],
        identityIds: [],
        targetCount: 0,
        completedCount: 0,
        remaining: 0,
        status: null,
        targets: [],
      }
      grouped.set(profileId, entry)
    }
    if (!entry.channels.includes(row.channel)) entry.channels.push(row.channel)
    if (!entry.identityIds.includes(row.revenueIdentityId)) entry.identityIds.push(row.revenueIdentityId)
    entry.targetCount += row.targets.reduce((sum, t) => sum + t.targetCount, 0)
    entry.completedCount += row.targets.reduce((sum, t) => sum + t.completedCount, 0)
    for (const target of row.targets) {
      const activityType = target.activityType as ActivityType
      entry.targets.push({
        activityType,
        label: METRIC_LABELS[activityType] ?? target.activityType,
        targetCount: target.targetCount,
        completedCount: target.completedCount,
        remaining: target.remaining,
      })
    }
  }

  for (const entry of grouped.values()) {
    entry.remaining = Math.max(0, entry.targetCount - entry.completedCount)
    entry.status = profileCompletionStatus(
      entry.targetCount,
      entry.completedCount,
      workdayProgress,
      thresholds,
    )
  }

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name))
}
