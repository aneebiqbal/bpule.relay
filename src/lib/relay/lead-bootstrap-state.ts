/**
 * Lead bootstrap state — the explicit lifecycle of the Create Lead → Lead
 * Detail → auto-draft sequence.
 *
 * The old shape had no state at all: a one-shot `?next=generate-…` URL param
 * was read inside an effect that also started async draft work. A refresh
 * during generation re-read the param and fired a second draft; a phase that
 * did not match left the param in the URL, so it survived every reload.
 *
 * The state machine makes the sequence explicit and idempotent:
 *  - the one-shot intent is consumed from the URL BEFORE any async work
 *  - generation only starts from PENDING
 *  - a refresh in any state re-enters deterministically instead of duplicating
 */

export type LeadBootstrapState = 'NOT_REQUESTED' | 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED'

export type LeadBootstrapEvent = 'REQUEST' | 'START' | 'SUCCEED' | 'FAIL'

const TRANSITIONS: Record<LeadBootstrapState, Partial<Record<LeadBootstrapEvent, LeadBootstrapState>>> = {
  NOT_REQUESTED: { REQUEST: 'PENDING' },
  PENDING: { START: 'RUNNING', FAIL: 'FAILED' },
  // DONE and FAILED are terminal for this intent: a new REQUEST is needed.
  RUNNING: { SUCCEED: 'DONE', FAIL: 'FAILED' },
  DONE: {},
  FAILED: { REQUEST: 'PENDING' },
}

export function transitionLeadBootstrap(
  state: LeadBootstrapState,
  event: LeadBootstrapEvent,
): LeadBootstrapState {
  return TRANSITIONS[state][event] ?? state
}

/** Only a PENDING intent may start generation. */
export function canStartBootstrap(state: LeadBootstrapState): boolean {
  return state === 'PENDING'
}

export interface BootstrapPreconditions {
  leadLoaded: boolean
  leadIdValid: boolean
  /** The canonical decision packet is available for this lead. */
  decisionAvailable: boolean
}

/**
 * The URL with the one-shot `next` param removed, or null when there is none.
 * Pure so the "consume before async work" rule is testable without a DOM.
 */
export function stripOneShotIntent(href: string): string | null {
  const url = new URL(href)
  if (!url.searchParams.has('next')) return null
  url.searchParams.delete('next')
  return url.toString()
}

/**
 * Draft generation requires the lead, a valid id and the canonical decision.
 * Without them the request is not a generation — it is a 404 waiting to happen.
 */
export function bootstrapPreconditionsMet(pre: BootstrapPreconditions): boolean {
  return pre.leadLoaded && pre.leadIdValid && pre.decisionAvailable
}
