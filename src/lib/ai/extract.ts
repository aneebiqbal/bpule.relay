import type { ExtractedLead, RecentPostExtract, SignalId } from '@/lib/domain/types'
import { pickModelChain, tier2Chain, type CostTierName } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { structuredJsonChain } from '@/lib/ai/provider'
import { SIGNALS } from '@/lib/score/signals'
import { classifyRoleWithFallback, mapLocationToRegion } from '@/lib/leads/targeting'

/** One entry per model call made while extracting one lead, for cost/tier reporting on the route. */
export interface ExtractionCallLog {
  costTier: CostTierName
  host: string
  estimatedCostUsd: number
}

interface ExtractionOutput {
  name: string
  title_raw: string
  company: string
  location_raw: string
  about_summary: string
  experience_summary: string
  recent_posts: Array<{
    paraphrase: string
    verbatim_quote: string
  }>
  signal_type: number
  signal_evidence: string
  extraction_confidence: number
}

interface ExtractLeadOptions {
  onStatus?: (message: string) => void
}

export interface ExtractionBundle {
  primary: ExtractedLead
  candidates: ExtractedLead[]
  /** Every model call made while producing this bundle, for cost/tier reporting. */
  callLog: ExtractionCallLog[]
}

const MAX_INPUT_CHARS = 14_000
const MAX_SEGMENTS = 3
const MAX_SEGMENT_CHARS = 5_500
const ESCALATE_ENABLED = process.env.SCOUT_EXTRACT_ESCALATE !== '0'
const ESCALATE_BELOW_CONFIDENCE = Number(process.env.SCOUT_EXTRACT_ESCALATE_BELOW ?? '62')
const EXTRACTION_CACHE_MAX = 120

interface ProfileHints {
  name: string | null
  titleRaw: string | null
  company: string | null
  locationRaw: string | null
  evidenceLine: string | null
}

const extractionCache = new Map<string, ExtractionOutput>()

const signalLines = SIGNALS.map(
  (s) => `${s.id}. ${s.short}: ${s.description}`,
).join('\n')

const EXTRACT_SYSTEM = `You structure pasted lead research from full profiles into fields. Return one JSON object only.

Signal types:
${signalLines}

Rules:
- name: person name as shown.
- title_raw: exact title/headline text.
- company: current company name.
- location_raw: exact location text.
- about_summary: one to two sentences paraphrase from About.
- experience_summary: concise shape-only summary, no invented specifics.
- recent_posts: up to 3 items; each item has paraphrase (short) and verbatim_quote (short exact line only if genuinely quotable, else empty string).
- signal_type: one integer from 1..7, strongest supported signal.
- signal_evidence: one concrete factual line from the paste.
- extraction_confidence: integer 0..100 for field reliability.
- Every required key must always be present. If uncertain: signal_type=7, signal_evidence="", extraction_confidence=50.
- Never invent missing facts. Use empty strings for unknown text fields.
- Keep quotes short; never include huge blocks.`

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'title_raw',
    'company',
    'location_raw',
    'about_summary',
    'experience_summary',
    'recent_posts',
    'signal_type',
    'signal_evidence',
    'extraction_confidence',
  ],
  properties: {
    name: { type: 'string' },
    title_raw: { type: 'string' },
    company: { type: 'string' },
    location_raw: { type: 'string' },
    about_summary: { type: 'string' },
    experience_summary: { type: 'string' },
    recent_posts: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['paraphrase', 'verbatim_quote'],
        properties: {
          paraphrase: { type: 'string' },
          verbatim_quote: { type: 'string' },
        },
      },
    },
    signal_type: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7] },
    signal_evidence: { type: 'string' },
    extraction_confidence: { type: 'integer', minimum: 0, maximum: 100 },
  },
} as const

const empty = (v?: string | null): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

function compactWhitespace(value: string): string {
  return value.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function normalizeInput(value: string): string {
  return compactWhitespace(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
}

function splitIntoSegments(rawText: string): string[] {
  const chunks = rawText
    .split(/\n\s*-{3,}\s*\n/g)
    .map((c) => compactWhitespace(c))
    .filter((c) => c.length >= 80)
    .slice(0, MAX_SEGMENTS)
    .map((c) => c.slice(0, MAX_SEGMENT_CHARS))

  return chunks.length > 0 ? chunks : [rawText.slice(0, MAX_SEGMENT_CHARS)]
}

function segmentPriority(segment: string): number {
  const lower = segment.toLowerCase()
  let score = 0
  if (/\bco[- ]?founder\b|\bfounder\b|\bceo\b|\bcto\b|\bhead of\b|\bvp\b/.test(lower)) score += 5
  if (/\bhiring\b|\bopen role\b|\blooking for\b|\bneed\b|\bhelp us\b/.test(lower)) score += 4
  if (/\babout\b|\bexperience\b|\bactivity\b|\bfeatured\b/.test(lower)) score += 2
  if (/followers|connections|reactions|comments/.test(lower)) score -= 2
  score += Math.min(4, Math.floor(segment.length / 1200))
  return score
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function likelyLocation(value: string): boolean {
  return /,/.test(value) || /\b(remote|hybrid|onsite|on-site|united states|usa|uk|uae|india|canada|europe|asia|pakistan)\b/i.test(value)
}

function likelyName(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z .'-]{2,60}$/.test(value)) return false
  if (/\b(founder|ceo|cto|vp|head|director|manager|engineer|developer|consultant)\b/i.test(value)) return false
  const parts = value.trim().split(/\s+/)
  return parts.length >= 2 && parts.length <= 4
}

function sanitizeLine(value: string): string {
  return value.replace(/^[-*\d.)\s]+/, '').trim()
}

function profileHints(rawText: string): ProfileHints {
  const lines = rawText
    .split('\n')
    .map((line) => sanitizeLine(line))
    .filter((line) => line.length >= 2)
    .slice(0, 80)

  let name: string | null = null
  let titleRaw: string | null = null
  let company: string | null = null
  let locationRaw: string | null = null

  for (let i = 0; i < Math.min(lines.length, 12); i += 1) {
    const line = lines[i]
    if (!name && likelyName(line)) {
      name = line
      continue
    }
    if (!titleRaw && /\b(founder|ceo|cto|cmo|coo|vp|head|director|manager|lead|owner|president|consultant|engineer|developer)\b/i.test(line)) {
      titleRaw = line
      const atMatch = line.match(/\bat\s+([^|,]+)/i)
      if (!company && atMatch?.[1]) company = atMatch[1].trim()
      continue
    }
    if (!company) {
      const companyMatch = line.match(/\b(?:at|for|of|with)\s+([A-Z][A-Za-z0-9&._' -]{1,80})/)
      if (companyMatch?.[1]) {
        company = companyMatch[1].trim()
        continue
      }
    }
    if (!locationRaw && likelyLocation(line) && line.length <= 80) {
      locationRaw = line
    }
  }

  const evidenceLine = firstMatchingLine(rawText, [
    /\bhiring\b/i,
    /\bopen roles?\b/i,
    /\braised\b/i,
    /\bseed\b/i,
    /\bseries [abc]\b/i,
    /\bneed help\b/i,
    /\blooking for\b/i,
    /\boverdue\b/i,
    /\bstuck\b/i,
    /\boutdated\b/i,
    /\blegacy\b/i,
  ])

  return { name, titleRaw, company, locationRaw, evidenceLine }
}

function mergeWithHints(out: ExtractionOutput, hints: ProfileHints): ExtractionOutput {
  return {
    ...out,
    name: empty(out.name) ?? hints.name ?? '',
    title_raw: empty(out.title_raw) ?? hints.titleRaw ?? '',
    company: empty(out.company) ?? hints.company ?? '',
    location_raw: empty(out.location_raw) ?? hints.locationRaw ?? '',
    signal_evidence: empty(out.signal_evidence) ?? hints.evidenceLine ?? '',
  }
}

function cacheKey(rawText: string, model: string, seeded: boolean): string {
  return `${model}|${seeded ? 'seed' : 'base'}|${rawText}`
}

function getCachedExtraction(key: string): ExtractionOutput | null {
  const hit = extractionCache.get(key)
  if (!hit) return null
  extractionCache.delete(key)
  extractionCache.set(key, hit)
  return hit
}

function setCachedExtraction(key: string, value: ExtractionOutput): void {
  extractionCache.set(key, value)
  if (extractionCache.size <= EXTRACTION_CACHE_MAX) return
  const first = extractionCache.keys().next().value
  if (typeof first === 'string') extractionCache.delete(first)
}

function validateOutput(raw: unknown): ExtractionOutput | null {
  if (!isObject(raw)) return null
  if (typeof raw.name !== 'string') return null
  if (typeof raw.title_raw !== 'string') return null
  if (typeof raw.company !== 'string') return null
  if (typeof raw.location_raw !== 'string') return null
  if (typeof raw.about_summary !== 'string') return null
  if (typeof raw.experience_summary !== 'string') return null
  if (!Array.isArray(raw.recent_posts)) return null
  if (raw.recent_posts.length > 3) return null
  for (const post of raw.recent_posts) {
    if (!isObject(post)) return null
    if (typeof post.paraphrase !== 'string') return null
    if (typeof post.verbatim_quote !== 'string') return null
    if (post.verbatim_quote.length > 220) return null
  }
  if (typeof raw.signal_type !== 'number') return null
  if (![1, 2, 3, 4, 5, 6, 7].includes(raw.signal_type)) return null
  if (typeof raw.signal_evidence !== 'string') return null
  if (typeof raw.extraction_confidence !== 'number') return null
  if (raw.extraction_confidence < 0 || raw.extraction_confidence > 100) return null

  return {
    name: raw.name,
    title_raw: raw.title_raw,
    company: raw.company,
    location_raw: raw.location_raw,
    about_summary: raw.about_summary,
    experience_summary: raw.experience_summary,
    recent_posts: raw.recent_posts.map((p) => ({
      paraphrase: String((p as Record<string, unknown>).paraphrase ?? ''),
      verbatim_quote: String((p as Record<string, unknown>).verbatim_quote ?? ''),
    })),
    signal_type: raw.signal_type,
    signal_evidence: raw.signal_evidence,
    extraction_confidence: Math.round(raw.extraction_confidence),
  }
}

function normalizeTags(rawText: string): string[] {
  const lower = rawText.toLowerCase()
  const tags: string[] = []
  const pool: Array<[string, string]> = [
    ['react', 'react'],
    ['next.js', 'nextjs'],
    ['nextjs', 'nextjs'],
    ['shopify', 'shopify'],
    ['ecommerce', 'ecommerce'],
    ['marketplace', 'marketplace'],
    ['healthcare', 'healthcare'],
    ['fintech', 'fintech'],
    ['python', 'python'],
    ['rails', 'rails'],
    ['node', 'nodejs'],
    ['ai', 'ai'],
  ]
  for (const [needle, tag] of pool) {
    if (lower.includes(needle) && !tags.includes(tag)) tags.push(tag)
    if (tags.length >= 6) break
  }
  return tags.length > 0 ? tags : ['saas']
}

function confidenceDetails(out: ExtractionOutput): { score: number; notes: string[] } {
  let score = 100
  const notes: string[] = []

  if (!empty(out.name)) {
    score -= 12
    notes.push('Missing contact name.')
  }
  if (!empty(out.title_raw)) {
    score -= 10
    notes.push('Missing title/headline.')
  }
  if (!empty(out.company)) {
    score -= 14
    notes.push('Missing current company.')
  }
  if (!empty(out.location_raw)) {
    score -= 8
    notes.push('Missing location.')
  }
  if ((empty(out.signal_evidence) ?? '').length < 18) {
    score -= 16
    notes.push('Signal evidence is too thin.')
  }

  const hasQuote = out.recent_posts.some((p) => (p.verbatim_quote ?? '').trim().length >= 16)
  if (!hasQuote) {
    score -= 8
    notes.push('No strong verbatim line captured from recent posts.')
  }

  if ((empty(out.about_summary) ?? '').length < 28) {
    score -= 10
    notes.push('About summary is too short.')
  }
  if ((empty(out.experience_summary) ?? '').length < 20) {
    score -= 10
    notes.push('Experience summary is too short.')
  }

  const modelScore = Math.max(0, Math.min(100, Math.round(out.extraction_confidence)))
  score = Math.round(score * 0.75 + modelScore * 0.25)
  score = Math.max(0, Math.min(100, score))
  return { score, notes }
}

function firstMatchingLine(rawText: string, patterns: RegExp[]): string | null {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 220)
  for (const line of lines) {
    if (line.length < 12) continue
    if (patterns.some((p) => p.test(line))) return line
  }
  return null
}

function deriveSignal(rawText: string, out: ExtractionOutput): {
  signalType: SignalId
  signalEvidence: string
} {
  const providedEvidence = empty(out.signal_evidence) ?? ''
  const lower = rawText.toLowerCase()

  const rules: Array<{ id: SignalId; patterns: RegExp[] }> = [
    {
      id: 1,
      patterns: [/\bhiring\b/i, /\bopen roles?\b/i, /\bposition\b/i, /\bwe'?re hiring\b/i, /\bjobs?\b/i],
    },
    {
      id: 3,
      patterns: [/\braised\b/i, /\bseed\b/i, /\bseries [abc]\b/i, /\bfunding\b/i, /\binvestment\b/i],
    },
    {
      id: 2,
      patterns: [/\bsolo founder\b/i, /\bone[- ]person\b/i, /\btiny team\b/i, /\bjust me\b/i],
    },
    {
      id: 6,
      patterns: [/\bbehind\b/i, /\bdelayed\b/i, /\boverdue\b/i, /\bstuck\b/i, /\bslow\b/i, /\bpain\b/i],
    },
    {
      id: 4,
      patterns: [/\blast update\b/i, /\boutdated\b/i, /\bstale\b/i, /\babandoned\b/i, /\bno update\b/i],
    },
    {
      id: 5,
      patterns: [/\blegacy\b/i, /\bwordpress\b/i, /\bjquery\b/i, /\bphp\s*5\b/i, /\bunsupported\b/i],
    },
    {
      id: 7,
      patterns: [/\blooking for\b/i, /\bneed help\b/i, /\bopen to\b/i, /\bagency\b/i, /\bfreelancer\b/i],
    },
  ]

  for (const rule of rules) {
    const line = firstMatchingLine(rawText, rule.patterns)
    if (line) {
      const signalType = rule.id
      const signalEvidence = providedEvidence.length >= 12 ? providedEvidence : line
      return { signalType, signalEvidence }
    }
  }

  const fallbackType = (typeof out.signal_type === 'number' && [1, 2, 3, 4, 5, 6, 7].includes(out.signal_type))
    ? (out.signal_type as SignalId)
    : pickDefaultSignal(lower)
  const hasAskingLine = Boolean(
    firstMatchingLine(rawText, [/\blooking for\b/i, /\bneed help\b/i, /\bopen to\b/i, /\bagency\b/i, /\bfreelancer\b/i]),
  )
  let adjusted = fallbackType
  if (adjusted === 7 && !hasAskingLine) {
    adjusted = /\bco[- ]?founder\b|\bfounder\b|\bceo\b/i.test(out.title_raw)
      ? 2
      : 6
  }
  const fallbackEvidence = providedEvidence.length >= 12 ? providedEvidence : rawText.slice(0, 160).trim()
  return { signalType: adjusted, signalEvidence: fallbackEvidence }
}

function toRecentPosts(posts: ExtractionOutput['recent_posts']): RecentPostExtract[] {
  return posts.slice(0, 3).map((p) => ({
    paraphrase: p.paraphrase.trim(),
    verbatimQuote: empty(p.verbatim_quote),
  }))
}

function candidateScore(item: ExtractedLead): number {
  let score = item.extractionConfidence ?? 0
  if (item.signalType === 1 || item.signalType === 7) score += 6
  if (item.url) score += 2
  return score
}

function dedupeCandidates(items: ExtractedLead[]): ExtractedLead[] {
  const out: ExtractedLead[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const key = [item.company.toLowerCase(), (item.name ?? '').toLowerCase(), (item.titleRaw ?? '').toLowerCase()].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

async function modelExtract(
  rawText: string,
  opts: ExtractLeadOptions,
  callLog: ExtractionCallLog[],
): Promise<ExtractionOutput> {
  return modelExtractOnChain(rawText, pickModelChain('extract'), opts, callLog)
}

/**
 * Runs one extraction call across a tier chain (Groq's free tier first,
 * then DeepSeek hosts, then OpenAI). Every host is asked in json_object
 * mode — DeepSeek's own strict json_schema mode has an open bug returning
 * malformed JSON on some calls, so this app never relies on schema-adherence
 * claims from any provider; validateOutput() below is the real check,
 * applied unconditionally regardless of which host answered.
 */
async function modelExtractOnChain(
  rawText: string,
  chain: ReturnType<typeof pickModelChain>,
  opts: ExtractLeadOptions,
  callLog: ExtractionCallLog[],
  seed?: Partial<ExtractionOutput>,
): Promise<ExtractionOutput> {
  const cacheModelKey = chain.map((s) => s.host.model).join(',')
  const key = cacheKey(rawText, cacheModelKey, Boolean(seed))
  const cached = getCachedExtraction(key)
  if (cached) return cached

  let userPrompt = `Raw profile paste:\n\n${rawText}`
  if (seed) {
    userPrompt += `\n\nPrevious extraction (improve precision, keep only text-supported facts):\n${JSON.stringify(seed)}`
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await structuredJsonChain<unknown>(chain, {
      system: EXTRACT_SYSTEM,
      user: userPrompt,
      schema: EXTRACTION_SCHEMA,
      schemaName: 'lead_profile_extract',
      onStatus: opts.onStatus,
    })
    callLog.push({ costTier: result.costTier, host: result.host, estimatedCostUsd: result.estimatedCostUsd })

    const parsed = validateOutput(result.data)
    if (parsed) {
      setCachedExtraction(key, parsed)
      return parsed
    }
    if (attempt === 1) {
      userPrompt = `${userPrompt}\n\nYour previous JSON failed schema validation. Return a single JSON object that matches the schema exactly, with every required key present.`
    }
  }

  throw new Error("couldn't extract cleanly, try pasting again")
}

function shouldEscalate(out: ExtractionOutput, confidence: number): boolean {
  if (!ESCALATE_ENABLED) return false
  if (confidence < ESCALATE_BELOW_CONFIDENCE) return true
  const hasCompany = Boolean(empty(out.company))
  const hasTitle = Boolean(empty(out.title_raw))
  const hasName = Boolean(empty(out.name))
  if (!hasCompany || !hasTitle) return true
  if (!hasName && confidence < ESCALATE_BELOW_CONFIDENCE + 10) return true
  if ((empty(out.signal_evidence) ?? '').length < 20) return true
  if (out.recent_posts.length === 0) return true
  return false
}

async function extractSegment(
  rawText: string,
  opts: ExtractLeadOptions,
  callLog: ExtractionCallLog[],
): Promise<ExtractedLead> {
  const hints = profileHints(rawText)
  const out = mergeWithHints(await modelExtract(rawText, opts, callLog), hints)
  let chosen = out
  let chosenConfidence = confidenceDetails(chosen)

  const tier2 = tier2Chain()
  if (shouldEscalate(out, chosenConfidence.score) && tier2.length > 0) {
    opts.onStatus?.('Running precision pass for higher-quality extraction')
    try {
      const upgraded = await modelExtractOnChain(rawText, tier2, opts, callLog, out)
      const upgradedMerged = mergeWithHints(upgraded, hints)
      const upgradedConfidence = confidenceDetails(upgradedMerged)
      if (upgradedConfidence.score >= chosenConfidence.score + 4) {
        chosen = upgradedMerged
        chosenConfidence = upgradedConfidence
      }
    } catch {
      // Keep fast-pass extraction if precision pass fails.
    }
  }

  const titleRaw = empty(chosen.title_raw)
  const roleCategory = await classifyRoleWithFallback(titleRaw)
  const locationRaw = empty(chosen.location_raw)
  const quote = chosen.recent_posts.find((p) => p.verbatim_quote.trim().length >= 16)?.verbatim_quote ?? null
  const signal = deriveSignal(rawText, chosen)
  const notes = [...chosenConfidence.notes]
  if (signal.signalEvidence.length >= 18) {
    const idx = notes.findIndex((n) => n.toLowerCase().includes('signal evidence is too thin'))
    if (idx >= 0) notes.splice(idx, 1)
  }

  return {
    name: empty(chosen.name),
    title: titleRaw,
    titleRaw,
    company: empty(chosen.company) ?? 'Unknown company',
    url: null,
    locationRaw,
    aboutSummary: empty(chosen.about_summary),
    experienceSummary: empty(chosen.experience_summary),
    recentPosts: toRecentPosts(chosen.recent_posts),
    roleCategory,
    marketRegion: mapLocationToRegion(locationRaw),
    signalType: signal.signalType,
    signalEvidence: signal.signalEvidence,
    extractionConfidence: chosenConfidence.score,
    confidenceNotes: notes,
    verbatimQuote: empty(quote),
    tags: normalizeTags(rawText),
  }
}

function demoExtract(rawText: string): ExtractedLead {
  const nameMatch = rawText.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/)
  const titleMatch = rawText.match(/\b(?:Founder|CEO|CTO|COO|VP|Head|Director|Lead|Owner|President|Manager)\b[^.\n]{0,80}/i)
  const companyMatch = rawText.match(/\b(?:at|for|of|with)\s+([A-Z][A-Za-z0-9&._ -]{2,50})/)
  const locationMatch = rawText.match(/\b([A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+)\b/)
  const lower = rawText.toLowerCase()
  const signalType = pickDefaultSignal(lower)
  return {
    name: nameMatch?.[0] ?? null,
    title: titleMatch?.[0]?.trim() ?? null,
    titleRaw: titleMatch?.[0]?.trim() ?? null,
    company: companyMatch?.[1]?.trim() ?? 'Unknown company',
    url: null,
    locationRaw: locationMatch?.[1] ?? null,
    aboutSummary: rawText.slice(0, 140),
    experienceSummary: 'Career details were pasted; review profile for specifics.',
    recentPosts: [],
    roleCategory: 'other',
    marketRegion: mapLocationToRegion(locationMatch?.[1] ?? null),
    signalType,
    signalEvidence: 'Demo extraction path in use.',
    extractionConfidence: 55,
    confidenceNotes: ['Demo mode: configure GROQ_API_KEY for full extraction quality.'],
    verbatimQuote: null,
    tags: normalizeTags(rawText),
  }
}

export async function extractLeadBundle(
  rawText: string,
  opts: ExtractLeadOptions = {},
): Promise<ExtractionBundle> {
  if (!rawText.trim()) {
    throw new Error('Paste some raw research first.')
  }

  const normalized = normalizeInput(rawText).slice(0, MAX_INPUT_CHARS)
  const segments = splitIntoSegments(normalized)
  const ranked = [...segments].sort((a, b) => segmentPriority(b) - segmentPriority(a))
  const primarySegment = ranked[0] ?? normalized

  if (!hasProvider()) {
    const one = demoExtract(primarySegment)
    const others = ranked.slice(1).map((s) => demoExtract(s))
    const candidates = dedupeCandidates([one, ...others]).sort((a, b) => candidateScore(b) - candidateScore(a))
    return { primary: candidates[0], candidates, callLog: [] }
  }

  if (segments.length > 1) {
    opts.onStatus?.(`Detected ${segments.length} profiles. Fast mode: extracting strongest profile first.`)
  }

  const callLog: ExtractionCallLog[] = []
  const primary = await extractSegment(primarySegment, opts, callLog)
  const lightweight = ranked.slice(1).map((s) => demoExtract(s))
  const candidates = dedupeCandidates([primary, ...lightweight]).sort((a, b) => candidateScore(b) - candidateScore(a))
  return { primary: candidates[0], candidates, callLog }
}

export async function extractLead(rawText: string, opts: ExtractLeadOptions = {}): Promise<ExtractedLead> {
  const bundle = await extractLeadBundle(rawText, opts)
  return bundle.primary
}

function pickDefaultSignal(lower: string): SignalId {
  const signals: Array<{ id: SignalId; words: string[] }> = [
    { id: 7, words: ['looking for', 'open to', 'help us', 'need a team', 'agency', 'freelancer'] },
    { id: 1, words: ['hiring', 'job', 'open role', 'position', 'careers'] },
    { id: 2, words: ['solo', 'one developer', 'small team', 'just me', 'side project'] },
    { id: 6, words: ['slow', 'delayed', 'late', 'behind', 'overdue', 'complaint'] },
    { id: 4, words: ['no update', 'last update', 'outdated', 'abandoned', 'stale'] },
    { id: 3, words: ['funding', 'raised', 'seed round', 'series', 'investment'] },
    { id: 5, words: ['php 5', 'jquery', 'wordpress', 'legacy', 'unsupported', 'flash'] },
  ]
  for (const s of signals) {
    if (s.words.some((w) => lower.includes(w))) return s.id
  }
  return 7
}
