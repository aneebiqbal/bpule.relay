/**
 * Mailbox health — one derivation, every surface reads it.
 *
 * Before Relay sends anything it must know whether the mailbox it is about to
 * send from is actually usable. A free-text `status` column cannot answer that:
 * it cannot distinguish "connected but over quota" from "never connected", and
 * it cannot tell a surface to stop sending.
 *
 * The derivation is pure so a mailbox row, a scheduler cycle and the admin
 * health panel agree without sharing mutable state.
 */
export const MAILBOX_HEALTH_STATES = [
  'CONNECTED',
  'REAUTH_REQUIRED',
  'DISCONNECTED',
  'DEGRADED',
  'PAUSED',
] as const

export type MailboxHealth = (typeof MAILBOX_HEALTH_STATES)[number]

/** Sending is permitted only in CONNECTED. Everything else is a stop. */
export function canSendFromHealth(health: MailboxHealth | null | undefined): boolean {
  return health === 'CONNECTED'
}

export interface MailboxHealthInput {
  /** Provider id, e.g. `gmail`. A `relay_noop` mailbox can never be CONNECTED. */
  provider: string | null
  /** Stored status, if the deployment still carries the free-text column. */
  status: string | null
  /** True when a token exists and has not expired. */
  hasUsableToken: boolean
  /** Consecutive provider failures since the last success. */
  consecutiveFailures: number
  /** Sends today against the daily cap. */
  sentToday: number
  dailySendCap: number | null
  /** True when the organization or an admin paused this mailbox. */
  paused: boolean
}

/** Failure count at which a mailbox is DEGRADED rather than CONNECTED. */
export const MAILBOX_DEGRADED_AFTER_FAILURES = 3

export function deriveMailboxHealth(input: MailboxHealthInput): MailboxHealth {
  if (input.paused) return 'PAUSED'
  if (input.provider === 'relay_noop') return 'DISCONNECTED'
  if (!input.hasUsableToken) return input.status === 'CONNECTED' ? 'REAUTH_REQUIRED' : 'DISCONNECTED'
  if (input.consecutiveFailures >= MAILBOX_DEGRADED_AFTER_FAILURES) return 'DEGRADED'
  if (input.dailySendCap !== null && input.sentToday >= input.dailySendCap) return 'DEGRADED'
  return 'CONNECTED'
}

/** Why a mailbox is not sendable — surfaced in admin health, never guessed. */
export function mailboxHealthBlocker(health: MailboxHealth): string | null {
  switch (health) {
    case 'CONNECTED':
      return null
    case 'REAUTH_REQUIRED':
      return 'mailbox_reauth_required'
    case 'DISCONNECTED':
      return 'mailbox_disconnected'
    case 'DEGRADED':
      return 'mailbox_degraded'
    case 'PAUSED':
      return 'mailbox_paused'
  }
}
