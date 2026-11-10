/**
 * Acknowledgement escalation policy — the ONE place durations live.
 *
 * Stages are DERIVED from `assigned_at` and the current time, never stored, so
 * a rep's banner is correct on any read without a scheduler. Notifications are
 * emitted lazily by `src/lib/responsibility/notify` when a surface that shows
 * the responsibility is read, deduped per stage.
 */

export const ACK_ESCALATION = {
  /** Persistent Rep warning from this age. */
  reminderMinutes: 60,
  /** Admin attention item from this age. */
  adminAttentionMinutes: 120,
  /** Urgent admin attention from this age. */
  urgentMinutes: 240,
} as const

export type AcknowledgementStage =
  | 'NEW'
  | 'REMIND'
  | 'ADMIN_ATTENTION'
  | 'URGENT'
  | 'ACKNOWLEDGED'

export function acknowledgementStage(
  assignedAt: string,
  now: string,
  acknowledgedAt: string | null = null,
): AcknowledgementStage {
  if (acknowledgedAt) return 'ACKNOWLEDGED'
  const elapsedMinutes = (new Date(now).getTime() - new Date(assignedAt).getTime()) / 60_000
  if (elapsedMinutes >= ACK_ESCALATION.urgentMinutes) return 'URGENT'
  if (elapsedMinutes >= ACK_ESCALATION.adminAttentionMinutes) return 'ADMIN_ATTENTION'
  if (elapsedMinutes >= ACK_ESCALATION.reminderMinutes) return 'REMIND'
  return 'NEW'
}

/** The stage whose notification is due, or null when nothing should fire. */
export function dueNotificationStage(
  assignedAt: string,
  now: string,
  acknowledgedAt: string | null = null,
): AcknowledgementStage | null {
  const stage = acknowledgementStage(assignedAt, now, acknowledgedAt)
  return stage === 'ACKNOWLEDGED' ? null : stage
}

/** Stable key for one acknowledgement stage, used for notification dedupe. */
export function acknowledgementDedupeKey(
  sourceRowId: string,
  stage: AcknowledgementStage,
  recipientId: string,
): string {
  return `responsibility_ack:${sourceRowId}:${stage}:${recipientId}`
}

export function elapsedMinutes(assignedAt: string, now: string): number {
  return Math.max(0, Math.floor((new Date(now).getTime() - new Date(assignedAt).getTime()) / 60_000))
}
