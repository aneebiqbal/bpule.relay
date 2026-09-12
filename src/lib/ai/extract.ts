import type { ExtractedLead, RecentPostExtract, SignalId } from '@/lib/domain/types'
import { pickModel } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { structuredJson } from '@/lib/ai/provider'
import { SIGNALS } from '@/lib/score/signals'
import { classifyRoleWithFallback, mapLocationToRegion } from '@/lib/leads/targeting'

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
}

const MAX_INPUT_CHARS = 14_000
const MAX_SEGMENTS = 3
const MAX_SEGMENT_CHARS = 5_500

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

async function modelExtract(rawText: string, opts: ExtractLeadOptions): Promise<ExtractionOutput> {
  const model = pickModel('extract').model
  let userPrompt = `Raw profile paste:\n\n${rawText}`

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await structuredJson<unknown>({
      model,
      system: EXTRACT_SYSTEM,
      user: userPrompt,
      schema: EXTRACTION_SCHEMA,
      onStatus: opts.onStatus,
    })

    const parsed = validateOutput(raw)
    if (parsed) return parsed
    if (attempt === 1) {
      userPrompt = `${userPrompt}\n\nYour previous JSON failed schema validation. Return a single JSON object that matches the schema exactly.`
    }
  }

  throw new Error("couldn't extract cleanly, try pasting again")
}

async function extractSegment(rawText: string, opts: ExtractLeadOptions): Promise<ExtractedLead> {
  const out = await modelExtract(rawText, opts)
  const titleRaw = empty(out.title_raw)
  const roleCategory = await classifyRoleWithFallback(titleRaw)
  const locationRaw = empty(out.location_raw)
  const { score, notes } = confidenceDetails(out)
  const quote = out.recent_posts.find((p) => p.verbatim_quote.trim().length >= 16)?.verbatim_quote ?? null

  return {
    name: empty(out.name),
    title: titleRaw,
    titleRaw,
    company: empty(out.company) ?? 'Unknown company',
    url: null,
    locationRaw,
    aboutSummary: empty(out.about_summary),
    experienceSummary: empty(out.experience_summary),
    recentPosts: toRecentPosts(out.recent_posts),
    roleCategory,
    marketRegion: mapLocationToRegion(locationRaw),
    signalType: out.signal_type as SignalId,
    signalEvidence: empty(out.signal_evidence) ?? '',
    extractionConfidence: score,
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

  const normalized = compactWhitespace(rawText).slice(0, MAX_INPUT_CHARS)
  const segments = splitIntoSegments(normalized)
  const ranked = [...segments].sort((a, b) => segmentPriority(b) - segmentPriority(a))
  const primarySegment = ranked[0] ?? normalized

  if (!hasProvider()) {
    const one = demoExtract(primarySegment)
    const others = ranked.slice(1).map((s) => demoExtract(s))
    const candidates = dedupeCandidates([one, ...others]).sort((a, b) => candidateScore(b) - candidateScore(a))
    return { primary: candidates[0], candidates }
  }

  if (segments.length > 1) {
    opts.onStatus?.(`Detected ${segments.length} profiles. Fast mode: extracting strongest profile first.`)
  }

  const primary = await extractSegment(primarySegment, opts)
  const lightweight = ranked.slice(1).map((s) => demoExtract(s))
  const candidates = dedupeCandidates([primary, ...lightweight]).sort((a, b) => candidateScore(b) - candidateScore(a))
  return { primary: candidates[0], candidates }
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
