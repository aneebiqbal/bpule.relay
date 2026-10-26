/**
 * Contract violation telemetry (Phase 14).
 *
 * When the product reaches a state a contract forbids, it is recorded — never
 * silently auto-fixed. A divergent state is a defect; the fix belongs in the
 * canonical owner, not in a compensating write.
 */

export type ContractViolationKind =
  | 'SCORE_DISAGREEMENT'
  | 'ACTION_DISAGREEMENT'
  | 'THREAD_DISAGREEMENT'
  | 'TERMINAL_OUTREACH'
  | 'SKIP_WITH_OUTREACH'
  | 'NO_THREAD_WITH_INBOUND'
  | 'VERIFIED_BUYER_UNKNOWN_INTENT'
  | 'UNKNOWN_RENDERED_AS_ZERO'

export interface ContractViolation {
  kind: ContractViolationKind
  leadId: string | null
  /** The fields that disagree, so the violation is greppable. */
  fields: string[]
  detail: string
}

/**
 * Emit a structured violation record. Deliberately side-effect-only: it does not
 * correct the state, because a silent correction hides the defect.
 */
export function recordContractViolation(violation: ContractViolation): void {
  console.warn(
    `[relay-contract-violation] kind=${violation.kind} lead=${violation.leadId ?? 'unknown'} ` +
      `fields=${violation.fields.join(',') || 'none'} ${violation.detail}`,
  )
}

/** Record every divergence a parity report found. */
export function recordParityViolations(leadId: string, divergences: readonly string[]): void {
  for (const divergence of divergences) {
    const kind: ContractViolationKind = /\bscore\b/i.test(divergence)
      ? 'SCORE_DISAGREEMENT'
      : /\baction\b/i.test(divergence)
        ? 'ACTION_DISAGREEMENT'
        : /\bpresence\b/i.test(divergence)
          ? 'THREAD_DISAGREEMENT'
          : 'ACTION_DISAGREEMENT'
    recordContractViolation({ kind, leadId, fields: [divergence], detail: divergence })
  }
}
