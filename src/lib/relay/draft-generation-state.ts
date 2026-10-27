/**
 * Draft generation state — one explicit lifecycle for outreach generation.
 *
 * The old shape was ambiguous: an empty `draftText` plus a `draftFailed` flag
 * could not distinguish "never asked" from "asked and refused by policy" from
 * "asked and failed". A SKIP lead whose Generate click silently produced
 * nothing read as a bug in the generator rather than a policy decision.
 *
 * The state is the single source of truth for what the UI shows, so a policy
 * skip is never a silent empty result.
 */

export type DraftGenerationState =
  | 'NOT_REQUESTED'
  | 'GENERATING'
  | 'GENERATED'
  | 'SKIPPED_BY_POLICY'
  | 'NEEDS_RESCORING'
  | 'FAILED'

/** Shown when policy refuses outreach. Exact wording is part of the contract. */
export const SKIP_POLICY_MESSAGE =
  'Outreach is disabled because Relay does not recommend contacting this lead.'

export interface DraftGenerationInput {
  /** The lead's canonical verdict. A `skip` verdict refuses outreach. */
  verdict: string | null | undefined
  generating: boolean
  draftText: string
  /** The server could not derive a strategy and asked for rescoring. */
  needsRescoring: boolean
  /** Generation was attempted and did not produce a draft. */
  failed: boolean
}

/**
 * Resolve the draft state. Policy is checked before the outcome so a SKIP lead
 * is never reported as a generator failure.
 */
export function resolveDraftGenerationState(input: DraftGenerationInput): DraftGenerationState {
  if (input.verdict === 'skip') return 'SKIPPED_BY_POLICY'
  if (input.generating) return 'GENERATING'
  if (input.draftText.trim()) return 'GENERATED'
  if (input.needsRescoring) return 'NEEDS_RESCORING'
  if (input.failed) return 'FAILED'
  return 'NOT_REQUESTED'
}

/** Whether the Generate control is offered at all. */
export function canGenerateDraft(state: DraftGenerationState): boolean {
  return state !== 'SKIPPED_BY_POLICY'
}

/** Whether the state must be surfaced to the rep rather than left silent. */
export function draftStateMessage(state: DraftGenerationState): string | null {
  switch (state) {
    case 'SKIPPED_BY_POLICY':
      return SKIP_POLICY_MESSAGE
    case 'NEEDS_RESCORING':
      return 'This lead needs rescoring before a message can be written.'
    case 'FAILED':
      return 'Generation failed. Retry.'
    default:
      return null
  }
}
