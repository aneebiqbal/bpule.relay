import type { Profile, MatchedProof } from '@/lib/domain/types'

/**
 * Connection Note Quality
 *
 * Dedicated quality system for LinkedIn connection notes (not cold DMs).
 * Connection notes must be short, natural, low-pressure, and sender-aware.
 * Their purpose is to earn an acceptance — not to close a deal.
 */

export const CONNECTION_NOTE_MAX_CHARS = 300

export interface ConnectionNoteResult {
  text: string
  charCount: number
  maxChars: number
  withinLimit: boolean
  passed: boolean
  failures: string[]
  repaired: string | null
}

const SURVEILLANCE_OPENERS = [
  /^(hey|hi|hello)\s+\w+,?\s*(i noticed|i saw|i came across|i was looking at|i found your)/i,
  /^(i came across your profile)/i,
  /^(i was impressed by)/i,
  /^(i noticed your impressive)/i,
  /^(your work at\s+\w+\s+caught my attention)/i,
  /^(congrats on (your|the|landing))/i,
]

const BANNED_PHRASES_CONNECTION = [
  'i came across your profile',
  'i noticed your impressive',
  'i would love to connect',
  'explore synergies',
  'i would love to pick your brain',
  'hope you are doing well',
  'i would love to discuss how we can help',
  'we specialize in',
  'i help companies like yours',
  'let\'s connect',
  'would love to connect and',
  'your work at .+ caught my attention',
  'given your role',
  'as the (ceo|cto|founder|vp)',
  'i was impressed by',
  'i would love to connect and explore',
  "we're hiring",
  'we are hiring',
  'i am hiring',
  "i'm hiring",
]

const GENERIC_CTAS_CONNECTION = [
  /let's connect!?$/i,
  /would love to connect!?$/i,
  /connect with me!?$/i,
  /looking forward to connecting/i,
  /happy to connect/i,
  /let me know if you're interested$/i,
  /would love to pick your brain/i,
]

const AI_CLICHES_CONNECTION = [
  'game[- ]chang',
  'revolutioniz',
  'cutting[- ]edge',
  'leverage (our|my) expertise',
  'synerg',
  'passionate about',
  'thrilled to',
  'honored to',
  'excited to reach out',
]

// General business-truism patterns ("growth causes strain", "scaling causes
// bottlenecks") stated as generalizations, not tied to any specific
// prospect fact — a fabricated diagnosis dressed as observed insight. The
// shape to catch: a generic subject (growth/scaling/teams "at this stage")
// paired with a generalizing verb ("tend to", "usually", "often", "can")
// and a negative-capacity outcome (strain/bottleneck/stretch resources).
const UNSUPPORTED_PROSPECT_PAIN = [
  /\bshipping\b.{0,40}\blagg/i,
  /\broadmap\b.{0,40}\b(?:strain|stretch)/i,
  /\b(?:strain|stretch)\w*.{0,40}\broadmap\b/i,
  /\bengineering bottleneck/i,
  /\bresource shortage/i,
  /\bdevelopment capacity/i,
  /\bscaling pain/i,
  /\bgrowth strains? engineering/i,
  /\bneed more capacity/i,
  /\bdelivery gets? difficult/i,
]

const GENERALIZED_PAIN_CLAIMS = [
  /\b(?:growth|scaling|scale[- ]?up)\s+(?:phases?\s+)?(?:tends?\s+to|usually|often|can|typically)\s+(?:strain|stretch|overwhelm|break|outpace)\b/i,
  /\bscaling\s+(?:usually\s+)?creates?\s+(?:engineering\s+)?bottlenecks?\b/i,
  /\bteams?\s+at\s+this\s+stage\s+(?:often|usually|typically)\s+need\b/i,
  /\brapid\s+growth\s+can\s+stretch\b/i,
  /\b(?:companies|founders|teams)\s+(?:at\s+your\s+stage\s+)?(?:often|usually|typically)\s+(?:struggle|need|lack|run\s+into)\b/i,
]

export interface ConnectionNoteInput {
  text: string
  profile: Profile | null
  prospectName: string | null
  prospectCompany: string | null
  matchedProof: MatchedProof[]
  /** Canonical evidence. A pain phrase is allowed only when this text already contains it. */
  evidenceText?: string | null
}

/**
 * Evaluate a connection note against all quality gates.
 */
export function evaluateConnectionNote(input: ConnectionNoteInput): ConnectionNoteResult {
  const { text } = input
  const failures: string[] = []
  const lower = text.toLowerCase().trim()

  // 1. Empty or too short
  if (text.trim().length < 10) {
    failures.push('Too short to be meaningful')
  }

  // Semantic truth before style. A fluent note that invents the prospect's
  // pain still fails. Evidence may excuse a phrase only when that same
  // claim is already in the supplied canonical evidence.
  const evidence = (input.evidenceText ?? '').toLowerCase()
  const painClaims = [...GENERALIZED_PAIN_CLAIMS, ...UNSUPPORTED_PROSPECT_PAIN]
  for (const pattern of painClaims) {
    if (pattern.test(lower) && !pattern.test(evidence)) {
      failures.push('Unsupported prospect pain (claim is not in canonical evidence)')
      break
    }
  }
  if (GENERALIZED_PAIN_CLAIMS.some((p) => p.test(lower) && !p.test(evidence))) {
    failures.push('Unsupported generalized-pain claim (general pattern presented as prospect-specific fact)')
  }

  // 2. Surveillance opening
  for (const pattern of SURVEILLANCE_OPENERS) {
    if (pattern.test(lower)) {
      failures.push('Opens with surveillance language')
      break
    }
  }

  // 3. Banned phrases
  for (const phrase of BANNED_PHRASES_CONNECTION) {
    const re = new RegExp(phrase, 'i')
    if (re.test(lower)) {
      failures.push(`Banned phrase: "${phrase.replace(/\\+/g, '').slice(0, 30)}..."`)
      break
    }
  }

  // 4. Generic CTA
  for (const pattern of GENERIC_CTAS_CONNECTION) {
    if (pattern.test(lower)) {
      failures.push('Generic or forced CTA')
      break
    }
  }

  // 5. AI clichés
  for (const phrase of AI_CLICHES_CONNECTION) {
    const re = new RegExp(phrase, 'i')
    if (re.test(lower)) {
      failures.push(`AI cliché: "${phrase.slice(0, 20)}..."`)
      break
    }
  }

  // 6. Excessive praise
  if (/\b(amazing|incredible|impressive|fantastic|brilliant|love what you)\b/i.test(lower)) {
    failures.push('Excessive praise')
  }

  // 7. Sales pitch too early
  if (/\b(i can help|we can help|let me help|happy to help you (ship|build|grow|scale))\b/i.test(lower)) {
    failures.push('Sales pitch in connection note')
  }

  // 8. Budget / funding inference
  if (/\b(budget|spend|afford)\b/i.test(lower) || /\b(raised|funding|series [abc]|closed a round|just closed)\b/i.test(lower)) {
    failures.push('Assumes funding = budget')
  }

  // 9. Emoji check
  if (/[\u{1F300}-\u{1F9FF}]/u.test(text)) {
    failures.push('Contains emoji')
  }

  // 10. Exclamation marks
  if (/!/.test(text)) {
    failures.push('Contains exclamation mark')
  }

  // 11. Em dash abuse
  const emDashCount = (text.match(/[\u2014\u2013]/g) ?? []).length
  if (emDashCount > 1) {
    failures.push(`Em dash abuse (${emDashCount})`)
  }

  // 12. "We" for solo sender
  if (/\b(we can help|our team|we have|we are a|our expertise)\b/i.test(lower)) {
    failures.push('Uses "we" for a solo sender')
  }

  // 13. Fake familiarity
  if (/\b(i have been following|i have been watching|big fan of your)\b/i.test(lower)) {
    failures.push('Claims fake familiarity')
  }

  // 14. Sender mismatch — mentions a capability not in proof
  if (input.profile && input.matchedProof.length === 0) {
    if (/\b(i built|i helped|i worked on|my experience with)\b/i.test(lower)) {
      failures.push('Claims experience without verified proof match')
    }
  }

  // 15. Could send to 100 prospects?
  if (couldSendTo100Prospects(text, input.prospectCompany)) {
    failures.push('Generic enough to send to 100 prospects')
  }

  // 16. Uses "I" but sender name mismatch
  // (handled by prompt, but check here too)
  if (input.profile?.label && !text.toLowerCase().includes(input.profile.label.toLowerCase())) {
    // Not required to use the name — connection notes are from the sender identity
    // This is informational, not a failure
  }

  const charCount = text.length
  const withinLimit = charCount <= CONNECTION_NOTE_MAX_CHARS

  if (!withinLimit) {
    failures.push(`Over character limit (${charCount}/${CONNECTION_NOTE_MAX_CHARS})`)
  }

  return {
    text,
    charCount,
    maxChars: CONNECTION_NOTE_MAX_CHARS,
    withinLimit,
    passed: failures.length === 0,
    failures,
    repaired: null,
  }
}

/**
 * Repair a failed connection note. One-pass deterministic fix.
 */
export function repairConnectionNote(text: string, failures: string[]): string {
  let repaired = text

  // Remove surveillance openings
  if (failures.some((f) => f.includes('surveillance'))) {
    repaired = repaired.replace(
      /^(hey|hi|hello)\s+\w+,?\s*(i noticed|i saw|i came across|i was looking at|i found your)\s+/i,
      '',
    )
  }

  // Remove banned openings
  if (failures.some((f) => f.includes('Banned phrase'))) {
    repaired = repaired.replace(/^i came across your profile[,.\s]*/i, '')
    repaired = repaired.replace(/^i would love to connect[,.\s]*/i, '')
    repaired = repaired.replace(/^let's connect!?\s*/i, '')
  }

  // Remove praise
  if (failures.some((f) => f.includes('praise'))) {
    repaired = repaired.replace(/\bamazing|incredible|impressive|fantastic|brilliant\b/gi, '')
    repaired = repaired.replace(/\blove what you\b/gi, 'interested in what you')
  }

  // Remove sales pitch
  if (failures.some((f) => f.includes('Sales pitch'))) {
    repaired = repaired.replace(/\bi can help you\b/gi, '')
    repaired = repaired.replace(/\bwe can help you\b/gi, '')
    repaired = repaired.replace(/\blet me help\b/gi, '')
  }

  // Fix "we" → "I"
  if (failures.some((f) => f.includes('"we"'))) {
    repaired = repaired.replace(/\bwe can help\b/gi, 'I can share')
    repaired = repaired.replace(/\bour team\b/gi, 'I')
    repaired = repaired.replace(/\bwe have\b/gi, 'I have')
  }

  // Remove em dashes
  repaired = repaired.replace(/[\u2014\u2013]/g, '-')

  // Remove exclamation marks
  repaired = repaired.replace(/!/g, '.')

  // Remove emojis
  repaired = repaired.replace(/[\u{1F300}-\u{1F9FF}]/gu, '')

  // Clean up double spaces and trailing punctuation
  repaired = repaired.replace(/  +/g, ' ').trim()
  repaired = repaired.replace(/\.\s*\./g, '.')

  // Shorten if over limit
  if (repaired.length > CONNECTION_NOTE_MAX_CHARS) {
    repaired = shortenConnectionNote(repaired)
  }

  return repaired.trim()
}

/**
 * Shorten a connection note without truncating mid-sentence.
 */
function shortenConnectionNote(text: string): string {
  if (text.length <= CONNECTION_NOTE_MAX_CHARS) return text

  // Try to find the last sentence end within limit
  const withinLimit = text.slice(0, CONNECTION_NOTE_MAX_CHARS - 3)
  const lastPeriod = withinLimit.lastIndexOf('.')
  const lastSpace = withinLimit.lastIndexOf(' ')

  if (lastPeriod > CONNECTION_NOTE_MAX_CHARS * 0.6) {
    return withinLimit.slice(0, lastPeriod + 1)
  }
  if (lastSpace > CONNECTION_NOTE_MAX_CHARS * 0.5) {
    return withinLimit.slice(0, lastSpace) + '.'
  }
  return withinLimit + '.'
}

/**
 * "Could this be sent to 100 other prospects?" check.
 */
function couldSendTo100Prospects(text: string, company: string | null): boolean {
  let check = text
  if (company) {
    check = check.replace(new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'COMPANY')
  }

  const genericPatterns = [
    /\b(i came across your profile)\b/i,
    /\b(i would love to connect)\b/i,
    /\b(would love to connect)\b/i,
    /\b(let's connect)\b/i,
    /\b(i help (teams|companies|businesses))\b/i,
    /\b(i noticed (your|the))\b/i,
    /\b(would love to pick your brain)\b/i,
    /\b(hope you are doing well)\b/i,
    /\b(looking forward to connecting)\b/i,
  ]

  let hits = 0
  for (const pattern of genericPatterns) {
    if (pattern.test(check)) hits++
  }

  return hits >= 2
}

/**
 * Normalize greeting to use first name consistently.
 * - "Hi Sarah Chen," → "Hi Sarah,"
 * - "Hey Sarah," → "Hey Sarah," (unchanged)
 * - No greeting + name available → "Hi {firstName},"
 * - No name available → leave as-is (don't fabricate)
 */
export function normalizeGreeting(text: string, prospectName: string | null): string {
  if (!text) return text

  const firstName = extractFirstName(prospectName)
  const trimmed = text.trim()

  // Already has a natural first-name greeting
  if (firstName) {
    const greetingPatterns = [
      /^(hi|hey|hello)\s+,/i,
      /^(hi|hey|hello)\s+there,?\s*/i,
    ]
    for (const pattern of greetingPatterns) {
      if (pattern.test(trimmed)) {
        return trimmed.replace(pattern, `${RegExp.$1} ${firstName}, `)
      }
    }

    // Greeting with full name → replace with first name
    const fullNameGreeting = new RegExp(`^(hi|hey|hello)\\s+${firstName}\\s+\\w+,?\\s*`, 'i')
    if (fullNameGreeting.test(trimmed)) {
      return trimmed.replace(fullNameGreeting, `${RegExp.$1} ${firstName}, `)
    }

    // No greeting at all but name available → prepend
    if (!/^(hi|hey|hello)\s/i.test(trimmed) && firstName) {
      return `Hi ${firstName}, ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`
    }
  }

  return text
}

/**
 * Extract first name from a full name string.
 * Returns null if name is unreliable (too short, too long, no spaces).
 */
export function extractFirstName(name: string | null): string | null {
  if (!name) return null
  const trimmed = name.trim()
  if (trimmed.length < 2 || trimmed.length > 40) return null
  // Must have at least one space (first + last) or be a single reasonable name
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  const first = parts[0]
  // Basic filter: must be alphabetic, 2-20 chars
  if (!/^[A-Za-z][A-Za-z'-]{1,19}$/.test(first)) return null
  return first
}

/**
 * Validate character count and auto-repair if needed.
 */
export function validateAndRepair(input: ConnectionNoteInput): ConnectionNoteResult {
  let result = evaluateConnectionNote(input)

  if (!result.passed) {
    const repaired = repairConnectionNote(input.text, result.failures)
    const reEval = evaluateConnectionNote({ ...input, text: repaired })

    // If still over limit, force shorten
    let finalText = repaired
    if (!reEval.withinLimit) {
      finalText = shortenConnectionNote(repaired)
    }

    result = {
      ...reEval,
      text: finalText,
      charCount: finalText.length,
      withinLimit: finalText.length <= CONNECTION_NOTE_MAX_CHARS,
      repaired: finalText !== input.text ? finalText : null,
    }
  }

  return result
}
