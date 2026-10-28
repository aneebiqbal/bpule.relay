/**
 * Explanation consistency (Phase 1/2).
 *
 * The decision and the explanation must agree. A verified buyer request cannot
 * coexist with "no clear need signal"; a terminal lead cannot be described as
 * contactable; a thread with messages cannot be described as having none.
 *
 * The decision is the authority. When an explanation line contradicts it, the
 * line is removed from user-facing output and the contradiction is recorded.
 */

export type ExplanationSurface =
  | 'rationale'
  | 'watchOut'
  | 'missingEvidence'
  | 'strongestEvidence'
  | 'salesThesis'
  | 'nextStep'

export interface ExplanationContext {
  verifiedBuyerRequest: boolean
  buyerIntentLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
  /** Terminal = opted out, won, lost, dead. */
  terminal: boolean
  /** True when the lead has at least one conversation turn. */
  hasThread: boolean
  /** 'DIRECT' | 'CONNECTION' | 'INDIRECT' | 'NONE' when known. */
  accessLevel?: string | null
  /** 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' when known. */
  fit?: string | null
  /** Current timing evidence exists. */
  hasCurrentTiming?: boolean
}

export interface ExplanationContradiction {
  code: string
  severity: 'blocker' | 'warning'
  surface: ExplanationSurface
  message: string
}

/** Phrases that deny a need/request the decision says exists. */
const DENIES_REQUEST: readonly RegExp[] = [
  /no verified buyer request/i,
  /no clear need signal/i,
  /have not asked for help/i,
  /no explicit buyer request/i,
  /no request for outside help/i,
  /no buyer request/i,
  /no current (buyer )?need/i,
]

/** Phrases that offer contact to a terminal lead. */
const OFFERS_CONTACT: readonly RegExp[] = [
  /reach out to connect/i,
  /send a (short )?connection note/i,
  /contact now/i,
  /follow up/i,
  /reply to/i,
]

/** Phrases that claim a thread exists when it does not. */
const CLAIMS_THREAD: readonly RegExp[] = [/they replied/i, /waiting on client/i, /needs reply/i, /client replied/i]

/** Phrases that deny a thread when one exists. */
const DENIES_THREAD: readonly RegExp[] = [/no messages/i, /no conversation/i, /no thread/i]

/** Phrases that deny contact when access is DIRECT/CONNECTION. */
const DENIES_ACCESS: readonly RegExp[] = [/no (clear )?route to contact/i, /no way to contact/i, /cannot (be )?contact/i]

/** Phrases that deny current timing when timing evidence exists. */
const DENIES_TIMING: readonly RegExp[] = [/no buyer timing/i, /no current timing/i, /timing (is )?unknown/i]

/** Phrases that claim strong fit when fit is LOW. */
const CLAIMS_STRONG_FIT: readonly RegExp[] = [/strong fit/i, /high fit/i]

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(text))
}

/**
 * Detect every contradiction between the canonical decision and one explanation
 * line. Returns an empty array when the line is consistent.
 */
export function detectExplanationContradictions(
  ctx: ExplanationContext,
  surface: ExplanationSurface,
  text: string,
): ExplanationContradiction[] {
  if (!text || !text.trim()) return []
  const out: ExplanationContradiction[] = []
  const push = (code: string, severity: 'blocker' | 'warning', message: string) =>
    out.push({ code, severity, surface, message })

  if (ctx.verifiedBuyerRequest && matchesAny(text, DENIES_REQUEST)) {
    push(
      'VERIFIED_BUYER_BUT_DENIED_REQUEST',
      'blocker',
      `"${text}" denies a buyer request that is verified in the source.`,
    )
  }

  if (ctx.terminal && matchesAny(text, OFFERS_CONTACT)) {
    push('TERMINAL_BUT_CONTACTABLE', 'blocker', `"${text}" offers contact to a terminal lead.`)
  }

  if (!ctx.hasThread && matchesAny(text, CLAIMS_THREAD)) {
    push('NO_THREAD_BUT_CLAIMS_REPLY', 'blocker', `"${text}" claims a conversation that does not exist.`)
  }

  if (ctx.hasThread && matchesAny(text, DENIES_THREAD)) {
    push('THREAD_BUT_DENIES_CONVERSATION', 'warning', `"${text}" denies a conversation that exists.`)
  }

  if ((ctx.accessLevel === 'DIRECT' || ctx.accessLevel === 'CONNECTION') && matchesAny(text, DENIES_ACCESS)) {
    push('ACCESS_BUT_DENIES_ROUTE', 'warning', `"${text}" denies a contact route that exists.`)
  }

  if (ctx.hasCurrentTiming && matchesAny(text, DENIES_TIMING)) {
    push('TIMING_BUT_DENIES_TIMING', 'warning', `"${text}" denies current timing that exists.`)
  }

  if (ctx.fit === 'LOW' && matchesAny(text, CLAIMS_STRONG_FIT)) {
    push('LOW_FIT_BUT_CLAIMS_STRONG_FIT', 'warning', `"${text}" claims strong fit while fit is LOW.`)
  }

  return out
}

/**
 * Remove explanation lines that contradict the decision. This is the only
 * user-facing filter: it never changes the decision, only the text that would
 * misdescribe it.
 */
export function filterContradictoryExplanation<T extends string>(
  items: readonly T[],
  ctx: ExplanationContext,
  surface: ExplanationSurface,
): { kept: T[]; removed: ExplanationContradiction[] } {
  const kept: T[] = []
  const removed: ExplanationContradiction[] = []
  for (const item of items) {
    const contradictions = detectExplanationContradictions(ctx, surface, item)
    if (contradictions.length > 0) removed.push(...contradictions)
    else kept.push(item)
  }
  return { kept, removed }
}
