import type { LeadDetail } from '@/lib/store/types'
import type { Message } from '@/lib/domain/types'
import { evaluateDmGate, evaluateFollowupGate } from './message-eligibility'
import { isFollowupDue } from '@/lib/leads/followup'

/**
 * Relationship presentation state.
 *
 * This is a PURE PRESENTATION LAYER. It reads canonical business state
 * (LeadDetail: messages, outcomes, status, connectionAcceptedAt, etc.)
 * and maps it to presentation states the UI renders. It does NOT invent
 * lifecycle truth — every field traces back to canonical domain state.
 *
 * The five presentation kinds:
 *   your_move        — the rep needs to act now
 *   their_move       — we are legitimately waiting on the other party
 *   needs_information — external state is unknown, ask the rep
 *   won              — terminal success
 *   lost             — terminal closed
 */

export type RelationshipKind =
  | 'your_move'
  | 'their_move'
  | 'needs_information'
  | 'won'
  | 'lost'

export type RelationshipPhase =
  | 'prospect'
  | 'connection_due'
  | 'connection_sent'
  | 'connection_accepted'
  | 'dm_due'
  | 'dm_sent'
  | 'waiting_for_reply'
  | 'replied'
  | 'follow_up_due'
  | 'conversation'
  | 'meeting'
  | 'proposal'
  | 'won'
  | 'lost'

export interface RelationshipState {
  kind: RelationshipKind
  phase: RelationshipPhase
  title: string
  detail: string
  waitingOn: 'client' | 'connection' | null
  waitingSince: string | null
  followUpDueLabel: string | null
  lastClientMessage: Message | null
  lastOutboundMessage: Message | null
  primaryCta: string
  secondaryCta: string | null
  lastActionLabel: string | null
  lastActionAt: string | null
}

function latestMessage(messages: Message[], type: string): Message | null {
  return messages
    .filter((m) => m.type === type && m.sentText && m.sentAt)
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0] ?? null
}

function latestInbound(messages: Message[]): Message | null {
  return messages
    .filter((m) => m.direction === 'inbound' && m.sentText && m.sentAt)
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0] ?? null
}

function latestOutbound(messages: Message[]): Message | null {
  return messages
    .filter((m) => m.direction !== 'inbound' && m.sentText && m.sentAt)
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0] ?? null
}

export function computeRelationshipState(lead: LeadDetail, now: number = Date.now()): RelationshipState {
  const dmGate = evaluateDmGate({
    messages: lead.messages,
    connectionAcceptedAt: lead.connectionAcceptedAt,
  })
  const followupGate = evaluateFollowupGate({
    status: lead.status,
    messages: lead.messages,
    followupCount: lead.followupCount,
    now,
  })

  const connectionSent = Boolean(latestMessage(lead.messages, 'connection'))
  const lastDmMsg = latestMessage(lead.messages, 'dm')
  const dmSent = Boolean(lastDmMsg)
  const clientReplied = Boolean(latestInbound(lead.messages)) ||
    lead.outcomes.some((o) => o.stage === 'replied')
  const outboundReply = lead.messages
    .filter((m) => m.type === 'reply' && m.direction !== 'inbound' && m.sentText && m.sentAt)
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0] ?? null
  const replySent = Boolean(outboundReply)
  const followupSent = Boolean(latestMessage(lead.messages, 'followup'))
  const lastClient = latestInbound(lead.messages)
  const lastOutbound = latestOutbound(lead.messages)

  // Follow-up is due after 5 business days (not just the 6h cooldown).
  // The 6h cooldown is a separate anti-spam gate; the real due date uses
  // business-day math from leads/followup.ts.
  const followupBusinessDaysDue = lastDmMsg?.sentAt
    ? isFollowupDue(lastDmMsg.sentAt, clientReplied, new Date(now))
    : false
  const followupMaxUsed = lead.followupCount >= 3

  const lastReply = lead.messages
    .filter((m) => m.type === 'reply' && m.sentText && m.sentAt)
    .sort((a, b) => (b.sentAt ?? '').localeCompare(a.sentAt ?? ''))[0] ?? null

  // ── Terminal states ──────────────────────────────────────────────
  if (lead.status === 'won') {
    return {
      kind: 'won',
      phase: 'won',
      title: 'Opportunity won',
      detail: 'This lead converted successfully.',
      waitingOn: null,
      waitingSince: null,
      followUpDueLabel: null,
      lastClientMessage: lastClient,
      lastOutboundMessage: lastOutbound,
      primaryCta: '',
      secondaryCta: null,
      lastActionLabel: lastOutbound ? 'Last action' : null,
      lastActionAt: lastOutbound?.sentAt ?? null,
    }
  }

  if (lead.status === 'lost' || lead.status === 'dead' || lead.status === 'no') {
    return {
      kind: 'lost',
      phase: 'lost',
      title: lead.status === 'no' ? 'Closed' : 'Opportunity lost',
      detail: 'This lead is no longer active.',
      waitingOn: null,
      waitingSince: null,
      followUpDueLabel: null,
      lastClientMessage: lastClient,
      lastOutboundMessage: lastOutbound,
      primaryCta: '',
      secondaryCta: null,
      lastActionLabel: lastOutbound ? 'Last action' : null,
      lastActionAt: lastOutbound?.sentAt ?? null,
    }
  }

  // ── Waiting on connection acceptance ─────────────────────────────
  if (connectionSent && !dmGate.connectionAccepted) {
    const connMsg = latestMessage(lead.messages, 'connection')
    return {
      kind: 'their_move',
      phase: 'connection_sent',
      title: 'Waiting for connection',
      detail: 'You sent a connection request. Waiting for them to accept.',
      waitingOn: 'connection',
      waitingSince: connMsg?.sentAt ?? null,
      followUpDueLabel: null,
      lastClientMessage: null,
      lastOutboundMessage: connMsg,
      primaryCta: 'Mark Accepted',
      secondaryCta: 'Log Update',
      lastActionLabel: 'Connection sent',
      lastActionAt: connMsg?.sentAt ?? null,
    }
  }

  // ── Client replied — needs our response ──────────────────────────
  if (clientReplied && !replySent) {
    return {
      kind: 'your_move',
      phase: 'replied',
      title: 'They replied',
      detail: 'The client sent a message. Reply while it\'s fresh.',
      waitingOn: null,
      waitingSince: null,
      followUpDueLabel: null,
      lastClientMessage: lastClient,
      lastOutboundMessage: lastOutbound,
      primaryCta: 'Prepare Reply',
      secondaryCta: null,
      lastActionLabel: 'They replied',
      lastActionAt: lastClient?.sentAt ?? null,
    }
  }

  // ── We replied, waiting for client ───────────────────────────────
  if (replySent) {
    return {
      kind: 'their_move',
      phase: 'conversation',
      title: 'Waiting for client',
      detail: 'You replied. Waiting for their response.',
      waitingOn: 'client',
      waitingSince: lastReply?.sentAt ?? null,
      followUpDueLabel: null,
      lastClientMessage: lastClient,
      lastOutboundMessage: lastReply,
      primaryCta: 'Paste Client Reply',
      secondaryCta: 'Log Update',
      lastActionLabel: 'You replied',
      lastActionAt: lastReply?.sentAt ?? null,
    }
  }

  // ── DM sent, waiting for reply ───────────────────────────────────
  if (dmSent && !clientReplied) {
    // Follow-up due only after 5 business days AND not maxed out
    if (followupBusinessDaysDue && !followupMaxUsed) {
      return {
        kind: 'your_move',
        phase: 'follow_up_due',
        title: 'Follow up',
        detail: 'No reply logged after 5 business days. Time to follow up.',
        waitingOn: null,
        waitingSince: null,
        followUpDueLabel: null,
        lastClientMessage: lastClient,
        lastOutboundMessage: lastDmMsg,
        primaryCta: 'Prepare Follow-Up',
        secondaryCta: null,
        lastActionLabel: 'Last message sent',
        lastActionAt: lastDmMsg?.sentAt ?? null,
      }
    }
    return {
      kind: 'their_move',
      phase: 'dm_sent',
      title: 'Waiting for reply',
      detail: 'You sent a message. Waiting for the client to respond.',
      waitingOn: 'client',
      waitingSince: lastDmMsg?.sentAt ?? null,
      followUpDueLabel: null,
      lastClientMessage: null,
      lastOutboundMessage: lastDmMsg,
      primaryCta: 'Paste Client Reply',
      secondaryCta: 'Log Update',
      lastActionLabel: 'Message sent',
      lastActionAt: lastDmMsg?.sentAt ?? null,
    }
  }

  // ── Connection accepted, DM not sent ─────────────────────────────
  if (dmGate.connectionAccepted && !dmSent) {
    return {
      kind: 'your_move',
      phase: 'connection_accepted',
      title: 'Send first message',
      detail: 'They accepted your connection. Start the conversation.',
      waitingOn: null,
      waitingSince: null,
      followUpDueLabel: null,
      lastClientMessage: null,
      lastOutboundMessage: latestMessage(lead.messages, 'connection'),
      primaryCta: 'Prepare DM',
      secondaryCta: null,
      lastActionLabel: 'Connection accepted',
      lastActionAt: lead.connectionAcceptedAt ?? null,
    }
  }

  // ── Default: connection not sent ─────────────────────────────────
  return {
    kind: 'your_move',
    phase: 'connection_due',
    title: 'Send connection request',
    detail: 'Start by reaching out to connect.',
    waitingOn: null,
    waitingSince: null,
    followUpDueLabel: null,
    lastClientMessage: null,
    lastOutboundMessage: null,
    primaryCta: 'Prepare Connection',
    secondaryCta: null,
    lastActionLabel: null,
    lastActionAt: null,
  }
}
