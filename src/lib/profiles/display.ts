/**
 * Pure display helpers for profiles. No I/O — safe to import from client
 * components (unlike the canonical read model, which touches the database).
 */

/** A profile whose display name is missing or clearly a placeholder. */
export function profileNeedsReview(name: string | null | undefined): boolean {
  const value = (name ?? '').trim()
  if (value.length === 0) return true
  return /^(unnamed(?:\s+profile)?|unknown|test(?:ing)?|profile)$/i.test(value)
}

/**
 * Normalize an external URL for display. A stored `www.linkedin.com/...` must
 * render as `https://www.linkedin.com/...`; the browser otherwise resolves it
 * against the app origin and produces `/www.linkedin.com/...`.
 */
export function normalizeExternalUrl(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^www\./i.test(raw)) return `https://${raw}`
  if (/^[\w-]+(\.[\w-]+)+(?:[/:?#].*)?$/i.test(raw)) return `https://${raw}`
  return raw
}

/** `remaining = max(expected - completed, 0)` — the one completion invariant. */
export function remainingOf(expected: number, completed: number): number {
  return Math.max(0, Math.max(0, expected) - Math.max(0, completed))
}
