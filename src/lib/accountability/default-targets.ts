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
  prospect_extracted: 'Prospects captured',
  other: 'Other',
}

// Rebalance (approved product design, see AGENTS task notes): a lead can now
// only ever receive 3 follow-ups total across its life (see
// src/lib/relay/followup-engine.ts) — a per-rep daily target of 30 follow-ups
// was never realistic against a lifetime cap of 3 per lead, so it is lowered
// to 3/day, which is still generous headroom (a rep would need 3 leads
// simultaneously due for their final follow-up on the same day to hit it).
// connection_request/dm stay high because those are first-touch actions,
// unconstrained by the per-lead followup cap.
const LINKEDIN_PACK: DefaultDailyTarget[] = [
  { activityType: 'connection_request', targetCount: 30 },
  { activityType: 'dm', targetCount: 30 },
  { activityType: 'followup', targetCount: 3 },
  // Extraction happens on both channels via /prospect (paste a LinkedIn
  // profile or an email lead and Relay scores it) — added to both the
  // LinkedIn and Email packs rather than as a separate universal pack, since
  // there is no rep who works neither channel. 15/day is a sensible middle
  // ground: comfortably above what a rep sourcing manually would hit, but
  // not so high it turns extraction into a vanity-metric grind.
  { activityType: 'prospect_extracted', targetCount: 15 },
]

const EMAIL_PACK: DefaultDailyTarget[] = [
  { activityType: 'email', targetCount: 25 },
  { activityType: 'followup', targetCount: 3 },
  { activityType: 'prospect_extracted', targetCount: 15 },
]

// Applications are reviewed/counted at a higher volume than proposals:
// proposals are the higher-effort, score-gated action (score >= 6 required,
// see src/lib/score/upwork-rubric.ts + the apply-route hard gate) so the
// daily target for them is intentionally lower than the applications target.
const UPWORK_PACK: DefaultDailyTarget[] = [
  { activityType: 'application', targetCount: 10 },
  { activityType: 'proposal', targetCount: 5 },
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
