/**
 * Contract violation telemetry (Phase 14 / 20).
 *
 * When the product reaches a state a contract forbids, it is recorded — never
 * silently auto-fixed. A divergent state is a defect; the fix belongs in the
 * canonical owner, not in a compensating write.
 *
 * Every event carries: contractId, organizationId, leadId, requestId, surface,
 * violationCode. Ids only — no raw source text or client messages.
 */
import { getTraceContext } from '@/lib/observability/trace-context'

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

export interface ContractViolation {
  kind: ContractViolationKind
  leadId: string | null
  /** The contract this violates, when known. */
  contractId?: number | null
  /** Which surface produced the state (e.g. 'today', 'lead_detail', 'prospect'). */
  surface?: string | null
  organizationId?: string | null
  requestId?: string | null
  /** The fields that disagree, so the violation is greppable. */
  fields: string[]
  detail: string
}

/**
 * Emit a structured violation record. Deliberately side-effect-only: it does not
 * correct the state, because a silent correction hides the defect.
 */
export function recordContractViolation(violation: ContractViolation): void {
  const ctx = getTraceContext()
  const requestId = violation.requestId ?? ctx?.requestId ?? null
  const organizationId = violation.organizationId ?? ctx?.organizationId ?? null
  console.warn(
    `[relay-contract-violation] kind=${violation.kind} contract=${violation.contractId ?? 'unknown'} ` +
      `org=${organizationId ?? 'unknown'} lead=${violation.leadId ?? 'unknown'} ` +
      `req=${requestId ?? 'unknown'} surface=${violation.surface ?? 'unknown'} ` +
      `fields=${violation.fields.join(',') || 'none'} ${violation.detail}`,
  )
}

/** Record every divergence a parity report found. */
export function recordParityViolations(leadId: string, divergences: readonly string[]): void {
  for (const divergence of divergences) {
    const kind: ContractViolationKind = /\bscore\b/i.test(divergence)
      ? 'SCORE_DISAGREEMENT'
      : /\bpresence\b/i.test(divergence)
        ? 'THREAD_DISAGREEMENT'
        : 'ACTION_DISAGREEMENT'
    recordContractViolation({
      kind,
      leadId,
      contractId: 3,
      surface: 'lead_parity',
      fields: [divergence],
      detail: divergence,
    })
  }
}

/** Record explanation contradictions found on a surface. */
export function recordExplanationViolations(
  leadId: string | null,
  surface: string,
  contradictions: ReadonlyArray<{ code: string; message: string }>,
): void {
  for (const c of contradictions) {
    recordContractViolation({
      kind: c.code as ContractViolationKind,
      leadId,
      contractId: 4,
      surface,
      fields: [c.code],
      detail: c.message,
    })
  }
}
