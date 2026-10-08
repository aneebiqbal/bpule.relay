import type { TrendItem } from '@/lib/domain/types'

/**
 * Editorial Source Grounding
 *
 * Every trend-led post keeps internal provenance — source URL, date,
 * claims extracted — even if citations aren't shown in the final post.
 *
 * This prevents Studio from confidently posting stale model knowledge
 * about politics, releases, acquisitions, new models, regulation, etc.
 *
 * The source is stored with the idea record and can be surfaced to the
 * user as "Why we think this is relevant" or used for fact-checking.
 */

export interface SourceProvenance {
  sourceUrl: string
  sourceTitle: string
  sourcePublishedAt: string | null
  sourceFetchedAt: string
  claims: string[]          // factual claims extracted from the source
  relevanceNote: string      // why this source matters for this persona
  evidenceQuality: 'high' | 'medium' | 'low'
  isTimeSensitive: boolean   // whether the claim decays quickly
}

export interface SourceGroundingResult {
  provenance: SourceProvenance[]
  groundedClaims: string[]   // claims that can be safely made
  ungroundedWarnings: string[] // claims that lack source support
}

/**
 * Build source provenance from a trend item.
 * This is called when a trend candidate is selected for content generation.
 */
export function buildSourceProvenance(
  trendItem: TrendItem,
  personaMatchTerms: string[],
): SourceProvenance {
  return {
    sourceUrl: trendItem.url ?? '',
    sourceTitle: trendItem.title,
    sourcePublishedAt: trendItem.publishedAt,
    sourceFetchedAt: new Date().toISOString(),
    claims: extractClaims(trendItem),
    relevanceNote: buildRelevanceNote(trendItem, personaMatchTerms),
    evidenceQuality: trendItem.evidenceQuality,
    isTimeSensitive: isTimeSensitiveTopic(trendItem),
  }
}

/**
 * Ground an idea against its sources.
 * Returns claims that are supported by sources and warnings for unsupported claims.
 */
export function groundIdeaAgainstSources(
  ideaTitle: string,
  ideaAngle: string,
  provenance: SourceProvenance[],
): SourceGroundingResult {
  if (provenance.length === 0) {
    return {
      provenance,
      groundedClaims: [],
      ungroundedWarnings: [],
    }
  }

  const allClaims = provenance.flatMap(p => p.claims)
  const ideaText = `${ideaTitle} ${ideaAngle}`.toLowerCase()

  const groundedClaims: string[] = []
  const ungroundedWarnings: string[] = []

  // Check if the idea's key claims appear in source claims
  const ideaClaims = extractClaimsFromText(ideaText)

  for (const claim of ideaClaims) {
    const isSupported = allClaims.some(sourceClaim =>
      claimSimilarity(claim, sourceClaim.toLowerCase()) > 0.5,
    )
    if (isSupported) {
      groundedClaims.push(claim)
    } else {
      ungroundedWarnings.push(claim)
    }
  }

  return { provenance, groundedClaims, ungroundedWarnings }
}

/**
 * Build a provenance block for the AI writer.
 * Tells the writer what factual grounding exists for this idea.
 */
export function buildSourcePromptBlock(provenance: SourceProvenance[]): string {
  if (provenance.length === 0) return ''

  const blocks = provenance.map(p => {
    const timeWarning = p.isTimeSensitive
      ? '\n  IMPORTANT: This source is time-sensitive. Verify it is still current before posting.'
      : ''
    const claims = p.claims.length > 0
      ? `\n  Verifiable claims: ${p.claims.slice(0, 3).join('; ')}`
      : ''
    return `SOURCE: "${p.sourceTitle}" (${p.evidenceQuality} evidence quality)
  URL: ${p.sourceUrl}
  Published: ${p.sourcePublishedAt ?? 'Unknown'}
  Relevance: ${p.relevanceNote}${claims}${timeWarning}`
  })

  return `EDITORIAL SOURCES (ground your post in these facts):\n${blocks.join('\n\n')}`
}

/**
 * Determine if a source is too old to safely use for time-sensitive claims.
 */
export function isSourceStale(provenance: SourceProvenance, maxAgeHours: number): boolean {
  if (!provenance.sourcePublishedAt) return false

  const ageHours = (Date.now() - new Date(provenance.sourcePublishedAt).getTime()) / 3600000
  return ageHours > maxAgeHours
}

// ── Internal ─────────────────────────────────────────────────────────────────

function extractClaims(trendItem: TrendItem): string[] {
  const text = `${trendItem.title}. ${trendItem.excerpt ?? ''}`
  return extractClaimsFromText(text)
}

function extractClaimsFromText(text: string): string[] {
  const claims: string[] = []

  // Extract sentences that contain factual assertions
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 15)

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase().trim()

    // Skip questions, opinions without evidence
    if (lower.startsWith('how ') || lower.startsWith('what ') || lower.startsWith('why ')) continue
    if (/I think|I believe|I feel|maybe|perhaps|might be/.test(lower)) continue

    // Keep sentences with numbers, named entities, or concrete assertions
    if (/\d/.test(sentence) || /\b(launch|release|announce|ship|introduc|open.source|acquire|raise|fund|partner)\b/.test(lower)) {
      claims.push(sentence.trim().slice(0, 150))
    }
  }

  return claims.slice(0, 5)
}

function buildRelevanceNote(trendItem: TrendItem, personaMatchTerms: string[]): string {
  if (personaMatchTerms.length > 0) {
    return `Matches your expertise in: ${personaMatchTerms.slice(0, 3).join(', ')}`
  }
  return `Related to: ${trendItem.topics.slice(0, 3).join(', ')}`
}

function isTimeSensitiveTopic(trendItem: TrendItem): boolean {
  const text = `${trendItem.title} ${trendItem.excerpt ?? ''}`.toLowerCase()
  return /\b(launch|release|announce|just|today|breaking|update|v\d+\.\d+|acquire|funding|regulation|policy)\b/.test(text)
}

function claimSimilarity(a: string, b: string): number {
  const aWords = new Set(a.split(' ').filter(w => w.length > 3))
  const bWords = new Set(b.split(' ').filter(w => w.length > 3))
  if (aWords.size === 0 || bWords.size === 0) return 0

  let intersection = 0
  for (const w of aWords) {
    if (bWords.has(w)) intersection++
  }
  const union = aWords.size + bWords.size - intersection
  return union === 0 ? 0 : intersection / union
}
