import type { Message, LeadStatus } from '@/lib/domain/types'

/**
 * Lead messaging lifecycle gates.
 *
 * Required flow: connection note sent -> wait for the prospect to accept ->
 * only then is a DM appropriate -> after a DM, a follow-up is eligible but
 * gated by a 6h cooldown -> one follow-up ever.
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

export function evaluateFollowupGate(input: {
  status: LeadStatus
  messages: Pick<Message, 'type' | 'sentText' | 'sentAt'>[]
  now?: number
}): FollowupGateResult {
  const now = input.now ?? Date.now()
  const hasPriorSend = input.messages.some((m) => m.sentText && m.sentAt)
  const alreadyUsed = input.status === 'followed_up'

  const lastDmSentAt = input.messages
    .filter((m) => m.type === 'dm' && m.sentText && m.sentAt)
    .map((m) => new Date(m.sentAt as string).getTime())
    .sort((a, b) => b - a)[0] ?? null

  const cooldownRemainingMs = lastDmSentAt != null
    ? Math.max(0, lastDmSentAt + FOLLOWUP_COOLDOWN_MS - now)
    : 0
  const inCooldown = cooldownRemainingMs > 0

  return {
    hasPriorSend,
    alreadyUsed,
    cooldownRemainingMs,
    inCooldown,
    eligible: input.status === 'contacted' && hasPriorSend && !alreadyUsed && !inCooldown,
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
