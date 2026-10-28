import type { LeadDetail } from '@/lib/store/types'
import { buildThread } from '@/lib/conversation/thread'
import { deriveNextLeadAction, type LeadAction } from './lead-state-machine'

/**
 * One conversation truth.
 *
 * Presence and relationship display are derived here, once, from the same
 * canonical thread (`buildThread`) that the Conversation tab, History and
 * Archive read. Deriving them per surface is what let the Overview claim "no
 * conversation" while Archive showed a turn (REL-QA-002) and let a lead the rep
 * still owes a reply to render "Replied" (REL-QA-005).
 */

export type ConversationPresence =
  | 'NO_MESSAGES'
  | 'UNVERIFIED_THREAD'
  | 'VERIFIED_THREAD'
  | 'DISMISSED_THREAD'
  | 'MISMATCH_REVIEW'

/**
 * Whether a lead has a conversation at all, and whether its identity can be
 * trusted. Reads the thread, not raw message rows: an inbound-first lead keeps
 * its opening message on `lead.inboundMessage`, so a rows-only check reports
 * NO_MESSAGES for a lead that visibly has a thread.
 */
export function deriveConversationPresence(
  lead: LeadDetail,
  opts: { mismatch?: boolean } = {},
): ConversationPresence {
  if (buildThread(lead).length === 0) return 'NO_MESSAGES'
  if (opts.mismatch) return 'MISMATCH_REVIEW'

  const messages = lead.messages ?? []
  if (messages.some((m) => m.threadStatus === 'DISMISSED')) return 'DISMISSED_THREAD'

  // An inbound-first opening has no row to verify, so it stays unverified until
  // the sender identity is confirmed.
  const inboundFirst = lead.direction === 'inbound' && Boolean(lead.inboundMessage?.trim())
  const hasUnverifiedInbound = messages.some(
    (m) => m.direction === 'inbound' && m.threadStatus === 'UNVERIFIED',
  )
  if (inboundFirst || hasUnverifiedInbound) return 'UNVERIFIED_THREAD'
  return 'VERIFIED_THREAD'
}

export type RelationshipDisplayState =
  | 'TO_CONTACT'
  | 'WAITING_ON_CONNECTION'
  | 'SEND_FIRST_MESSAGE'
  | 'WAITING_ON_CLIENT'
  | 'NEEDS_REPLY'
  | 'FOLLOW_UP_DUE'
  | 'CONNECTED'
  | 'CLOSED'
  | 'REVIEW'

/** Unambiguous labels. The internal `replied` phase is never shown as "Replied". */
export const RELATIONSHIP_DISPLAY_LABEL: Record<RelationshipDisplayState, string> = {
  TO_CONTACT: 'To contact',
  WAITING_ON_CONNECTION: 'Waiting on connection',
  SEND_FIRST_MESSAGE: 'Send first message',
  WAITING_ON_CLIENT: 'Waiting on client',
  NEEDS_REPLY: 'Needs reply',
  FOLLOW_UP_DUE: 'Follow-up due',
  CONNECTED: 'Connected',
  CLOSED: 'Closed',
  REVIEW: 'Review',
}

export interface RelationshipDisplay {
  display: RelationshipDisplayState
  label: string
  action: LeadAction
  waitingOn: 'client' | 'connection' | null
}

/**
 * The one mapping from a canonical action to what the rep sees. Every surface
 * renders `label`; none reinterprets the internal phase.
 */
export function displayForAction(action: LeadAction, leadStatus: string | null): RelationshipDisplay {
  switch (action) {
    case 'SEND_CONNECTION':
      return { display: 'TO_CONTACT', label: RELATIONSHIP_DISPLAY_LABEL.TO_CONTACT, action, waitingOn: null }
    case 'WAIT_CONNECTION':
      return { display: 'WAITING_ON_CONNECTION', label: RELATIONSHIP_DISPLAY_LABEL.WAITING_ON_CONNECTION, action, waitingOn: 'connection' }
    case 'SEND_DM':
      return { display: 'SEND_FIRST_MESSAGE', label: RELATIONSHIP_DISPLAY_LABEL.SEND_FIRST_MESSAGE, action, waitingOn: null }
    case 'WAIT_REPLY':
      return { display: 'WAITING_ON_CLIENT', label: RELATIONSHIP_DISPLAY_LABEL.WAITING_ON_CLIENT, action, waitingOn: 'client' }
    case 'SEND_REPLY':
      return { display: 'NEEDS_REPLY', label: RELATIONSHIP_DISPLAY_LABEL.NEEDS_REPLY, action, waitingOn: null }
    case 'SEND_FOLLOWUP':
      return { display: 'FOLLOW_UP_DUE', label: RELATIONSHIP_DISPLAY_LABEL.FOLLOW_UP_DUE, action, waitingOn: null }
    case 'CLOSED':
      return leadStatus === 'won'
        ? { display: 'CONNECTED', label: RELATIONSHIP_DISPLAY_LABEL.CONNECTED, action, waitingOn: null }
        : { display: 'CLOSED', label: RELATIONSHIP_DISPLAY_LABEL.CLOSED, action, waitingOn: null }
    case 'REVIEW':
    default:
      return { display: 'REVIEW', label: RELATIONSHIP_DISPLAY_LABEL.REVIEW, action, waitingOn: null }
  }
}

export function deriveRelationshipDisplayState(
  lead: LeadDetail,
  now: number = Date.now(),
): RelationshipDisplay {
  return displayForAction(deriveNextLeadAction(lead, now).action, lead.status)
}
