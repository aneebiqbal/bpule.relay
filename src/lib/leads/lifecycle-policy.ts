import { isArchiveEligible } from './followup'

/**
 * Lead lifecycle policy engine.
 *
 * Computes a lifecycle state for each lead based on its current stage,
 * time since last activity, and engagement signals. Pure functions — no
 * DB access, no side effects. Use in both server (page render) and cron.
 */

export type LifecycleState = 'active' | 'stale' | 'cold' | 'frozen'

export interface LifecyclePolicy {
  /** Days after connection sent with no acceptance → stale */
  connectionPendingStaleDays: number
  /** Days after connection sent with no acceptance → cold */
  connectionPendingColdDays: number
  /** Days since last outbound send with no reply → stale */
  noReplyStaleDays: number
  /** Days since last outbound send with no reply → cold */
  noReplyColdDays: number
  /** Days in 'new' status with no outreach → stale */
  newLeadStaleDays: number
  /** Days in 'new' status with no outreach → cold */
  newLeadColdDays: number
  /** Days in cold with no activity → frozen (about to auto-archive) */
  frozenDays: number
}

export const DEFAULT_POLICY: LifecyclePolicy = {
  connectionPendingStaleDays: 7,
  connectionPendingColdDays: 14,
  noReplyStaleDays: 7,
  noReplyColdDays: 21,
  newLeadStaleDays: 14,
  newLeadColdDays: 30,
  frozenDays: 21,
}

export interface LifecycleInput {
  status: string
  createdAt: string
  connectionAcceptedAt?: string | null
  lockedReason?: string | null
  lockedUntil?: string | null
  lastOutboundAt?: string | null
  lastInboundAt?: string | null
  followupCount?: number
  archived?: boolean
  now?: number
}

export interface LifecycleResult {
  state: LifecycleState
  daysStale: number
  reason: string
}

/**
 * Compute lifecycle state for a lead.
 */
export function computeLifecycleState(input: LifecycleInput, policy: LifecyclePolicy = DEFAULT_POLICY): LifecycleResult {
  const now = input.now ?? Date.now()

  if (input.archived) {
    return { state: 'frozen', daysStale: 0, reason: 'Archived' }
  }

  // Terminal states
  if (input.status === 'won' || input.status === 'lost' || input.status === 'dead' || input.status === 'no') {
    return { state: 'active', daysStale: 0, reason: 'Terminal' }
  }

  // They replied — always active
  if (input.status === 'replied') {
    return { state: 'active', daysStale: 0, reason: 'Awaiting our reply' }
  }

  // New lead — check how long it's sat untouched
  if (input.status === 'new') {
    const daysSinceCreated = Math.floor((now - new Date(input.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceCreated >= policy.newLeadColdDays) {
      return { state: 'cold', daysStale: daysSinceCreated, reason: `New lead untouched for ${daysSinceCreated}d` }
    }
    if (daysSinceCreated >= policy.newLeadStaleDays) {
      return { state: 'stale', daysStale: daysSinceCreated, reason: `New lead untouched for ${daysSinceCreated}d` }
    }
    return { state: 'active', daysStale: 0, reason: 'New lead' }
  }

  // Connection pending (sent but not accepted)
  if (input.status === 'contacted' && !input.connectionAcceptedAt && input.lockedReason === 'connection_note_sent') {
    const lastOutboundMs = input.lastOutboundAt ? new Date(input.lastOutboundAt).getTime() : new Date(input.createdAt).getTime()
    const daysPending = Math.floor((now - lastOutboundMs) / (1000 * 60 * 60 * 24))
    if (daysPending >= policy.connectionPendingColdDays) {
      return { state: 'cold', daysStale: daysPending, reason: `Connection pending ${daysPending}d` }
    }
    if (daysPending >= policy.connectionPendingStaleDays) {
      return { state: 'stale', daysStale: daysPending, reason: `Connection pending ${daysPending}d` }
    }
    return { state: 'active', daysStale: 0, reason: 'Connection recently sent' }
  }

  // Waiting for reply or followed up
  if (input.status === 'contacted' || input.status === 'followed_up') {
    if (!input.lastOutboundAt) {
      return { state: 'active', daysStale: 0, reason: 'Recently contacted' }
    }

    const daysSinceOutbound = Math.floor((now - new Date(input.lastOutboundAt).getTime()) / (1000 * 60 * 60 * 24))

    // Check archive eligibility — if eligible, mark as frozen
    if (isArchiveEligible({
      followupCount: input.followupCount ?? 0,
      lastSendAt: input.lastOutboundAt,
      hasRepliedSinceLastSend: !!input.lastInboundAt && new Date(input.lastInboundAt) > new Date(input.lastOutboundAt),
      now: new Date(now),
    })) {
      return { state: 'frozen', daysStale: daysSinceOutbound, reason: 'Archive-eligible: all follow-ups exhausted' }
    }

    if (daysSinceOutbound >= policy.noReplyColdDays) {
      return { state: 'cold', daysStale: daysSinceOutbound, reason: `No reply for ${daysSinceOutbound}d` }
    }
    if (daysSinceOutbound >= policy.noReplyStaleDays) {
      return { state: 'stale', daysStale: daysSinceOutbound, reason: `No reply for ${daysSinceOutbound}d` }
    }
    return { state: 'active', daysStale: 0, reason: 'Recently sent' }
  }

  return { state: 'active', daysStale: 0, reason: 'Active' }
}

export function getStalenessColor(state: LifecycleState): string {
  switch (state) {
    case 'active': return 'bg-status-success'
    case 'stale': return 'bg-status-warning'
    case 'cold': return 'bg-orange'
    case 'frozen': return 'bg-stone'
  }
}

export function getStalenessLabel(state: LifecycleState): string {
  switch (state) {
    case 'active': return 'Active'
    case 'stale': return 'Stale'
    case 'cold': return 'Cold'
    case 'frozen': return 'Frozen'
  }
}
