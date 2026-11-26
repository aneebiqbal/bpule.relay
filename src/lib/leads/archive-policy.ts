/**
 * The ONE lead archival policy.
 *
 * Every surface (state machine, inbox eligibility, cron sweep, notifications,
 * recommendations, restore) resolves through here so an elapsed internal review
 * deadline cannot mean different things in different places. These are internal
 * review windows, never claims about LinkedIn's real invitation expiry.
 */

export const ARCHIVE_POLICY = {
  /** A lead with no outreach at all becomes review-due after this many days. */
  newLeadDays: 30,
  /** Connection sent but not accepted becomes review-due after this many days. */
  pendingConnectionDays: 14,
  /** Full calendar days since the last outbound send before follow-ups end. */
  followupQuietDays: 3,
  /** Total follow-ups a lead may receive across its life. */
  maxFollowups: 3,
} as const

export interface ArchiveWindowInput {
  status: string | null
  createdAt?: string | null
  connectionAcceptedAt?: string | null
  lockedReason?: string | null
  lastOutboundAt?: string | null
  followupCount?: number
  hasRepliedSinceLastSend?: boolean
  now?: Date
}

export interface ArchiveDecision {
  due: boolean
  reason: 'new_lead' | 'pending_connection' | 'followups_exhausted' | 'active' | 'never'
  elapsedDays: number | null
}

function daysBetween(from: string, to: Date): number {
  const ms = to.getTime() - new Date(from).getTime()
  return Number.isFinite(ms) ? Math.floor(Math.max(0, ms) / 86_400_000) : 0
}

/**
 * Pure decision. A reply since the last outbound always makes the lead active;
 * a pending connection is review-due at the same 14-day window the state
 * machine reports, so the UI and the sweep agree.
 */
export function resolveArchiveReview(input: ArchiveWindowInput): ArchiveDecision {
  const now = input.now ?? new Date()
  if (input.hasRepliedSinceLastSend || input.status === 'replied') {
    return { due: false, reason: 'active', elapsedDays: null }
  }
  if (input.status === 'won' || input.status === 'lost' || input.status === 'dead' || input.status === 'no') {
    return { due: false, reason: 'never', elapsedDays: null }
  }

  if (!input.connectionAcceptedAt && input.lockedReason === 'connection_note_sent' && input.lastOutboundAt) {
    const elapsed = daysBetween(input.lastOutboundAt, now)
    return {
      due: elapsed >= ARCHIVE_POLICY.pendingConnectionDays,
      reason: 'pending_connection',
      elapsedDays: elapsed,
    }
  }

  if (input.status === 'new' && input.createdAt) {
    const elapsed = daysBetween(input.createdAt, now)
    return { due: elapsed >= ARCHIVE_POLICY.newLeadDays, reason: 'new_lead', elapsedDays: elapsed }
  }

  const followupsUsed = input.followupCount ?? 0
  const quietEnough = input.lastOutboundAt
    ? daysBetween(input.lastOutboundAt, now) >= ARCHIVE_POLICY.followupQuietDays
    : false
  if (followupsUsed >= ARCHIVE_POLICY.maxFollowups && quietEnough) {
    return { due: true, reason: 'followups_exhausted', elapsedDays: input.lastOutboundAt ? daysBetween(input.lastOutboundAt, now) : null }
  }
  return { due: false, reason: 'active', elapsedDays: null }
}
