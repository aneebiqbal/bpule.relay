/**
 * Prospect draft persistence.
 *
 * The Prospect check is one-shot: analyze → review → Create lead. The draft
 * exists only so a refresh or an accidental navigation does not lose work in
 * progress. It must NOT survive a successful save, or returning to Prospect
 * resurrects a completed analysis with a live "Create lead" button (BUG-23).
 *
 * Extracted so the rules are unit-testable without a DOM.
 */

export const PROSPECT_DRAFT_KEY = 'relay.prospect.draft.v1'

export interface ProspectDraft {
  rawInput?: string
  result?: unknown
}

/** Parse a stored draft. Corrupt or unavailable storage yields null, never a throw. */
export function readProspectDraft(raw: string | null | undefined): ProspectDraft | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ProspectDraft> | null
    if (!parsed || typeof parsed !== 'object') return null
    return {
      rawInput: typeof parsed.rawInput === 'string' ? parsed.rawInput : undefined,
      result: parsed.result ?? undefined,
    }
  } catch {
    return null
  }
}

export function serializeProspectDraft(draft: ProspectDraft): string {
  return JSON.stringify({ rawInput: draft.rawInput ?? '', result: draft.result ?? null })
}

/**
 * Whether a draft is worth writing.
 *
 * An empty draft is not: writing `{rawInput:'', result:null}` would recreate the
 * key a `removeItem` just cleared after a successful save, and a restored empty
 * draft restores nothing anyway.
 */
export function isProspectDraftWorthSaving(draft: ProspectDraft): boolean {
  return Boolean(draft.rawInput?.trim()) || draft.result != null
}
