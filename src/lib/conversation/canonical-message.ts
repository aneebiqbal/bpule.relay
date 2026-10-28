/**
 * Canonical message identity.
 *
 * The messages table owns the conversation timeline. A lead-level opening
 * message (`lead.inboundMessage`) is legacy/source context only, rendered as a
 * turn when — and only when — no canonical row represents it.
 *
 * The identity is structural, never textual: two genuinely repeated messages
 * with the same text are two messages, and a lead's opening is one. Text
 * equality alone cannot tell those apart, so the opening row carries a
 * deterministic key derived from the lead.
 */

/** The idempotency key of the canonical row for a lead's opening message. */
export function inboundFirstMessageKey(leadId: string): string {
  return `inbound_first:${leadId}`
}

/** Whether a message row is the canonical opening message of its lead. */
export function isInboundFirstMessage(message: { idempotencyKey?: string | null } | null | undefined): boolean {
  return Boolean(message?.idempotencyKey?.startsWith('inbound_first:'))
}

/**
 * Whether any canonical row already represents the lead's opening message.
 * When it does, the lead-level fallback must not synthesize a second turn.
 *
 * The row must carry the opening TEXT, not just the key. A row with the right
 * key and different text must not make the opening disappear: that is silent
 * data loss in the conversation view. `openingText` is optional so callers that
 * only have the key still work.
 */
export function hasCanonicalOpeningMessage(
  messages: Array<{ idempotencyKey?: string | null; sentText?: string | null }>,
  leadId: string,
  openingText?: string | null,
): boolean {
  const key = inboundFirstMessageKey(leadId)
  const expected = openingText?.trim() ?? null
  return messages.some((m) => {
    if (m.idempotencyKey !== key) return false
    if (expected === null) return true
    return m.sentText?.trim() === expected
  })
}

/**
 * Whether a rendered thread shows the same client text twice. Used as the
 * telemetry guard for Contract 11: two identical turns mean the opening was
 * rendered both canonically and as a lead-level fallback.
 *
 * Structural, not a general text dedupe: a human who genuinely repeats
 * themselves produces two turns with different ids, and this reports the
 * *pair* so the caller can decide.
 */
export function findDuplicateOpeningTurns(
  turns: ReadonlyArray<{ id: string; role: string; text: string }>,
): Array<{ text: string; ids: string[] }> {
  const byText = new Map<string, string[]>()
  for (const turn of turns) {
    if (turn.role !== 'client') continue
    const text = turn.text.trim()
    if (text.length < 12) continue
    const ids = byText.get(text) ?? []
    ids.push(turn.id)
    byText.set(text, ids)
  }
  return [...byText.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([text, ids]) => ({ text, ids }))
}
