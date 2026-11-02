/**
 * Canonical send truth (Phase 8). A send is an executed action event of one
 * of these types whose execution did not fail. Drafts (`*_PREPARED` other than
 * the proposal metric), generated copy, failed sends and UI events are never
 * sends. Reports, Targets, Team Performance, Admin Home profile rows, Rep Home
 * and personal /performance all count from these lists; the cross-surface
 * contract test (tests/send-truth-contract.test.ts) holds them together.
 */

export const CONNECTION_EVENTS = ['CONNECTION_SENT'] as const
export const SENT_MESSAGE_EVENTS = ['DM_SENT', 'FOLLOWUP_SENT', 'REPLY_SENT'] as const

export function isExecutedSend(actionType: string, executionStatus: string | null | undefined): boolean {
  if (executionStatus === 'failed') return false
  return (CONNECTION_EVENTS as readonly string[]).includes(actionType) || (SENT_MESSAGE_EVENTS as readonly string[]).includes(actionType)
}
