/**
 * The ONE canonical activity registry.
 *
 * Every real action the product can count is defined here exactly once. No
 * surface keeps a local label map, and no target lane exists that is not in
 * this file.
 *
 * TRACKED ≠ TARGETABLE. An action may appear in activity history and still not
 * form a daily plan — generating a draft is real work, but it is not the same
 * as submitting an application.
 */

export type ActivityKey =
  | 'prospect_extracted'
  | 'connection_sent'
  | 'dm_sent'
  | 'followup_sent'
  | 'reply_handled'
  | 'application_submitted'
  | 'proposal_generated'
  | 'email_sent'
  | 'email_followup_sent'
  | 'email_reply_handled'
  | 'task_completed'
  | 'other'

export type ActivityChannel = 'linkedin' | 'upwork' | 'email' | 'general'

export interface ActivityDefinition {
  key: ActivityKey
  channel: ActivityChannel
  label: string
  shortLabel: string
  /** Whether a daily plan may be built from this action. */
  targetable: boolean
  /** Secondary analytics only — raw counts stay the truth. */
  defaultWeight: number
  /** The ONE table/column that proves the action happened. */
  completionAuthority: string
  /** Where the action lands in the product, if it has a surface. */
  destination?: string
  /**
   * The action_events.action_type values that mean this happened. One real
   * action must map to exactly one activity key.
   */
  sourceEventTypes: readonly string[]
  /**
   * When a source event type is shared across channels (FOLLOWUP_SENT is both
   * LinkedIn and Email), this narrows which activity the event means.
   */
  sourceChannel?: ActivityChannel
}

const LINKEDIN: readonly ActivityKey[] = [
  'prospect_extracted',
  'connection_sent',
  'dm_sent',
  'followup_sent',
  'reply_handled',
]

export const ACTIVITY_REGISTRY: Record<ActivityKey, ActivityDefinition> = {
  prospect_extracted: {
    key: 'prospect_extracted',
    channel: 'linkedin',
    label: 'Prospects captured',
    shortLabel: 'Prospects',
    targetable: true,
    defaultWeight: 1,
    completionAuthority: 'action_events.action_type=LEAD_EXTRACTED',
    destination: '/prospect',
    sourceEventTypes: ['LEAD_EXTRACTED'],
  },
  connection_sent: {
    key: 'connection_sent',
    channel: 'linkedin',
    label: 'Connections',
    shortLabel: 'Connections',
    targetable: true,
    defaultWeight: 1,
    completionAuthority: 'action_events.action_type=CONNECTION_SENT',
    sourceEventTypes: ['CONNECTION_SENT'],
  },
  dm_sent: {
    key: 'dm_sent',
    channel: 'linkedin',
    label: 'DMs',
    shortLabel: 'DMs',
    targetable: true,
    defaultWeight: 1,
    completionAuthority: 'action_events.action_type=DM_SENT',
    sourceEventTypes: ['DM_SENT'],
  },
  followup_sent: {
    key: 'followup_sent',
    channel: 'linkedin',
    label: 'Follow-ups',
    shortLabel: 'Follow-ups',
    targetable: true,
    defaultWeight: 1,
    completionAuthority: 'action_events.action_type=FOLLOWUP_SENT',
    sourceChannel: 'linkedin',
    sourceEventTypes: ['FOLLOWUP_SENT'],
  },
  reply_handled: {
    key: 'reply_handled',
    channel: 'linkedin',
    label: 'Replies handled',
    shortLabel: 'Replies',
    targetable: false,
    defaultWeight: 1,
    completionAuthority: 'action_events.action_type=REPLY_SENT',
    sourceChannel: 'linkedin',
    sourceEventTypes: ['REPLY_SENT'],
  },
  application_submitted: {
    key: 'application_submitted',
    channel: 'upwork',
    label: 'Applications',
    shortLabel: 'Applications',
    targetable: true,
    defaultWeight: 3,
    completionAuthority: 'upwork_applications.submitted_at',
    destination: '/upwork',
    // UPWORK_APPLIED is the legacy historical alias of the same business event.
    // Both resolve here; analytics dedupe by job so neither is counted twice.
    sourceEventTypes: ['UPWORK_APPLICATION_SUBMITTED', 'UPWORK_APPLIED'],
  },
  proposal_generated: {
    key: 'proposal_generated',
    channel: 'upwork',
    label: 'Drafts generated',
    shortLabel: 'Drafts',
    // Real work, but it is NOT a submitted application.
    targetable: false,
    defaultWeight: 0,
    completionAuthority: 'action_events.action_type=UPWORK_PROPOSAL_PREPARED',
    sourceEventTypes: ['UPWORK_PROPOSAL_PREPARED'],
  },
  email_sent: {
    key: 'email_sent',
    channel: 'email',
    label: 'Emails sent',
    shortLabel: 'Emails',
    targetable: true,
    defaultWeight: 1,
    completionAuthority: 'email_send_attempts.status=delivered',
    destination: '/revenue/email',
    sourceEventTypes: [],
  },
  email_followup_sent: {
    key: 'email_followup_sent',
    channel: 'email',
    label: 'Email follow-ups',
    shortLabel: 'Follow-ups',
    targetable: true,
    defaultWeight: 1,
    completionAuthority: 'action_events.action_type=FOLLOWUP_SENT(channel=email)',
    sourceChannel: 'email',
    sourceEventTypes: ['FOLLOWUP_SENT'],
  },
  email_reply_handled: {
    key: 'email_reply_handled',
    channel: 'email',
    label: 'Email replies handled',
    shortLabel: 'Replies',
    targetable: false,
    defaultWeight: 1,
    completionAuthority: 'action_events.action_type=REPLY_SENT(channel=email)',
    sourceChannel: 'email',
    sourceEventTypes: ['REPLY_SENT'],
  },
  task_completed: {
    key: 'task_completed',
    channel: 'general',
    label: 'Tasks completed',
    shortLabel: 'Tasks',
    targetable: false,
    defaultWeight: 1,
    completionAuthority: 'assigned_tasks.status=DONE',
    sourceEventTypes: [],
  },
  other: {
    key: 'other',
    channel: 'general',
    label: 'Other',
    shortLabel: 'Other',
    targetable: false,
    defaultWeight: 0,
    completionAuthority: 'unattributed',
    sourceEventTypes: [],
  },
}

/** The targetable lanes for a channel, in canonical order. */
export function targetableActivitiesForChannel(channel: ActivityChannel): ActivityDefinition[] {
  if (channel === 'linkedin') {
    return LINKEDIN.map((key) => ACTIVITY_REGISTRY[key]).filter((row) => row.targetable)
  }
  return Object.values(ACTIVITY_REGISTRY).filter(
    (row) => row.channel === channel && row.targetable,
  )
}

export function activityDefinition(key: string | null | undefined): ActivityDefinition | null {
  if (!key) return null
  return ACTIVITY_REGISTRY[key as ActivityKey] ?? null
}

export function activityLabel(key: string | null | undefined): string {
  return activityDefinition(key)?.label ?? 'Other'
}

/**
 * The ONE map from an action_events.action_type to an activity key. One real
 * action must resolve to exactly one activity key — this is where the previous
 * Upwork label swap (application ↔ proposal) is prevented.
 */
export function activityKeyForEventType(
  actionType: string,
  channel?: string | null,
): ActivityKey | null {
  const matches = Object.values(ACTIVITY_REGISTRY).filter((row) => {
    if (!row.sourceEventTypes.includes(actionType)) return false
    if (row.sourceChannel && channel && row.sourceChannel !== channel) return false
    return true
  })
  // A channel-qualified match beats an unqualified one.
  const qualified = matches.find((row) => row.sourceChannel)
  return (qualified ?? matches[0])?.key ?? null
}

export const INTERNAL_EVENT_TYPES: readonly string[] = [
  'RECOMMENDATION_SHOWN',
  'RECOMMENDATION_ACTED',
  'PROFILE_RECOMMENDED',
  'UPWORK_JOB_EXTRACTED',
  'UPWORK_JOB_SAVED',
  'UPWORK_DELETED',
  'LEAD_REFERRED',
  'OPPORTUNITY_CREATED',
  'MEETING_BOOKED',
  'CLIENT_WON',
  'LEAD_ARCHIVED',
  'REPLY_RECEIVED',
  'CONNECTION_PREPARED',
  'DM_PREPARED',
  'LEAD_PROFILE_ASSIGNED',
  'LEAD_PROFILE_CHANGED',
]
