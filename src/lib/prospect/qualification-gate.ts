import type { ExtractedLead } from '@/lib/domain/types'

export type ProspectQualificationStatus = 'eligible' | 'insufficient_context'

export interface ProspectQualificationAssessment {
  status: ProspectQualificationStatus
  qualificationEligibility: boolean
  inputHardFail: boolean
  inputQuality: number
  extractability: number
  evidenceCoverage: number
  reasons: string[]
  missingCritical: string[]
  suggestions: string[]
}

const PLACEHOLDER_WORDS = new Set([
  'asdf',
  'hello',
  'lorem',
  'placeholder',
  'qwerty',
  'random',
  'sample',
  'test',
  'testing',
  'xyz',
])

const TITLE_STOPWORDS = new Set([
  'bio',
  'link',
  'none',
  'null',
  'n/a',
  'na',
  'profile',
  'unknown',
])

const MIN_EVIDENCE_WORDS = 5

const GENERIC_MARKETING_TERMS = new Set([
  'best',
  'class',
  'cloud',
  'cutting',
  'deliver',
  'delivering',
  'digital',
  'global',
  'globally',
  'innovation',
  'innovative',
  'leading',
  'modern',
  'outcomes',
  'solutions',
  'transform',
  'world',
])

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z][a-z0-9+.#-]*/g) ?? []
}

function informativeText(value: string | null | undefined, minWords = MIN_EVIDENCE_WORDS): boolean {
  const text = (value ?? '').trim()
  if (text.length < 24) return false
  const list = words(text)
  if (list.length < minWords) return false
  const unique = new Set(list).size
  if (unique < Math.min(4, Math.ceil(list.length / 2))) return false
  return /[aeiou]/i.test(text)
}

function isGenericMarketingText(value: string | null | undefined): boolean {
  const text = (value ?? '').trim().toLowerCase()
  if (!text) return false
  const tokenList = words(text)
  if (tokenList.length < 8) return false
  const termHits = tokenList.filter((token) => GENERIC_MARKETING_TERMS.has(token)).length
  const hasConcreteMarker =
    /\b\d+(?:[.,]\d+)?(?:\s*(?:%|x|k|m|b|days?|weeks?|months?|years?|hrs?|hours?))?\b/i.test(text) ||
    /\b(hiring|recruiting|looking\s+for|open\s+role|opening|job\s+post|backlog|incident|outage|latency|migration|rewrite|rebuild|deadline|p\d{2})\b/i.test(text)
  return termHits >= 4 && !hasConcreteMarker
}

function hasSpecificSignalEvidence(value: string | null | undefined): boolean {
  const text = (value ?? '').trim()
  if (!informativeText(text, MIN_EVIDENCE_WORDS)) return false
  const hasMetricCue =
    /\b\d+(?:[.,]\d+)?(?:\s*(?:%|x|k|m|b|days?|weeks?|months?|years?|hrs?|hours?))?\b/i.test(text) ||
    /\bp\d{2}\b/i.test(text)
  const hasOpportunityCue =
    /\b(hiring|recruiting|looking\s+for|open\s+role|opening|job\s+post|need|needs|seeking|backlog|incident|outage|latency|migration|rewrite|rebuild|deadline|launch|ship|shipping)\b/i.test(text)
  const hasTechCue =
    /\b(rails|ruby|react|node|python|go|java|kotlin|swift|postgres|mysql|api|backend|frontend|mobile|ios|android|devops|sre|kubernetes|aws|gcp|azure)\b/i.test(text)
  const hasQuotedCue = /["']/.test(text)
  const concreteCueCount = [hasMetricCue, hasOpportunityCue, hasTechCue, hasQuotedCue].filter(Boolean).length
  if (concreteCueCount === 0) return false
  if (isGenericMarketingText(text) && concreteCueCount < 2) return false
  return true
}

function normalizedContactKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function hasLikelyName(value: string | null | undefined): boolean {
  const t = (value ?? '').trim()
  if (!/^[A-Za-z][A-Za-z .'-]{2,80}$/.test(t)) return false
  const parts = t.split(/\s+/).filter(Boolean)
  return parts.length >= 2 && parts.length <= 4
}

function hasLikelyTitle(value: string | null | undefined): boolean {
  const t = (value ?? '').trim()
  if (!t || t.length < 3) return false
  const lower = t.toLowerCase()
  if (TITLE_STOPWORDS.has(lower)) return false
  if (normalizedContactKey(t) === normalizedContactKey('unknown title')) return false
  return /[a-z]/i.test(t)
}

function hasKnownCompany(value: string | null | undefined): boolean {
  const t = (value ?? '').trim()
  if (!t) return false
  const lower = t.toLowerCase()
  if (lower === 'unknown company' || lower === 'unknown') return false
  if (PLACEHOLDER_WORDS.has(lower)) return false
  return /[a-z]/i.test(t)
}

function hasValidUrl(raw: string | null | undefined): boolean {
  if (!raw) return false
  try {
    const url = new URL(raw)
    return Boolean(url.hostname)
  } catch {
    return false
  }
}

function scoreRawInput(rawText: string | null | undefined): {
  score: number
  hardFail: boolean
  reasons: string[]
} {
  const input = (rawText ?? '').trim()
  if (!input) {
    return {
      score: 0,
      hardFail: true,
      reasons: ['Raw input is required to verify this prospect.'],
    }
  }

  const tokenList = words(input)
  const uniqueCount = new Set(tokenList).size
  const counts = new Map<string, number>()
  let maxTokenRepeat = 0
  for (const token of tokenList) {
    const next = (counts.get(token) ?? 0) + 1
    counts.set(token, next)
    if (next > maxTokenRepeat) maxTokenRepeat = next
  }
  const repeatRatio = tokenList.length > 0 ? maxTokenRepeat / tokenList.length : 1
  const placeholderHits = tokenList.filter((token) => PLACEHOLDER_WORDS.has(token)).length
  const placeholderRatio = tokenList.length > 0 ? placeholderHits / tokenList.length : 0
  const vowelPoorWords = tokenList.filter((token) => token.length >= 4 && !/[aeiou]/.test(token)).length
  const vowelPoorRatio = tokenList.length > 0 ? vowelPoorWords / tokenList.length : 0
  const alphaChars = (input.match(/[A-Za-z]/g) ?? []).length
  const urlOnly = /^https?:\/\/\S+\s*$/i.test(input)
  const genericMarketing = isGenericMarketingText(input)

  let score = 100
  const reasons: string[] = []

  if (urlOnly) {
    score -= 70
    reasons.push('Input is only a URL with no extractable context.')
  }
  if (tokenList.length < 6) {
    score -= 45
    reasons.push('Input is too short to identify a real prospect.')
  } else if (tokenList.length < 10) {
    score -= 20
  }
  if (uniqueCount < 5) {
    score -= 25
    reasons.push('Input has too little semantic variety to trust qualification.')
  }
  if (repeatRatio >= 0.55) {
    score -= 30
    reasons.push('Input is heavily repetitive and likely meaningless.')
  }
  if (placeholderRatio >= 0.35) {
    score -= 35
    reasons.push('Input is dominated by placeholder/testing words.')
  }
  if (vowelPoorRatio >= 0.5) {
    score -= 20
    reasons.push('Input appears garbled or tokenized noise.')
  }
  if (alphaChars < 30) {
    score -= 20
  }
  if (genericMarketing) {
    score -= 30
    reasons.push('Input reads like generic marketing copy, not a concrete prospect signal.')
  }

  const hardFail =
    urlOnly ||
    tokenList.length < 4 ||
    placeholderRatio >= 0.75 ||
    (repeatRatio >= 0.72 && uniqueCount <= 3) ||
    (genericMarketing && alphaChars < 120)

  return { score: clamp(score), hardFail, reasons }
}

function scoreExtractability(extracted: ExtractedLead): {
  score: number
  hasCompany: boolean
  hasPerson: boolean
  hasRole: boolean
  hasSignalEvidence: boolean
  hasContext: boolean
} {
  const hasCompany = hasKnownCompany(extracted.company)
  const hasPerson = hasLikelyName(extracted.name)
  const hasRole = hasLikelyTitle(extracted.titleRaw ?? extracted.title)
  const hasSignalEvidence = hasSpecificSignalEvidence(extracted.signalEvidence)
  const contextLength = `${extracted.aboutSummary ?? ''} ${extracted.experienceSummary ?? ''}`.trim().length
  const hasContext = contextLength >= 70 || (extracted.recentPosts?.length ?? 0) > 0
  const hasTagCoverage = (extracted.tags?.length ?? 0) >= 2
  const confidence = clamp(extracted.extractionConfidence ?? 0)

  let score = 0
  if (hasCompany) score += 20
  if (hasPerson) score += 15
  if (hasRole) score += 15
  if (hasSignalEvidence) score += 20
  if (hasContext) score += 15
  if (hasTagCoverage) score += 10
  if (hasValidUrl(extracted.url)) score += 5
  if (confidence >= 70) score += 10
  else if (confidence >= 55) score += 5

  return {
    score: clamp(score),
    hasCompany,
    hasPerson,
    hasRole,
    hasSignalEvidence,
    hasContext,
  }
}

function scoreEvidenceCoverage(extracted: ExtractedLead, extractability: ReturnType<typeof scoreExtractability>): number {
  const dimensions = [
    extractability.hasCompany,
    extractability.hasPerson || extractability.hasRole,
    extractability.hasSignalEvidence,
    extractability.hasContext || (extracted.tags?.length ?? 0) > 0,
    (extracted.extractionConfidence ?? 0) >= 60 || hasValidUrl(extracted.url),
  ]

  const covered = dimensions.filter(Boolean).length
  return clamp((covered / dimensions.length) * 100)
}

export function evaluateProspectQualification(params: {
  extracted: ExtractedLead
  rawText?: string | null
}): ProspectQualificationAssessment {
  const raw = scoreRawInput(params.rawText)
  const extractability = scoreExtractability(params.extracted)
  const evidenceCoverage = scoreEvidenceCoverage(params.extracted, extractability)

  const missingCritical: string[] = []
  if (!extractability.hasCompany) missingCritical.push('company context')
  if (!(extractability.hasPerson || extractability.hasRole)) missingCritical.push('person or role context')
  if (!extractability.hasSignalEvidence) missingCritical.push('specific opportunity signal')

  const reasons = [...raw.reasons]
  if (extractability.score < 45) {
    reasons.push('Extracted fields are too sparse for reliable qualification.')
  }
  if (evidenceCoverage < 40) {
    reasons.push('Evidence coverage is too thin to justify a fit score.')
  }
  if ((params.extracted.extractionConfidence ?? 0) < 40) {
    reasons.push('Extraction confidence is too low to trust scoring.')
  }
  if (params.extracted.signalEvidence && !hasSpecificSignalEvidence(params.extracted.signalEvidence)) {
    reasons.push('Signal evidence is too generic; add concrete opportunity details.')
  }

  const qualificationEligibility =
    !raw.hardFail &&
    raw.score >= 45 &&
    extractability.score >= 45 &&
    evidenceCoverage >= 40 &&
    missingCritical.length === 0

  return {
    status: qualificationEligibility ? 'eligible' : 'insufficient_context',
    qualificationEligibility,
    inputHardFail: raw.hardFail,
    inputQuality: raw.score,
    extractability: extractability.score,
    evidenceCoverage,
    reasons,
    missingCritical,
    suggestions: qualificationEligibility
      ? []
      : [
          'LinkedIn/profile details',
          'company information',
          'role/title',
          'job or opportunity context',
          'website with extractable data',
          'real inbound conversation context',
        ],
  }
}
