import type {
  RelayRunStatus,
  RelayEvent,
  ExecutionPolicy,
} from '@/lib/domain/types'

/**
 * OUTBOUND Relay Run State Machine
 *
 * Deterministic transitions. No LLM decides state.
 * Each status has an explicitly allowed set of next statuses.
 */

export const OUTBOUND_TRANSITIONS: Record<RelayRunStatus, RelayRunStatus[]> = {
  detected: ['qualifying', 'rejected', 'cancelled'],
  qualifying: ['qualified', 'rejected', 'cancelled'],
  qualified: ['routing', 'preparing', 'cancelled'],
  routing: ['preparing', 'cancelled'],
  preparing: ['awaiting_human', 'cancelled'],
  awaiting_human: ['action_recorded', 'cancelled'],
  action_recorded: ['waiting', 'cancelled'],
  waiting: ['followup_due', 'response_received', 'conversation', 'cancelled'],
  followup_due: ['followup_preparing', 'cancelled'],
  followup_preparing: ['awaiting_human', 'cancelled'],
  response_received: ['conversation', 'cancelled'],
  conversation: ['completed', 'cancelled'],
  rejected: [],
  completed: [],
  failed: [],
  cancelled: [],
}

export function canTransition(from: RelayRunStatus, to: RelayRunStatus): boolean {
  return OUTBOUND_TRANSITIONS[from]?.includes(to) ?? false
}

export function isValidStatus(status: string): status is RelayRunStatus {
  return status in OUTBOUND_TRANSITIONS
}

/**
 * Maps an event type to the run status it should trigger.
 * Returns null if the event doesn't trigger a transition.
 */
export function eventToRunStatus(
  eventType: RelayEvent['eventType'],
  currentStatus: RelayRunStatus,
): RelayRunStatus | null {
  switch (eventType) {
    case 'LEAD_CREATED':
      return currentStatus === 'detected' ? 'qualifying' : null

    case 'LEAD_QUALIFIED':
      return currentStatus === 'qualifying' ? 'qualified' : null

    case 'OUTREACH_PREPARED':
      return currentStatus === 'preparing' ? 'awaiting_human' : null

    case 'OUTREACH_RECORDED':
      return currentStatus === 'awaiting_human' ? 'action_recorded' : null

    case 'RUN_STARTED':
      return currentStatus === 'detected' ? 'qualifying' : null

    case 'FOLLOWUP_DUE':
      return currentStatus === 'waiting' ? 'followup_due' : null

    case 'FOLLOWUP_PREPARED':
      return currentStatus === 'followup_due' ? 'followup_preparing' : null

    case 'FOLLOWUP_RECORDED':
      return currentStatus === 'followup_preparing' ? 'action_recorded' : null

    case 'CLIENT_REPLIED':
      return currentStatus === 'waiting' ? 'response_received' : null

    case 'REPLY_PREPARED':
      return currentStatus === 'response_received' ? 'awaiting_human' : null

    case 'CONVERSATION_ADVANCED':
      if (currentStatus === 'response_received') return 'conversation'
      if (currentStatus === 'conversation') return 'conversation'
      return null

    case 'OUTCOME_RECORDED':
      return currentStatus === 'conversation' ? 'completed' : null

    case 'RUN_COMPLETED':
      return currentStatus !== 'completed' ? 'completed' : null

    case 'RUN_FAILED':
      return currentStatus !== 'failed' ? 'failed' : null

    default:
      return null
  }
}

/**
 * Determines the execution policy for a given action type.
 * This formalizes Relay's existing safety behavior.
 */
export function getExecutionPolicy(actionType: string): ExecutionPolicy {
  const policies: Record<string, ExecutionPolicy> = {
    // AUTO — Relay can do these without human involvement
    'extract_prospect': 'AUTO',
    'qualify': 'AUTO',
    'score': 'AUTO',
    'match_identity': 'AUTO',
    'match_proof': 'AUTO',
    'generate_draft': 'AUTO',
    'research_company': 'AUTO',
    'detect_intent': 'AUTO',
    'prepare_followup': 'AUTO',
    'prepare_outreach': 'AUTO',

    // REVIEW_REQUIRED — Relay prepares, human approves before external action
    'send_outreach': 'REVIEW_REQUIRED',
    'send_followup': 'REVIEW_REQUIRED',
    'send_reply': 'REVIEW_REQUIRED',
    'submit_application': 'REVIEW_REQUIRED',
    'send_connection': 'REVIEW_REQUIRED',

    // MANUAL — Human must perform these
    'change_pricing': 'MANUAL',
    'commit_contract': 'MANUAL',
    'promise_delivery_date': 'MANUAL',
    'negotiate_terms': 'MANUAL',

    // PROHIBITED — Relay must never do these
    'use_forbidden_claim': 'PROHIBITED',
    'auto_send': 'PROHIBITED',
    'impersonate_rep': 'PROHIBITED',
  }

  return policies[actionType] ?? 'REVIEW_REQUIRED'
}

/**
 * Determines if a run is in a terminal state.
 */
export function isTerminalStatus(status: RelayRunStatus): boolean {
  return ['completed', 'failed', 'cancelled', 'rejected'].includes(status)
}

/**
 * Determines if a run is actively waiting for something.
 */
export function isWaitingStatus(status: RelayRunStatus): boolean {
  return ['waiting', 'awaiting_human', 'followup_due'].includes(status)
}
