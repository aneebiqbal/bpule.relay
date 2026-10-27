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
import type { ContractViolationKind } from './violation-kinds'

export type { ContractViolationKind }

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

// ── Phase 36 emitters ────────────────────────────────────────────────────────

/**
 * The score shown to the rep is not the score that was persisted. The decision
 * the user reviewed must be the decision saved (Contract 10).
 */
export function recordAnalysisScoreDrift(params: {
  leadId: string | null
  reviewedScore: number
  persistedScore: number
  surface?: string
}): void {
  recordContractViolation({
    kind: 'ANALYSIS_SCORE_DRIFT',
    leadId: params.leadId,
    contractId: 10,
    surface: params.surface ?? 'save',
    fields: ['canonicalScore'],
    detail: `reviewed ${params.reviewedScore} but persisted ${params.persistedScore}`,
  })
}

/** The lead-level opening fallback rendered although a canonical row existed. */
export function recordDuplicateOpeningMessage(leadId: string): void {
  recordContractViolation({
    kind: 'DUPLICATE_OPENING_MESSAGE',
    leadId,
    contractId: 11,
    surface: 'conversation',
    fields: ['inboundMessage'],
    detail: 'the lead-level opening rendered while a canonical message row already represented it',
  })
}

/** A recruiter flag was paired with a candidate relationship. */
export function recordCandidateRecruiterConflict(leadId: string): void {
  recordContractViolation({
    kind: 'CANDIDATE_WITH_RECRUITER_FLAG',
    leadId,
    contractId: 13,
    surface: 'intelligence',
    fields: ['relationshipRole'],
    detail: 'a recruiter flag was paired with the candidate relationship',
  })
}
