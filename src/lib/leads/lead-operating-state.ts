/**
 * THE lead operating-state authority.
 *
 * Relay had several surfaces each re-deriving "what is this lead and what
 * happens next" from `status` + `lastInboundAt` + `lastOutboundAt`. They
 * disagreed, which is why the list, the detail page and the inbox could not
 * agree on whether a lead needed a reply.
 *
 * Three different questions, three different answers — never one stored field:
 *
 *  1. salesStage       "how far along is this deal?"   (canonical CRM vocabulary)
 *  2. conversationState "who owes the next message?"    (canonical queue state)
 *  3. executionState   "can this lead be worked at all?" (attribution + archive)
 *
 * Everything else on a lead row — profile, identity, primary owner, current
 * operator, next action — is derived here too, so no surface invents its own.
 */
import type { Lead } from '@/lib/domain/types'

export type SalesStage =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'meeting'
  | 'proposal'
  | 'won'
  | 'lost'

export type ConversationState =
  | 'needs_reply'
  | 'waiting_on_client'
  | 'follow_up_due'
  | 'no_active_conversation'

export type ExecutionState =
  | 'active'
  | 'needs_profile'
  | 'archived'

export type LeadNextAction =
  | 'reply'
  | 'follow_up'
  | 'send_connection'
  | 'send_email'
  | 'review_stale'
  | 'book_meeting'
  | 'assign_profile'
  | 'none'

export interface LeadAttribution {
  profileId: string | null
  profileName: string | null
  profileChannel: string | null
  identityId: string | null
  identityName: string | null
  identityChannel: string | null
}

export interface LeadResponsibility {
  primaryRepId: string | null
  primaryName: string | null
  operatorRepIds: string[]
  operatorNames: string[]
}

export interface LeadOperatingState {
  salesStage: SalesStage
  conversationState: ConversationState
  executionState: ExecutionState
  nextAction: LeadNextAction
  nextActionLabel: string
  attribution: LeadAttribution
  responsibility: LeadResponsibility
  /** True when a channel identity exists but no person/profile is attached. */
  needsProfile: boolean
  /** Human header line: "Stage: Replied · Waiting on us". */
  summary: string
  /** Human line for "Working now: …" — derived, never stored on the lead. */
  workingNow: string
}

const NEXT_ACTION_LABEL: Record<LeadNextAction, string> = {
  reply: 'Reply to client',
  follow_up: 'Follow up',
  send_connection: 'Send connection',
  send_email: 'Send email',
  review_stale: 'Review stale lead',
  book_meeting: 'Book meeting',
  assign_profile: 'Assign profile',
  none: 'No action due',
}

const STAGE_LABEL: Record<SalesStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
}

const CONVERSATION_LABEL: Record<ConversationState, string> = {
  needs_reply: 'Needs reply',
  waiting_on_client: 'Waiting on client',
  follow_up_due: 'Follow-up due',
  no_active_conversation: 'No active conversation',
}

const EXECUTION_LABEL: Record<ExecutionState, string> = {
  active: 'Active',
  needs_profile: 'Needs profile',
  archived: 'Archived',
}

export interface DeriveLeadOperatingStateInput {
  lead: Pick<
    Lead,
    | 'status'
    | 'archived'
    | 'direction'
    | 'verdict'
    | 'connectionAcceptedAt'
    | 'senderProfileId'
    | 'revenueIdentityId'
    | 'source'
  > & {
    lastOutboundAt?: string | null
    lastInboundAt?: string | null
    followupCount?: number
    lifecycle?: { state?: string | null } | null
  }
  /** Canonical CRM conversation stage, when a conversation exists. */
  conversationStage?: string | null
  /** Canonical queue state, when known (waiting_on_rep, follow_up_due, …). */
  queueState?: string | null
  /** Canonical pipeline stage, when known (to_contact, needs_reply, …). */
  pipelineStage?: string | null
  attribution?: Partial<LeadAttribution> | null
  responsibility?: Partial<LeadResponsibility> | null
}

function deriveSalesStage(input: DeriveLeadOperatingStateInput): SalesStage {
  const { lead, conversationStage } = input
  if (lead.status === 'won') return 'won'
  if (lead.status === 'lost' || lead.status === 'no' || lead.status === 'dead') return 'lost'

  // Explicit conversation evidence only. Score and elapsed time never imply
  // progress (§16).
  if (conversationStage === 'negotiation') return 'proposal'
  if (conversationStage === 'proposal') return 'proposal'
  if (conversationStage === 'meeting') return 'meeting'

  if (lead.status === 'replied') return 'replied'
  if (lead.status === 'followed_up' || lead.status === 'contacted') {
    return lead.lastOutboundAt ? 'contacted' : 'new'
  }
  return 'new'
}

function deriveConversationState(input: DeriveLeadOperatingStateInput): ConversationState {
  const { lead, queueState, pipelineStage } = input
  if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'no' || lead.status === 'dead') {
    return 'no_active_conversation'
  }
  // The queue and pipeline stages are the same fact in two vocabularies; prefer
  // whichever the caller resolved.
  const state = queueState ?? pipelineStage
  if (state === 'waiting_on_rep' || state === 'needs_reply') return 'needs_reply'
  if (state === 'follow_up_due') return 'follow_up_due'
  if (state === 'waiting_on_prospect' || state === 'waiting' || state === 'to_contact') {
    return 'waiting_on_client'
  }
  if (lead.lastOutboundAt && !lead.lastInboundAt) return 'waiting_on_client'
  if (lead.lastInboundAt && lead.lastOutboundAt && lead.lastInboundAt > lead.lastOutboundAt) {
    return 'needs_reply'
  }
  return 'no_active_conversation'
}

function deriveExecutionState(input: DeriveLeadOperatingStateInput): ExecutionState {
  const { lead } = input
  if (lead.archived) return 'archived'
  // A lead with no channel identity cannot be executed: there is nothing to send
  // as. It stays visible and workable, but it is not "active" execution.
  if (!lead.revenueIdentityId) return 'needs_profile'
  return 'active'
}

function deriveNextAction(
  input: DeriveLeadOperatingStateInput,
  conversation: ConversationState,
  execution: ExecutionState,
): LeadNextAction {
  const { lead } = input
  if (execution === 'archived') return 'none'
  if (execution === 'needs_profile') return 'assign_profile'
  if (lead.status === 'won' || lead.status === 'lost' || lead.status === 'no' || lead.status === 'dead') {
    return 'none'
  }
  if (conversation === 'needs_reply') return 'reply'
  if (conversation === 'follow_up_due') return 'follow_up'
  if (conversation === 'waiting_on_client') {
    return lead.connectionAcceptedAt ? 'follow_up' : 'send_connection'
  }
  // No active conversation: the next move is the first outreach, or email when
  // no connection has been attempted.
  return lead.lastOutboundAt ? 'send_email' : 'send_connection'
}

export function deriveLeadOperatingState(input: DeriveLeadOperatingStateInput): LeadOperatingState {
  const salesStage = deriveSalesStage(input)
  const conversationState = deriveConversationState(input)
  const executionState = deriveExecutionState(input)
  const nextAction = deriveNextAction(input, conversationState, executionState)

  const attribution: LeadAttribution = {
    profileId: input.attribution?.profileId ?? input.lead.senderProfileId ?? null,
    profileName: input.attribution?.profileName ?? null,
    profileChannel: input.attribution?.profileChannel ?? null,
    identityId: input.attribution?.identityId ?? input.lead.revenueIdentityId ?? null,
    identityName: input.attribution?.identityName ?? null,
    identityChannel: input.attribution?.identityChannel ?? null,
  }

  const responsibility: LeadResponsibility = {
    primaryRepId: input.responsibility?.primaryRepId ?? null,
    primaryName: input.responsibility?.primaryName ?? null,
    operatorRepIds: input.responsibility?.operatorRepIds ?? [],
    operatorNames: input.responsibility?.operatorNames ?? [],
  }

  const needsProfile = !attribution.identityId || !attribution.profileId

  const working = responsibility.operatorNames.length > 0
    ? responsibility.operatorNames.join(' · ')
    : responsibility.primaryName ?? 'Unassigned'

  return {
    salesStage,
    conversationState,
    executionState,
    nextAction,
    nextActionLabel: NEXT_ACTION_LABEL[nextAction],
    attribution,
    responsibility,
    needsProfile,
    summary: `Stage: ${STAGE_LABEL[salesStage]} · ${CONVERSATION_LABEL[conversationState]} · ${EXECUTION_LABEL[executionState]}`,
    workingNow: working,
  }
}

export { STAGE_LABEL, CONVERSATION_LABEL, EXECUTION_LABEL }
