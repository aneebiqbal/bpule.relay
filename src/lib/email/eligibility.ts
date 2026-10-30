/**
 * The one email eligibility gate.
 *
 * Every surface that can cause an email to be sent — the send route, the
 * approval queue, the follow-up job, the autopilot path — evaluates this one
 * object. There is deliberately no second definition of "may we send", because
 * two definitions is how a mailbox ends up sending to an opted-out lead.
 *
 * The function is pure: it takes facts, it returns a decision, it touches
 * nothing. Time is passed in as an already-evaluated window so this module never
 * becomes a second timezone system — the organization operating policy remains
 * the sole time authority.
 */
import type { EmailAutonomyMode } from './autonomy'
import { modeMayAutosend } from './autonomy'
import type { MailboxHealth } from './mailbox-health'
import { mailboxHealthBlocker } from './mailbox-health'

/** Stable blocker key per health state — snake_case, independent of enum casing. */
function mailboxBlockerFor(health: MailboxHealth): string {
  return `mailbox_${(mailboxHealthBlocker(health) ?? 'unknown').replace('mailbox_', '')}`
}

export type EmailSendAction = 'SEND' | 'APPROVAL_REQUIRED' | 'PREPARE_ONLY' | 'BLOCK'

export interface EmailSendDecision {
  eligible: boolean
  /** First blocker, or a human sentence when the send is clear. */
  reason: string
  sender: string | null
  recipient: string | null
  action: EmailSendAction
  scheduledAt: string | null
  requiresApproval: boolean
  blockers: string[]
}

export interface EmailEligibilityInput {
  /** The opportunity must be a real, workable lead. */
  hasOpportunity: boolean
  /** The sender identity must be assigned to the acting rep. */
  senderIdentityAuthorized: boolean
  senderIdentityId: string | null
  /** Derived from `deriveMailboxHealth` — never the free-text status. */
  mailboxHealth: MailboxHealth | null
  /** A verified recipient address must exist (`isSendEligibleContact`). */
  recipientEmail: string | null
  recipientContactVerified: boolean
  /** `email_suppressions` has no active row for this address. */
  notSuppressed: boolean
  /** Not opted out and not terminal (`isTerminalOutcome` / `isTerminalLeadStatus`). */
  notOptedOut: boolean
  notTerminal: boolean
  /** Not already contacted for this opportunity without a reply. */
  notDuplicateContact: boolean
  /** The client has not left an unanswered inbound reply. */
  noUnansweredInboundReply: boolean
  /** Evaluated by the caller against the organization operating policy. */
  withinSendWindow: boolean
  /** Quota for this mailbox today. */
  dailyQuotaAvailable: boolean
  /** `validateEmailClaims` / `decideMessageQuality` passed. */
  messageQualityPassed: boolean
  /** No unsupported or fabricated claim survived the quality gate. */
  claimsSafe: boolean
  /** The canonical follow-up policy allows another action. */
  followUpAllowed: boolean
  autonomyMode: EmailAutonomyMode | null
  now?: Date
}

/** Build a decision. Exported for the surfaces that must construct one directly. */
export function makeDecision(
  input: EmailEligibilityInput,
  blockers: string[],
  reason: string,
): EmailSendDecision {
  const requiresApproval = input.autonomyMode === 'APPROVAL_REQUIRED'
  const action: EmailSendAction = blockers.length > 0
    ? 'BLOCK'
    : input.autonomyMode === 'MANUAL'
      ? 'PREPARE_ONLY'
      : modeMayAutosend(input.autonomyMode) && !requiresApproval
        ? 'SEND'
        : 'APPROVAL_REQUIRED'

  return {
    eligible: blockers.length === 0,
    reason,
    sender: input.senderIdentityId,
    recipient: input.recipientEmail,
    action,
    scheduledAt: action === 'BLOCK' ? null : (input.now?.toISOString() ?? null),
    requiresApproval: action === 'APPROVAL_REQUIRED',
    blockers,
  }
}

/**
 * Evaluate every §7 condition and return the canonical decision.
 *
 * All blockers are collected rather than short-circuited: a rep reading the
 * approval queue needs to see every reason a send is held, not just the first.
 */
export function evaluateEmailSendEligibility(input: EmailEligibilityInput): EmailSendDecision {
  const blockers: string[] = []

  if (!input.hasOpportunity) blockers.push('no_opportunity')
  if (!input.senderIdentityAuthorized) blockers.push('sender_identity_unauthorized')
  if (!input.recipientEmail) blockers.push('recipient_email_missing')
  else if (!input.recipientContactVerified) blockers.push('recipient_not_verified')
  if (!input.notSuppressed) blockers.push('suppressed')
  if (!input.notOptedOut) blockers.push('opted_out')
  if (!input.notTerminal) blockers.push('terminal_state')
  if (!input.notDuplicateContact) blockers.push('duplicate_contact')
  if (!input.noUnansweredInboundReply) blockers.push('unanswered_inbound_reply')
  if (!input.withinSendWindow) blockers.push('outside_send_window')
  if (!input.dailyQuotaAvailable) blockers.push('daily_quota_exhausted')
  if (!input.messageQualityPassed) blockers.push('message_quality_failed')
  if (!input.claimsSafe) blockers.push('unsafe_claims')
  if (!input.followUpAllowed) blockers.push('follow_up_not_allowed')

  // Mailbox health is checked last but is never optional: a mailbox that is not
  // CONNECTED blocks even when every other condition passes. The blocker key is
  // a fixed mapping so it never depends on the enum's casing.
  const healthBlocker = input.mailboxHealth ? mailboxBlockerFor(input.mailboxHealth) : 'mailbox_unknown'
  if (!input.mailboxHealth || input.mailboxHealth !== 'CONNECTED') blockers.push(healthBlocker)

  if (blockers.length > 0) {
    return makeDecision(input, blockers, blockers[0])
  }

  if (input.autonomyMode === 'MANUAL') {
    return makeDecision(input, [], 'manual_mode_prepare_only')
  }

  return makeDecision(input, [], 'eligible')
}
