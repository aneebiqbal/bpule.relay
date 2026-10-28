/**
 * Contract violation kinds — client-safe.
 *
 * This module must stay free of server-only imports (`node:async_hooks`,
 * `node:crypto`): UI guards import it from client components, and a server-only
 * import in a client chunk breaks the build.
 *
 * `contract-violations.ts` re-uses the kind union and adds the request trace
 * for server callers. UI guards use `logClientViolation`, where there is no
 * request scope and the ids come from the caller.
 */

export type ContractViolationKind =
  | 'SCORE_DISAGREEMENT'
  | 'ACTION_DISAGREEMENT'
  | 'THREAD_DISAGREEMENT'
  | 'TERMINAL_OUTREACH'
  | 'SKIP_WITH_SEND_ACTION'
  | 'NO_THREAD_WITH_INBOUND'
  | 'NO_THREAD_BUT_CLAIMS_REPLY'
  | 'VERIFIED_BUYER_UNKNOWN_INTENT'
  | 'VERIFIED_BUYER_BUT_DENIED_REQUEST'
  | 'TERMINAL_BUT_CONTACTABLE'
  | 'ACCESS_BUT_DENIES_ROUTE'
  | 'TIMING_BUT_DENIES_TIMING'
  | 'LOW_FIT_BUT_CLAIMS_STRONG_FIT'
  | 'FOLLOWUP_ON_TERMINAL'
  | 'UNKNOWN_RENDERED_AS_ZERO'
  // The states the newer contracts forbid.
  | 'RAW_STATE_SHOWS_SCORE'
  | 'ANALYSIS_SCORE_DRIFT'
  | 'CANDIDATE_WITH_RECRUITER_FLAG'
  | 'DUPLICATE_OPENING_MESSAGE'
  | 'SKIP_WITH_GENERATED_DRAFT'
  | 'UNSUPPORTED_AUTH_CAPABILITY'

/**
 * Log a contract violation from a UI guard. Deliberately side-effect-only: it
 * does not correct the state, because a silent correction hides the defect.
 */
export function logClientViolation(
  kind: ContractViolationKind,
  detail: string,
  fields: readonly string[] = [],
  surface = 'client',
): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[relay-contract-violation] kind=${kind} surface=${surface} ` +
      `fields=${fields.join(',') || 'none'} ${detail}`,
  )
}
