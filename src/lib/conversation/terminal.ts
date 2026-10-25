/**
 * Terminal conversation authority — ONE place that decides whether a
 * conversation is over for outreach.
 *
 * The rule is absolute: once an opportunity is terminal, nothing may send a
 * DM, schedule a follow-up, create a reminder, or show a "Contact now" task,
 * unless a later explicit buyer message reopens it.
 *
 * Terminal = the client opted out / declined, or the deal closed
 * (Won / Lost / Closed). Do not duplicate these checks elsewhere: the
 * follow-up queue, the send path and the action policy all read this module.
 */

import type { ConversationIntent } from './intent'
import type { SalesOutcome } from '@/lib/sales/outcomes'
import type { LeadStatus } from '@/lib/domain/types'

export const TERMINAL_LEAD_STATUSES: ReadonlySet<string> = new Set(['won', 'lost', 'no', 'dead'])

export const TERMINAL_OUTCOMES: ReadonlySet<string> = new Set([
  'WON',
  'LOST',
  'DO_NOT_CONTACT',
])

/** Stored `outcomes.stage` values that close a lead for outreach. */
export const TERMINAL_STORED_STAGES: ReadonlySet<string> = new Set([
  'won',
  'lost',
  'no_reply',
  'dead',
  'do_not_contact',
  'negative',
])

export function isTerminalLeadStatus(status: LeadStatus | string | null | undefined): boolean {
  return typeof status === 'string' && TERMINAL_LEAD_STATUSES.has(status)
}

export function isTerminalOutcome(outcome: SalesOutcome | string | null | undefined): boolean {
  return typeof outcome === 'string' && TERMINAL_OUTCOMES.has(outcome)
}

export function isTerminalStoredStage(stage: string | null | undefined): boolean {
  return typeof stage === 'string' && TERMINAL_STORED_STAGES.has(stage)
}

/**
 * A conversation is terminal when the client declined (which includes an
 * explicit opt-out) or explicitly ended it. A deferral is NOT terminal — a
 * deferral has its own date and may be revisited.
 */
export function isTerminalConversation(intent: ConversationIntent): boolean {
  return intent.declined || intent.class === 'NEGATIVE'
}

export interface TerminalCheck {
  terminal: boolean
  reason: string | null
}

/**
 * The single guard used before any outbound message. `allowReply` is true on
 * the rep's own answer path: answering a client is never blocked by the
 * terminal state, only cold outreach is.
 */
export function checkOutreachAllowed(input: {
  leadStatus?: LeadStatus | string | null
  conversationIntent?: ConversationIntent | null
  storedStages?: Array<string | null>
  allowReply?: boolean
}): TerminalCheck {
  const { leadStatus, conversationIntent, storedStages, allowReply = false } = input
  if (allowReply) return { terminal: false, reason: null }

  if (isTerminalLeadStatus(leadStatus)) {
    return { terminal: true, reason: `This opportunity is closed (${leadStatus}). No outreach is allowed.` }
  }
  if (conversationIntent && isTerminalConversation(conversationIntent)) {
    return { terminal: true, reason: `The client declined or opted out. No outreach is allowed.` }
  }
  for (const stage of storedStages ?? []) {
    if (isTerminalStoredStage(stage)) {
      return { terminal: true, reason: `This opportunity is closed (${stage}). No outreach is allowed.` }
    }
  }
  return { terminal: false, reason: null }
}
