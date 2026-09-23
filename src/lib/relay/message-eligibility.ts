import type { Message, LeadStatus } from '@/lib/domain/types'

/**
 * Lead messaging lifecycle gates.
 *
 * Required flow: connection note sent -> wait for the prospect to accept ->
 * only then is a DM appropriate -> after a DM, a follow-up is eligible but
 * gated by a 6h cooldown -> up to three follow-ups ever (raised from a
 * 1-follow-up cap — approved product design change, see
 * src/lib/relay/followup-engine.ts).
 *
 * connectionAcceptedAt is set ONLY by explicit rep confirmation
 * (markConnectionAccepted / POST /api/leads/[id]/connection-accepted) —
 * never inferred from a reply, elapsed time, or anything else. A lead with
 * no connection note at all (Upwork, email, or DM-first outreach) has
 * nothing to wait on, so the DM gate never applies to it.
 */

export const FOLLOWUP_COOLDOWN_MS = 6 * 60 * 60 * 1000

export interface DmGateResult {
  /** A connection note was sent for this lead and the message model actually applies here. */
  connectionNoteSent: boolean
  connectionAccepted: boolean
  /** True when DM should be disabled: a connection note was sent but not yet accepted. */
  blocked: boolean
}

export function evaluateDmGate(input: {
  messages: Pick<Message, 'type' | 'sentText' | 'sentAt'>[]
  connectionAcceptedAt: string | null | undefined
}): DmGateResult {
  const connectionNoteSent = input.messages.some((m) => m.type === 'connection' && m.sentText && m.sentAt)
  const connectionAccepted = Boolean(input.connectionAcceptedAt)
  return {
    connectionNoteSent,
    connectionAccepted,
    blocked: connectionNoteSent && !connectionAccepted,
  }
}

export interface FollowupGateResult {
  hasPriorSend: boolean
  alreadyUsed: boolean
  /** ms remaining until the 6h cooldown since the last DM clears; 0 if not in cooldown or no DM sent yet. */
  cooldownRemainingMs: number
  inCooldown: boolean
  eligible: boolean
}

const MAX_FOLLOWUPS_PER_LEAD = 3

export function evaluateFollowupGate(input: {
  status: LeadStatus
  messages: Pick<Message, 'type' | 'sentText' | 'sentAt'>[]
  now?: number
  /**
   * ConversationState.followupCount — the actual number of follow-ups sent
   * so far. Optional ONLY for backward compatibility with older callers
   * that don't have it wired up yet: when omitted, this falls back to the
   * old status-based signal (status === 'followed_up' => already used),
   * which under-counts once the 3-follow-up cap is in play (status flips to
   * 'followed_up' after the FIRST follow-up and stays there, so without a
   * real count this can only ever tell "used at least one", not "used all
   * three"). Pass followupCount whenever it's available so a lead can
   * actually reach its 2nd and 3rd follow-up in the UI.
   */
  followupCount?: number
}): FollowupGateResult {
  const now = input.now ?? Date.now()
  const hasPriorSend = input.messages.some((m) => m.sentText && m.sentAt)
  const alreadyUsed = input.followupCount != null
    ? input.followupCount >= MAX_FOLLOWUPS_PER_LEAD
    : input.status === 'followed_up'

  const lastDmSentAt = input.messages
    .filter((m) => m.type === 'dm' && m.sentText && m.sentAt)
    .map((m) => new Date(m.sentAt as string).getTime())
    .sort((a, b) => b - a)[0] ?? null

  const cooldownRemainingMs = lastDmSentAt != null
    ? Math.max(0, lastDmSentAt + FOLLOWUP_COOLDOWN_MS - now)
    : 0
  const inCooldown = cooldownRemainingMs > 0

  const statusEligible = input.followupCount != null
    ? input.status === 'contacted' || input.status === 'followed_up'
    : input.status === 'contacted'

  return {
    hasPriorSend,
    alreadyUsed,
    cooldownRemainingMs,
    inCooldown,
    eligible: statusEligible && hasPriorSend && !alreadyUsed && !inCooldown,
  }
}

export function formatCooldownRemaining(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}
