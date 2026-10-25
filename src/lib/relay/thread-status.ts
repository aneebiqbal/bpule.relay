/**
 * Thread state for a lead, derived from the messages themselves — never
 * assumed. A lead with no messages has NO_THREAD (not VERIFIED): there is
 * nothing to verify.
 */

export type ThreadStatus = 'NO_THREAD' | 'UNVERIFIED' | 'VERIFIED' | 'DISMISSED'

export function deriveThreadStatus(
  messages: ReadonlyArray<{ direction?: string | null; thread_status?: string | null }>,
): ThreadStatus {
  if (messages.length === 0) return 'NO_THREAD'
  if (messages.some((m) => m.thread_status === 'DISMISSED')) return 'DISMISSED'
  if (messages.some((m) => m.direction === 'inbound' && m.thread_status === 'UNVERIFIED')) return 'UNVERIFIED'
  return 'VERIFIED'
}
