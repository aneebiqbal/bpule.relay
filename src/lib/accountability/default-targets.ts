import type { ActivityType, DailyTarget, RevenueIdentityChannel } from '@/lib/domain/types'

export interface DefaultDailyTarget {
  activityType: ActivityType
  targetCount: number
}

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  dm: 'DMs',
  email: 'Emails',
  connection_request: 'Connections',
  followup: 'Follow-ups',
  application: 'Applications',
  proposal: 'Proposals',
  other: 'Other',
}

const LINKEDIN_PACK: DefaultDailyTarget[] = [
  { activityType: 'connection_request', targetCount: 30 },
  { activityType: 'dm', targetCount: 30 },
  { activityType: 'followup', targetCount: 30 },
]

const EMAIL_PACK: DefaultDailyTarget[] = [
  { activityType: 'email', targetCount: 30 },
  { activityType: 'followup', targetCount: 25 },
]

const UPWORK_PACK: DefaultDailyTarget[] = [
  { activityType: 'application', targetCount: 10 },
  { activityType: 'proposal', targetCount: 10 },
]

export function defaultTargetsForChannel(channel: RevenueIdentityChannel): DefaultDailyTarget[] {
  if (channel === 'upwork') return UPWORK_PACK
  if (channel === 'email') return EMAIL_PACK
  return LINKEDIN_PACK
}

export function activityLabel(activityType: ActivityType): string {
  return ACTIVITY_LABELS[activityType] ?? activityType
}

export function formatDefaultPack(channel: RevenueIdentityChannel): string {
  return defaultTargetsForChannel(channel)
    .map((row) => `${row.targetCount} ${activityLabel(row.activityType).toLowerCase()}`)
    .join(', ')
}

export function missingDefaultActivities(
  channel: RevenueIdentityChannel,
  existing: Array<Pick<DailyTarget, 'activityType'>>,
): DefaultDailyTarget[] {
  const have = new Set(existing.map((row) => row.activityType))
  return defaultTargetsForChannel(channel).filter((row) => !have.has(row.activityType))
}
