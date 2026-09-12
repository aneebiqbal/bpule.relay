import type { ExtractedLead, SignalId } from '@/lib/domain/types'
import { pickModel } from '@/lib/ai/routing'
import { hasProvider } from '@/lib/ai/config'
import { structuredJson } from '@/lib/ai/provider'
import { SIGNALS } from '@/lib/score/signals'

interface ExtractionOutput {
  name: string
  title: string
  company: string
  url: string
  signal_type: unknown
  signal_evidence: string
  verbatim_quote: string
  tags: string[]
}

interface CandidateHints {
  url: string | null
  company: string | null
  name: string | null
  title: string | null
  quote: string | null
}

interface ExtractLeadOptions {
  onStatus?: (message: string) => void
}

export interface ExtractionBundle {
  primary: ExtractedLead
  candidates: ExtractedLead[]
}

const signalLines = SIGNALS.map(
  (s) => `${s.id}. ${s.short}: ${s.description}`,
).join('\n')

const EXTRACT_SYSTEM = `You structure raw sales research into fields. You never score, never judge, never write anything persuasive. You only structure. Respond with a single JSON object.

The seven signal types are:
${signalLines}

Rules:
- Pick exactly one signal type: the single strongest one supported by the text.
- signal_evidence is a short factual note repeating the specific detail that supports the signal. Nothing invented.
- verbatim_quote is an exact quote from the text if one exists, otherwise empty string.
- name, title, and url are empty strings when not present. Do not guess a person where none is named.
- company is required. Use the company mentioned in the text.
- If the text does not obviously belong to one company, use the most likely company name. Never use a placeholder.
- The input may be a full LinkedIn profile, company about page, or long notes dump. Prefer the primary contact/company described near the top and role section.
- For profile pastes, if title includes "at <company>", use that company unless stronger evidence contradicts it.
- tags are 2 to 6 short lowercase stack and domain keywords that describe the company's product and technology as mentioned in the text (for example "react", "nextjs", "rails", "mobile", "fintech", "marketplace", "healthcare"). No invented tech: only keywords the text supports.`

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'title',
    'company',
    'url',
    'signal_type',
    'signal_evidence',
    'verbatim_quote',
    'tags',
  ],
  properties: {
    name: { type: 'string' },
    title: { type: 'string' },
    company: { type: 'string' },
    url: { type: 'string' },
    signal_type: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7] },
    signal_evidence: { type: 'string' },
    verbatim_quote: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 6 },
  },
} as const

const empty = (v?: string | null): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

const MAX_INPUT_CHARS = 24_000
const MAX_SEGMENTS = 4
const MAX_SEGMENT_CHARS = 9_000
const TITLE_WORDS = /\b(founder|co[- ]?founder|ceo|cto|coo|cmo|vp|head|director|manager|lead|owner|president)\b/i

function compactWhitespace(value: string): string {
  return value.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function toUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return null
  }
}

function normalizeTag(tag: string): string | null {
  const value = tag.toLowerCase().trim().replace(/[^a-z0-9+#.-]+/g, '-')
  const clean = value.replace(/^-+|-+$/g, '')
  if (!clean || clean.length < 2) return null
  return clean
}

function normalizeTags(tags: string[], rawText: string): string[] {
  const out: string[] = []
  const push = (value: string | null) => {
    if (!value) return
    if (!out.includes(value)) out.push(value)
  }

  for (const t of tags) {
    push(normalizeTag(t))
    if (out.length >= 6) return out
  }

  for (const t of demoTags(rawText.toLowerCase())) {
    push(normalizeTag(t))
    if (out.length >= 6) return out
  }

  return out.slice(0, 6)
}

function extractFirstUrl(rawText: string): string | null {
  const urls = rawText.match(/https?:\/\/[^\s)\]}>,"']+/gi) ?? []
  const blockedHosts = new Set(['linkedin.com', 'www.linkedin.com', 'twitter.com', 'x.com'])
  for (const raw of urls) {
    const parsed = toUrl(raw)
    if (!parsed) continue
    const host = new URL(parsed).host.toLowerCase()
    if (!blockedHosts.has(host)) return parsed
  }
  return toUrl(urls[0] ?? '')
}

function looksLikePersonName(value: string): boolean {
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(value.trim())
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function companyFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '')
    const base = host.split('.')[0]
    if (!base) return null
    return titleCaseFromSlug(base)
  } catch {
    return null
  }
}

function detectCandidates(rawText: string): CandidateHints {
  const lines = compactWhitespace(rawText)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const url = extractFirstUrl(rawText)
  const quote = rawText.match(/["“”]([^"“”]{12,240})["“”]/)?.[1]?.trim() ?? null

  let name: string | null = null
  let title: string | null = null
  let company: string | null = null

  for (let i = 0; i < Math.min(lines.length, 30); i += 1) {
    const line = lines[i]
    if (!name && looksLikePersonName(line)) {
      name = line
      continue
    }
    if (!title && TITLE_WORDS.test(line)) {
      title = line
      const atMatch = line.match(/\bat\s+([^|,\-()]{2,80})/i)
      if (!company && atMatch?.[1]) company = atMatch[1].trim()
      continue
    }
    if (!company) {
      const companyMatch = line.match(/^(?:company|organization)\s*:\s*(.{2,80})$/i)
      if (companyMatch?.[1]) {
        company = companyMatch[1].trim()
        continue
      }
    }
  }

  if (!company) {
    const aroundAt = rawText.match(/\b(?:at|for|of|with)\s+([A-Z][A-Za-z0-9&._ -]{2,50})/)
    company = aroundAt?.[1]?.trim() ?? null
  }

  if (!name) {
    const nameMatch = rawText.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/)
    name = nameMatch?.[0] ?? null
  }

  if (!title) {
    const titleMatch = rawText.match(
      /\b(?:Founder|CEO|CTO|COO|VP|Head|Director|Lead|Owner|President|Manager)\b[^.\n]{0,80}/i,
    )
    title = titleMatch?.[0]?.trim() ?? null
  }

  return {
    url,
    company: company ?? companyFromUrl(url),
    name,
    title,
    quote,
  }
}

function inferSignalType(text: string): SignalId {
  return pickDefaultSignal(text.toLowerCase())
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

function candidateScore(extracted: ExtractedLead): number {
  let score = 0
  if (extracted.company && extracted.company !== 'Unknown company') score += 3
  if (extracted.name) score += 2
  if (extracted.title) score += 2
  if (extracted.url) score += 1
  if ((extracted.signalEvidence ?? '').length >= 24) score += 2
  if (extracted.tags.length >= 2) score += 1
  if (extracted.signalType === 1 || extracted.signalType === 7) score += 1
  return score
}

function dedupeCandidates(items: ExtractedLead[]): ExtractedLead[] {
  const out: ExtractedLead[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const key = [
      item.company.toLowerCase().trim(),
      (item.name ?? '').toLowerCase().trim(),
      (item.title ?? '').toLowerCase().trim(),
    ].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

async function extractSingle(
  rawText: string,
  model: string,
  opts: ExtractLeadOptions,
): Promise<ExtractedLead> {
  const hints = detectCandidates(rawText)
  try {
    const out = await structuredJson<ExtractionOutput>({
      model,
      system: EXTRACT_SYSTEM,
      user: `Raw research text:\n\n${rawText}\n\nCandidate hints (use only if supported by text):\n${JSON.stringify(hints)}`,
      schema: EXTRACTION_SCHEMA,
      onStatus: opts.onStatus,
    })
    return resolveOutput(rawText, out)
  } catch {
    return resolveOutput(rawText, demoExtractRaw(rawText))
  }
}

function normalizeSignalType(value: unknown, rawText: string): SignalId {
  if (typeof value === 'number' && SIGNALS.some((s) => s.id === value)) {
    return value as SignalId
  }
  return inferSignalType(rawText)
}

function bestEvidence(rawText: string, provided: string | null): string {
  const cleanProvided = empty(provided)
  if (cleanProvided && cleanProvided.length >= 16) return cleanProvided

  const sentences = compactWhitespace(rawText)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20)

  const strong = sentences.find((s) => /hiring|need|looking for|stuck|behind|migrate|rewrite|urgent|asap/i.test(s))
  return (strong ?? sentences[0] ?? rawText.slice(0, 180)).trim()
}

function resolveOutput(rawText: string, out: ExtractionOutput | null): ExtractedLead {
  const hints = detectCandidates(rawText)
  const company = empty(out?.company) ?? hints.company ?? 'Unknown company'
  const url = empty(out?.url) ?? hints.url
  const verbatimCandidate = empty(out?.verbatim_quote)
  const verbatimQuote =
    verbatimCandidate && rawText.includes(verbatimCandidate)
      ? verbatimCandidate
      : hints.quote

  return {
    name: empty(out?.name) ?? hints.name,
    title: empty(out?.title) ?? hints.title,
    company,
    url,
    signalType: normalizeSignalType(out?.signal_type, rawText),
    signalEvidence: bestEvidence(rawText, out?.signal_evidence ?? null),
    verbatimQuote,
    tags: normalizeTags(out?.tags ?? [], rawText),
  }
}

/**
 * Extract structured fields from a raw research paste.
 *
 * Uses the cheapest capable model with structured output. When no API
 * key is configured the app runs a deterministic demo extractor instead
 * (see DEMO note).
 */
export async function extractLeadBundle(
  rawText: string,
  opts: ExtractLeadOptions = {},
): Promise<ExtractionBundle> {
  if (!rawText.trim()) {
    throw new Error('Paste some raw research first.')
  }

  const normalized = compactWhitespace(rawText).slice(0, MAX_INPUT_CHARS)
  const segments = splitIntoSegments(normalized)

  const { model } = pickModel('extract')

  if (!hasProvider()) {
    const extracted =
      segments.length === 1
        ? [resolveOutput(normalized, demoExtractRaw(normalized))]
        : segments.map((s) => resolveOutput(s, demoExtractRaw(s)))
    const candidates = dedupeCandidates(extracted).sort((a, b) => candidateScore(b) - candidateScore(a))
    return { primary: candidates[0], candidates }
  }

  if (segments.length === 1) {
    const one = await extractSingle(normalized, model, opts)
    return { primary: one, candidates: [one] }
  }

  opts.onStatus?.(`Detected ${segments.length} profiles. Extracting each and choosing the best lead.`)
  const extracted = await Promise.all(
    segments.map(async (segment, index) => {
      opts.onStatus?.(`Extracting profile ${index + 1} of ${segments.length}`)
      return await extractSingle(segment, model, opts)
    }),
  )

  const candidates = dedupeCandidates(extracted).sort((a, b) => candidateScore(b) - candidateScore(a))
  return { primary: candidates[0], candidates }
}

export async function extractLead(rawText: string, opts: ExtractLeadOptions = {}): Promise<ExtractedLead> {
  const bundle = await extractLeadBundle(rawText, opts)
  return bundle.primary
}

/**
 * DEMO ONLY. Deterministic extractor used when no GROQ_API_KEY is set so
 * the paste -> extract -> score -> draft loop still runs locally. Replace by
 * deleting nothing: this path is only active when hasOpenAi() is false.
 */
function demoExtractRaw(rawText: string): ExtractionOutput {
  const urlMatch = rawText.match(/https?:\/\/[^\s]+/)
  const nameMatch = rawText.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/)
  const quoteMatch = rawText.match(/["“”]([^"“”]{8,120})["“”]/)
  const titleMatch = rawText.match(
    /\b(?:Founder|CEO|CTO|COO|VP|Head|Director|Lead|Owner|President|Manager)\b[^.\n]{0,60}/i,
  )
  const companyMatch = rawText.match(
    /(?:at|for|of|with)\s+([A-Z][A-Za-z0-9&._ -]{2,30})/,
  )

  const lower = rawText.toLowerCase()
  const signalType = pickDefaultSignal(lower)

  return {
    name: nameMatch?.[0] ?? '',
    title: titleMatch ? titleMatch[0].trim() : '',
    company: companyMatch?.[1]?.trim() ?? 'Unknown company',
    url: urlMatch?.[0] ?? '',
    signal_type: signalType,
    signal_evidence:
      `DEMO extract: matched "${SIGNALS.find((s) => s.id === signalType)?.short}" heuristically. No API key configured.`,
    verbatim_quote: quoteMatch?.[1] ?? '',
    tags: demoTags(lower),
  }
}

function demoTags(lower: string): string[] {
  const tags: string[] = []
  const pairs: Array<[string, string]> = [
    ['react', 'react'],
    ['nextjs', 'next'],
    ['angular', 'angular'],
    ['rails', 'rails'],
    ['python', 'python'],
    ['wordpress', 'wordpress'],
    ['php', 'php'],
    ['mobile', 'mobile'],
    ['ios', 'ios'],
    ['android', 'android'],
    ['fintech', 'fintech'],
    ['health', 'healthcare'],
    ['retail', 'retail'],
    ['logistics', 'logistics'],
    ['marketplace', 'marketplace'],
    ['saas', 'saas'],
  ]
  for (const [word, tag] of pairs) {
    if (lower.includes(word)) tags.push(tag)
    if (tags.length >= 4) break
  }
  return tags.length > 0 ? [...new Set(tags)] : ['saas']
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
