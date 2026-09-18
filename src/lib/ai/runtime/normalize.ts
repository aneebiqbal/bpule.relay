/**
 * AI Runtime V3 — Structured Output Normalization
 *
 * Handles provider-specific quirks in JSON responses:
 * - Case differences (PERSON vs person)
 * - Null strings ("null" vs null)
 * - Code fences (```json...```)
 * - Schema wrappers ({data: {...}})
 * - Trailing commas
 * - Whitespace
 */

export function normalizeJson(raw: string): Record<string, unknown> {
  let text = raw.trim()

  // Strip code fences
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '')
  }

  // Try direct parse first
  try {
    const parsed = JSON.parse(text)
    if (isPlainObject(parsed)) return parsed
  } catch {
    // Continue to repair attempts
  }

  // Try to extract JSON object from surrounding text
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1)
    try {
      const parsed = JSON.parse(candidate)
      if (isPlainObject(parsed)) return parsed
    } catch {
      // Continue
    }
  }

  // Try repairing common issues
  const repaired = repairJson(text)
  if (repaired) return repaired

  throw new Error('Unable to normalize JSON output')
}

function repairJson(text: string): Record<string, unknown> | null {
  let candidate = text.trim()

  // Strip code fences again after trim
  candidate = candidate.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '')

  // Remove trailing commas before } or ]
  candidate = candidate.replace(/,\s*([}\]])/g, '$1')

  // Replace "null" (string) with null (literal) for values
  candidate = candidate.replace(/:\s*"null"\s*([,\}\]])/gi, ':null$1')
  candidate = candidate.replace(/:\s*"NULL"\s*([,\}\]])/gi, ':null$1')
  candidate = candidate.replace(/:\s*"None"\s*([,\}\]])/gi, ':null$1')
  candidate = candidate.replace(/:\s*""\s*([,\}\]])/gi, ':null$1')

  // Extract JSON from surrounding text
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(candidate)
    if (isPlainObject(parsed)) return parsed
  } catch {
    return null
  }

  return null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Groq gpt-oss and some OpenCode models put the usable answer in
 * `reasoning` / `reasoning_content` and leave `content` empty.
 */
export function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  const candidates = [msg.content, msg.reasoning_content, msg.reasoning]
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

export function extractDeltaText(delta: unknown): { content: string; reasoning: string } {
  if (!delta || typeof delta !== 'object') return { content: '', reasoning: '' }
  const d = delta as Record<string, unknown>
  const content = typeof d.content === 'string' ? d.content : typeof d.text === 'string' ? d.text : ''
  const reasoning = typeof d.reasoning_content === 'string'
    ? d.reasoning_content
    : typeof d.reasoning === 'string'
      ? d.reasoning
      : ''
  return { content, reasoning }
}

/**
 * Coerce null strings and empty values in parsed JSON.
 * Walks the object and converts "null", "NULL", "None", "" to null.
 */
export function coerceNullStrings(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = coerceValue(value)
  }
  return result
}

function coerceValue(value: unknown): unknown {
  if (value === 'null' || value === 'NULL' || value === 'None' || value === '') {
    return null
  }
  if (Array.isArray(value)) {
    return value.map(coerceValue)
  }
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = coerceValue(v)
    }
    return result
  }
  return value
}

/**
 * Case-insensitive key lookup.
 * GPT returns PERSON, COMPANY; Groq returns person, company.
 */
export function getFieldCaseInsensitive(
  obj: Record<string, unknown>,
  key: string,
): unknown {
  if (key in obj) return obj[key]
  const lower = key.toLowerCase()
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lower) return obj[k]
  }
  return undefined
}

/**
 * Get a normalized string array from a field (handles "null" strings, etc).
 */
export function getStringArray(obj: Record<string, unknown>, key: string): string[] {
  const value = getFieldCaseInsensitive(obj, key)
  if (value === 'null' || value === 'NULL' || value === 'None' || value === '' || value === null || value === undefined) {
    return []
  }
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === 'string')
  }
  return []
}

/**
 * Get a normalized string value from a field.
 */
export function getString(obj: Record<string, unknown>, key: string): string | null {
  const value = getFieldCaseInsensitive(obj, key)
  if (value === 'null' || value === 'NULL' || value === 'None' || value === '' || value === null || value === undefined) {
    return null
  }
  return typeof value === 'string' ? value : null
}

/**
 * Coerce value to number or null.
 */
export function getNumber(obj: Record<string, unknown>, key: string): number | null {
  const value = getFieldCaseInsensitive(obj, key)
  if (value === null || value === undefined || value === '' || value === 'null') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Coerce value to boolean or null.
 */
export function getBoolean(obj: Record<string, unknown>, key: string): boolean | null {
  const value = getFieldCaseInsensitive(obj, key)
  if (value === null || value === undefined || value === 'null') return null
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return null
}
