/**
 * Humanization check — catches the subtler tells of AI-written text that a
 * banned-phrase list alone would miss. Returns flagged tells and a rewritten
 * caption if issues are found.
 */

export interface HumanizationResult {
  passed: boolean
  flaggedTells: string[]
  rewrittenCaption: string | null
}

const BOTH_SIDES_PATTERNS = [
  /\bon\s+the\s+one\s+hand\b/i,
  /\bon\s+the\s+other\s+hand\b/i,
  /\bwhile\s+it'?s\s+true\s+that\b/i,
  /\bat\s+the\s+same\s+time\b/i,
  /\bthat\s+said\b/i,
  /\bhaving\s+said\s+that\b/i,
  /\bnevertheless\b/i,
  /\bnonetheless\b/i,
]

const GENERIC_TRANSITIONS = [
  /\bmoreover\b/i,
  /\bfurthermore\b/i,
  /\bin\s+addition\b/i,
  /\bconsequently\b/i,
  /\btherefore\b/i,
  /\bthus\b/i,
  /\bhence\b/i,
  /\bin\s+conclusion\b/i,
  /\bto\s+summarize\b/i,
  /\bin\s+summary\b/i,
]

const LISTINESS_PATTERNS = [
  /^\s*[-•*]\s+\w/m,
  /^\s*\d+[.)]\s+\w/m,
]

function getSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
}

function checkUniformRhythm(sentences: string[]): boolean {
  if (sentences.length < 3) return false
  const lengths = sentences.map((s) => s.split(/\s+/).length)
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const variance = lengths.reduce((acc, l) => acc + (l - avg) ** 2, 0) / lengths.length
  const stdDev = Math.sqrt(variance)
  // Low standard deviation means uniform rhythm — generated feel.
  return stdDev < 2.5 && avg > 6
}

function checkBothSidesHedging(caption: string): boolean {
  return BOTH_SIDES_PATTERNS.filter((re) => re.test(caption)).length >= 2
}

function checkListiness(caption: string): boolean {
  const lines = caption.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length < 4) return false
  let listLines = 0
  for (const line of lines) {
    if (LISTINESS_PATTERNS.some((re) => re.test(line))) listLines++
  }
  return listLines / lines.length > 0.6
}

function checkGenericTransitions(caption: string): boolean {
  const sentences = getSentences(caption)
  if (sentences.length < 3) return false
  let transitionCount = 0
  for (const sentence of sentences) {
    if (GENERIC_TRANSITIONS.some((re) => re.test(sentence))) transitionCount++
  }
  return transitionCount / sentences.length > 0.4
}

/**
 * Analyzes a caption for AI-like rhythm and structural tells. Does not rewrite
 * — only flags. Use `rewriteToHumanize` for the rewrite pass if flagged.
 */
export function checkHumanization(caption: string): { passed: boolean; flaggedTells: string[] } {
  const flagged: string[] = []
  const sentences = getSentences(caption)

  if (checkUniformRhythm(sentences)) {
    flagged.push('uniform sentence rhythm — varies length to sound human')
  }
  if (checkBothSidesHedging(caption)) {
    flagged.push('both-sides hedging — pick a side if you have a real opinion')
  }
  if (checkListiness(caption)) {
    flagged.push('over-structured listiness — flow as one thought if that fits better')
  }
  if (checkGenericTransitions(caption)) {
    flagged.push('generic transitions — replace with a specific detail')
  }

  return { passed: flagged.length === 0, flaggedTells: flagged }
}

/**
 * Attempts to humanize a flagged caption. Best-effort structural tweaks, not a
 * full rewrite — preserves the original meaning and details.
 */
export function rewriteToHumanize(caption: string, flaggedTells: string[]): string {
  let result = caption

  // Break uniform rhythm: merge some sentences, fragment others.
  if (flaggedTells.some((t) => t.includes('uniform sentence rhythm'))) {
    const sentences = getSentences(result)
    if (sentences.length >= 3) {
      const merged: string[] = []
      let i = 0
      while (i < sentences.length) {
        if (i + 1 < sentences.length && i % 3 === 1) {
          merged.push(`${sentences[i]}, and ${sentences[i + 1][0].toLowerCase()}${sentences[i + 1].slice(1)}`)
          i += 2
        } else {
          merged.push(sentences[i])
          i += 1
        }
      }
      result = merged.join('. ') + '.'
    }
  }

  // Remove both-sides hedging: keep the stronger side.
  if (flaggedTells.some((t) => t.includes('both-sides hedging'))) {
    result = result
      .replace(/\s*,?\s*\bwhile\s+it'?s\s+true\s+that\b[^.]*\./gi, '.')
      .replace(/\s*,?\s*\bthat\s+said\b[^.]*\./gi, '.')
      .replace(/\s*,?\s*\bnevertheless\b[^.]*\./gi, '.')
      .replace(/\s*,?\s*\bnonetheless\b[^.]*\./gi, '.')
      .replace(/\s*\.\s*On\s+the\s+other\s+hand\b[^.]*\./gi, '.')
  }

  // Remove generic transitions, replace with a dash or period.
  if (flaggedTells.some((t) => t.includes('generic transitions'))) {
    result = result
      .replace(/\bMoreover,\s*/gi, '')
      .replace(/\bFurthermore,\s*/gi, '')
      .replace(/\bIn addition,\s*/gi, ' ')
      .replace(/\bConsequently,\s*/gi, 'So ')
      .replace(/\bTherefore,\s*/gi, 'So ')
      .replace(/\bThus,\s*/gi, 'So ')
  }

  return result.trim()
}
