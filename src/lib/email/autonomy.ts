/**
 * Email autonomy — the three modes and what each permits.
 *
 * Autonomy is a property of the *action*, not of a sent message. A row in
 * `email_messages` records what happened; it never records what was permitted,
 * because permission is re-evaluated every time and depends on state that has
 * since changed (mailbox health, suppression, quota, terminal outcome).
 */
export const EMAIL_AUTONOMY_MODES = ['MANUAL', 'APPROVAL_REQUIRED', 'AUTOPILOT'] as const

export type EmailAutonomyMode = (typeof EMAIL_AUTONOMY_MODES)[number]

/**
 * Existing organizations default to APPROVAL_REQUIRED.
 *
 * MANUAL means Relay prepares and nothing more — no provider call is ever made.
 * AUTOPILOT is the only mode that may send without a human, and only inside the
 * closed safe-class set below.
 */
export const DEFAULT_EMAIL_AUTONOMY_MODE: EmailAutonomyMode = 'APPROVAL_REQUIRED'

/**
 * Reply classes an AUTOPILOT run may answer without a human.
 *
 * Deliberately closed. Pricing, scope, commitment, proposal, negotiation,
 * legal/security and custom estimates are absent because none of them can be
 * answered from verified evidence alone — every one of them can create an
 * obligation the sender never agreed to.
 */
export const AUTOPILOT_SAFE_REPLY_CLASSES = [
  'SCHEDULING',
  'ACKNOWLEDGEMENT',
  'FACTUAL_ANSWER',
] as const

export type AutopilotSafeReplyClass = (typeof AUTOPILOT_SAFE_REPLY_CLASSES)[number]

export function isEmailAutonomyMode(value: string | null | undefined): value is EmailAutonomyMode {
  return (EMAIL_AUTONOMY_MODES as readonly string[]).includes(value ?? '')
}

/** True when the mode permits a provider call with no human in the loop. */
export function modeMayAutosend(mode: EmailAutonomyMode | null | undefined): boolean {
  return mode === 'AUTOPILOT'
}

/** True when a reply class may be auto-sent under AUTOPILOT. */
export function isAutopilotSafeReplyClass(value: string | null | undefined): value is AutopilotSafeReplyClass {
  return (AUTOPILOT_SAFE_REPLY_CLASSES as readonly string[]).includes(value ?? '')
}
