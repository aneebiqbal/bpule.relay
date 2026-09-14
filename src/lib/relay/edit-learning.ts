/**
 * BD Edit Learning
 *
 * When BD edits AI copy before sending, capture the delta.
 * Learn carefully: shorter/longer preference, greeting style, phrases removed,
 * CTA changes, proof selection, directness, formality.
 *
 * Do NOT immediately rewrite global profile voice from one edit.
 * Accumulate signals.
 */

export interface EditDelta {
  editDistance: number
  lengthDelta: number
  greetingChanged: boolean
  ctaChanged: boolean
  proofRemoved: boolean
  madeShorter: boolean
  madeLonger: boolean
  formalityShift: 'more_formal' | 'less_formal' | 'same'
  removedPhrases: string[]
  addedPhrases: string[]
}

/**
 * Compute the delta between AI-generated text and what BD actually sent.
 */
export function computeEditDelta(originalText: string, editedText: string): EditDelta {
  const originalWords = originalText.split(/\s+/)
  const editedWords = editedText.split(/\s+/)

  const lengthDelta = editedWords.length - originalWords.length

  // Compute Levenshtein-based edit distance (simplified)
  const editDistance = levenshteinDistance(originalText, editedText)

  // Check greeting change
  const originalGreeting = extractGreeting(originalText)
  const editedGreeting = extractGreeting(editedText)
  const greetingChanged = originalGreeting !== editedGreeting

  // Check CTA change
  const originalCta = extractCta(originalText)
  const editedCta = extractCta(editedText)
  const ctaChanged = originalCta !== editedCta

  // Check if proof was removed
  const originalProofs = extractProofReferences(originalText)
  const editedProofs = extractProofReferences(editedText)
  const proofRemoved = originalProofs.some((p) => !editedProofs.includes(p))

  // Formality shift
  const originalFormality = estimateFormality(originalText)
  const editedFormality = estimateFormality(editedText)
  const formalityShift = editedFormality > originalFormality + 0.2
    ? 'more_formal'
    : editedFormality < originalFormality - 0.2
      ? 'less_formal'
      : 'same'

  // Extract removed/added phrases
  const removedPhrases = findRemovedPhrases(originalText, editedText)
  const addedPhrases = findAddedPhrases(originalText, editedText)

  return {
    editDistance,
    lengthDelta,
    greetingChanged,
    ctaChanged,
    proofRemoved,
    madeShorter: lengthDelta < -2,
    madeLonger: lengthDelta > 2,
    formalityShift,
    removedPhrases,
    addedPhrases,
  }
}

function extractGreeting(text: string): string {
  const match = text.match(/^(hey|hi|hello|hiya|yo|greetings|dear)\s+\w+/i)
  return match?.[0]?.toLowerCase() ?? ''
}

function extractCta(text: string): string {
  const ctaPatterns = [
    /let me know[^.]*\.?/i,
    /worth a[^.]*\.?/i,
    /happy to[^.]*\.?/i,
    /open to[^.]*\.?/i,
    /if (that|this|it)[^.]*\.?/i,
  ]
  for (const pattern of ctaPatterns) {
    const match = text.match(pattern)
    if (match) return match[0].toLowerCase()
  }
  return ''
}

function extractProofReferences(text: string): string[] {
  const proofPatterns = [
    /built a[^.]*\.?/i,
    /worked on[^.]*\.?/i,
    /delivered[^.]*\.?/i,
    /shipped[^.]*\.?/i,
    /helped[^.]*\.?/i,
  ]
  const found: string[] = []
  for (const pattern of proofPatterns) {
    const match = text.match(pattern)
    if (match) found.push(match[0].toLowerCase())
  }
  return found
}

function estimateFormality(text: string): number {
  let score = 0.5
  const lower = text.toLowerCase()

  // Formal indicators
  if (/\b(would|could|may|might|shall)\b/.test(lower)) score += 0.1
  if (/\b(furthermore|moreover|additionally|consequently)\b/.test(lower)) score += 0.15
  if (/\b(sincerely|regards|respectfully)\b/.test(lower)) score += 0.1

  // Informal indicators
  if (/\b(hey|yeah|gonna|wanna|kinda|gotta)\b/.test(lower)) score -= 0.1
  if (/\b(ship|build|shipped|launched)\b/.test(lower)) score -= 0.05
  if (/['']/.test(text)) score -= 0.05 // contractions

  return Math.max(0, Math.min(1, score))
}

function findRemovedPhrases(original: string, edited: string): string[] {
  const originalSentences = original.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
  const editedLower = edited.toLowerCase()
  return originalSentences.filter((s) => !editedLower.includes(s.toLowerCase().slice(0, 20)))
}

function findAddedPhrases(original: string, edited: string): string[] {
  const editedSentences = edited.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean)
  const originalLower = original.toLowerCase()
  return editedSentences.filter((s) => !originalLower.includes(s.toLowerCase().slice(0, 20)))
}

/**
 * Simplified Levenshtein distance.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // For performance, cap the comparison
  const maxLen = 500
  const sa = a.slice(0, maxLen)
  const sb = b.slice(0, maxLen)

  const matrix: number[][] = []

  for (let i = 0; i <= sb.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= sa.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= sb.length; i++) {
    for (let j = 1; j <= sa.length; j++) {
      const cost = sb[i - 1] === sa[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }

  return matrix[sb.length][sa.length]
}

/**
 * Accumulate edit signals over time to detect patterns.
 */
export function accumulateEditSignals(
  deltas: EditDelta[],
): {
  prefersShorter: boolean
  prefersLonger: boolean
  greetingStyle: string | null
  ctaPreference: string | null
  avoidsProofs: boolean
  formalityTrend: 'more_formal' | 'less_formal' | 'stable'
  commonRemovals: string[]
  commonAdditions: string[]
} {
  if (deltas.length === 0) {
    return {
      prefersShorter: false,
      prefersLonger: false,
      greetingStyle: null,
      ctaPreference: null,
      avoidsProofs: false,
      formalityTrend: 'stable',
      commonRemovals: [],
      commonAdditions: [],
    }
  }

  const shorterCount = deltas.filter((d) => d.madeShorter).length
  const longerCount = deltas.filter((d) => d.madeLonger).length
  const proofRemovedCount = deltas.filter((d) => d.proofRemoved).length

  const formalityMore = deltas.filter((d) => d.formalityShift === 'more_formal').length
  const formalityLess = deltas.filter((d) => d.formalityShift === 'less_formal').length

  // Count common removals
  const removalCounts = new Map<string, number>()
  for (const delta of deltas) {
    for (const phrase of delta.removedPhrases) {
      removalCounts.set(phrase, (removalCounts.get(phrase) ?? 0) + 1)
    }
  }
  const commonRemovals = [...removalCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([phrase]) => phrase)

  // Count common additions
  const additionCounts = new Map<string, number>()
  for (const delta of deltas) {
    for (const phrase of delta.addedPhrases) {
      additionCounts.set(phrase, (additionCounts.get(phrase) ?? 0) + 1)
    }
  }
  const commonAdditions = [...additionCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([phrase]) => phrase)

  return {
    prefersShorter: shorterCount > deltas.length * 0.6,
    prefersLonger: longerCount > deltas.length * 0.6,
    greetingStyle: null, // Would need greeting tracking
    ctaPreference: null, // Would need CTA classification
    avoidsProofs: proofRemovedCount > deltas.length * 0.5,
    formalityTrend: formalityMore > formalityLess * 2
      ? 'more_formal'
      : formalityLess > formalityMore * 2
        ? 'less_formal'
        : 'stable',
    commonRemovals,
    commonAdditions,
  }
}
