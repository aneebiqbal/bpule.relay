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
  signal_type: SignalId
  signal_evidence: string
  verbatim_quote: string
  tags: string[]
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

/**
 * Extract structured fields from a raw research paste.
 *
 * Uses the cheapest capable model with structured output. When no API
 * key is configured the app runs a deterministic demo extractor instead
 * (see DEMO note).
 */
export async function extractLead(rawText: string): Promise<ExtractedLead> {
  if (!rawText.trim()) {
    throw new Error('Paste some raw research first.')
  }

  const { model } = pickModel('extract')

  if (!hasProvider()) {
    return demoExtract(rawText)
  }

  const out = await structuredJson<ExtractionOutput>({
    model,
    system: EXTRACT_SYSTEM,
    user: `Raw research text:\n\n${rawText}`,
    schema: EXTRACTION_SCHEMA,
  })

  return {
    name: empty(out.name),
    title: empty(out.title),
    company: empty(out.company) ?? 'Unknown company',
    url: empty(out.url),
    signalType: out.signal_type,
    signalEvidence: empty(out.signal_evidence) ?? '',
    verbatimQuote: empty(out.verbatim_quote),
    tags: (out.tags ?? []).slice(0, 6),
  }
}

/**
 * DEMO ONLY. Deterministic extractor used when no GROQ_API_KEY is set so
 * the paste -> extract -> score -> draft loop still runs locally. Replace by
 * deleting nothing: this path is only active when hasOpenAi() is false.
 */
function demoExtract(rawText: string): ExtractedLead {
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
    name: nameMatch?.[1] ?? null,
    title: titleMatch ? titleMatch[0].trim() : null,
    company: companyMatch?.[1]?.trim() ?? 'Unknown company',
    url: urlMatch?.[0] ?? null,
    signalType,
    signalEvidence:
      `DEMO extract: matched "${SIGNALS.find((s) => s.id === signalType)?.short}" heuristically. No API key configured.`,
    verbatimQuote: quoteMatch?.[1] ?? null,
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