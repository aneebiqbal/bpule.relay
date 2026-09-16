import type {
  RelayRun,
  RelayRunStatus,
  Lead,
  ConversationState,
} from '@/lib/domain/types'
import { canTransition, isTerminalStatus } from './outbound-run'

export interface ReconciliationResult {
  runId: string
  drifted: boolean
  previousStatus: RelayRunStatus
  correctedStatus: RelayRunStatus | null
  reason: string
  repaired: boolean
}

export interface ReconcileInput {
  run: RelayRun
  lead: Lead | null
  conversationState: ConversationState | null
}

/**
 * Reconciles a Relay Run against canonical domain state.
 *
 * Detects drift between the run's status and the actual state of the
 * domain objects it coordinates. Repairs only when canonical state
 * proves the correct state unambiguously.
 */
export function reconcileRelayRun(input: ReconcileInput): ReconciliationResult {
  const { run, lead, conversationState } = input

  // Terminal runs should not be reconciled — their state is final
  if (isTerminalStatus(run.status)) {
    return {
      runId: run.id,
      drifted: false,
      previousStatus: run.status,
      correctedStatus: null,
      reason: 'Run is in terminal state — no reconciliation needed.',
      repaired: false,
    }
  }

  if (!lead) {
    return {
      runId: run.id,
      drifted: true,
      previousStatus: run.status,
      correctedStatus: 'failed',
      reason: 'Lead no longer exists. Run cannot proceed.',
      repaired: false, // Caller decides whether to apply
    }
  }

  // Case 1: Run says WAITING but lead has been replied to
  if (run.status === 'waiting' && lead.status === 'replied') {
    return {
      runId: run.id,
      drifted: true,
      previousStatus: run.status,
      correctedStatus: 'response_received',
      reason: `Run status is WAITING but lead "${lead.company}" has status "replied". Canonical state proves a reply occurred.`,
      repaired: false,
    }
  }

  // Case 2: Run says WAITING but conversation state shows reply
  if (run.status === 'waiting' && conversationState?.lastReplyAt) {
    return {
      runId: run.id,
      drifted: true,
      previousStatus: run.status,
      correctedStatus: 'response_received',
      reason: `Run status is WAITING but conversation state shows last reply at ${conversationState.lastReplyAt}.`,
      repaired: false,
    }
  }

  // Case 3: Run says PREPARING but lead has been contacted
  if ((run.status === 'preparing' || run.status === 'routing') && lead.status !== 'new') {
    return {
      runId: run.id,
      drifted: true,
      previousStatus: run.status,
      correctedStatus: 'action_recorded',
      reason: `Run status is ${run.status} but lead "${lead.company}" has already been contacted (status: ${lead.status}).`,
      repaired: false,
    }
  }

  // Case 4: Run says AWAITING_HUMAN but outreach has been recorded
  if (run.status === 'awaiting_human' && lead.status !== 'new') {
    return {
      runId: run.id,
      drifted: true,
      previousStatus: run.status,
      correctedStatus: 'action_recorded',
      reason: `Run status is AWAITING_HUMAN but lead "${lead.company}" has been contacted (status: ${lead.status}). Outreach was recorded.`,
      repaired: false,
    }
  }

  // Case 5: Conversation is in advanced stage but run is still waiting
  if (
    run.status === 'waiting' &&
    conversationState &&
    ['replied', 'qualifying', 'interested', 'meeting', 'proposal', 'won', 'lost'].includes(conversationState.stage)
  ) {
    const corrected = conversationState.stage === 'replied' ? 'response_received' : 'conversation'
    return {
      runId: run.id,
      drifted: true,
      previousStatus: run.status,
      correctedStatus: corrected,
      reason: `Run status is WAITING but conversation stage is "${conversationState.stage}". Run should be in ${corrected.toUpperCase()} state.`,
      repaired: false,
    }
  }

  // No drift detected
  return {
    runId: run.id,
    drifted: false,
    previousStatus: run.status,
    correctedStatus: null,
    reason: 'Run status is consistent with canonical domain state.',
    repaired: false,
  }
}

/**
 * Checks if a proposed repair transition is valid.
 */
export function canRepairTo(
  currentStatus: RelayRunStatus,
  targetStatus: RelayRunStatus,
): boolean {
  return canTransition(currentStatus, targetStatus)
}

/**
 * Determines if reconciliation result requires human review.
 */
export function requiresHumanReview(result: ReconciliationResult): boolean {
  if (!result.drifted || !result.correctedStatus) return false
  return !canRepairTo(result.previousStatus, result.correctedStatus)
}
