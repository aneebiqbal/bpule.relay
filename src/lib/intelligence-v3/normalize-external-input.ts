/**
 * Canonical external-input normalization boundary.
 *
 * EVERY surface that turns pasted/ingested text into intelligence — Prospect,
 * Inbound, Manual Lead, Upwork — must run its raw text through
 * `normalizeExternalInput` FIRST, and then read the structured fields from the
 * result. No surface may implement its own label stripping or label parsing.
 *
 * This is the fix for the recurring "label-prefix pollution" class: a value
 * like `"Name: Michael Anderson"` used to survive extraction and be stored,
 * scored and displayed as a person's name. The label belongs to the source
 * format, never to the value.
 *
 * Pure functions — no AI, no network. Deterministic across every surface.
 */

import { isCountryName } from '@/lib/leads/targeting-pure'
import { stripMarkdownFormatting } from '@/lib/prospect/paste-normalize'

export interface NormalizedExternalFields {
  name: string | null
  company: string | null
  title: string | null
  location: string | null
  country: string | null
  budget: string | null
  timeline: string | null
  source: string | null
  jobTitle: string | null
  industry: string | null
}

export interface NormalizedFieldProvenance {
  field: keyof NormalizedExternalFields
  /** Which rule produced the value: `labeled`, `next-line-label`, `prose`, `derived`. */
  rule: 'labeled' | 'next-line-label' | 'prose' | 'derived'
  /** The verbatim source line the value came from, when there is one. */
  line: string | null
}

export interface NormalizedExternalInput {
  /** Whitespace-normalized text, safe to hand to a model or a parser. */
  normalizedText: string
  structuredFields: NormalizedExternalFields
  provenance: NormalizedFieldProvenance[]
}

// ── Label vocabulary ──────────────────────────────────────────────────────────

/**
 * Every accepted label, mapped to the canonical field it fills. Aliases are
 * matched case-insensitively with optional internal spaces/hyphens, so
 * "Full Name", "full-name" and "fullname" are the same label.
 */
const LABELS: Record<string, keyof NormalizedExternalFields> = {
  name: 'name',
  'full name': 'name',
  fullname: 'name',
  'contact name': 'name',
  contact: 'name',
  person: 'name',

  company: 'company',
  'company name': 'company',
  organization: 'company',
  organisation: 'company',
  employer: 'company',
  org: 'company',
  business: 'company',
  firm: 'company',

  title: 'title',
  'job title': 'jobTitle',
  role: 'title',
  position: 'title',
  headline: 'title',
  'current role': 'title',
  designation: 'title',

  location: 'location',
  city: 'location',
  'based in': 'location',
  headquarters: 'location',
  hq: 'location',
  area: 'location',
  region: 'location',

  country: 'country',
  nationality: 'country',

  budget: 'budget',
  'project budget': 'budget',
  'budget approved': 'budget',
  'fixed price': 'budget',
  rate: 'budget',
  compensation: 'budget',

  timeline: 'timeline',
  'start date': 'timeline',
  'desired start': 'timeline',
  'delivery date': 'timeline',
  delivery: 'timeline',
  deadline: 'timeline',
  duration: 'timeline',
  availability: 'timeline',
  start: 'timeline',

  source: 'source',
  platform: 'source',
  channel: 'source',

  industry: 'industry',
  sector: 'industry',
  vertical: 'industry',
}

/** Labels are looked up normalized: lowercase, spaces only, no hyphens. */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[-\s]+/g, ' ')
}

const LABEL_KEYS = Object.keys(LABELS).map(normalizeLabel)

/** `:`, `=`, `-`, `–`, `—`, `|`, `·` all separate a label from its value. */
const SEPARATOR = '\\s*[:=–—|·]\\s*'
/** A hyphen only separates when spaced, so "full-stack" is never split. */
const DASH_SEPARATOR = '\\s+-\\s+'

const LABEL_ALTERNATION = LABEL_KEYS
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const SAME_LINE_LABEL = new RegExp(
  `^(?<label>${LABEL_ALTERNATION})(?:${SEPARATOR}|${DASH_SEPARATOR})(?<value>.+)$`,
  'i',
)

/** A label line with no value: the value is the next non-empty line. */
const NEXT_LINE_LABEL = new RegExp(
  `^(?<label>${LABEL_ALTERNATION})(?:${SEPARATOR}|${DASH_SEPARATOR})?$`,
  'i',
)

/** A line that is a label (with or without its value on the same line). */
export function isLabeledFieldLine(line: string): boolean {
  const t = (line ?? '').trim()
  if (!t) return false
  return SAME_LINE_LABEL.test(t) || NEXT_LINE_LABEL.test(t)
}

/** Resolve a matched label to its canonical field, or null when unknown. */
function fieldForLabel(rawLabel: string): keyof NormalizedExternalFields | null {
  return LABELS[normalizeLabel(rawLabel)] ?? null
}

// ── Whitespace ────────────────────────────────────────────────────────────────

/**
 * Collapse line endings, trailing spaces and blank-line runs. Keeps the line
 * structure (labels and prose both need it) while making CRLF, tabs and
 * triple newlines indistinguishable.
 */
export function normalizeExternalWhitespace(rawText: string): string {
  return stripMarkdownFormatting(rawText)
    .split('\n')
    .map((line) => line.replace(/\s+$/, '').replace(/\t/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanValue(raw: string): string {
  return raw
    .trim()
    .replace(/^[\s:;,.–—|-]+/, '')
    .replace(/[\s.,;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A label can be repeated by a bad paste ("Name: Name: Michael Anderson").
 *
 * The label is only stripped when it is followed by a separator. Without that
 * requirement, a value that merely BEGINS with the label word is mangled:
 * "Company: Company XYZ" became "XYZ", and "Name: Name" became nothing.
 */
function stripRepeatedLabel(value: string, label: string): string {
  let out = value
  let prev = ''
  while (prev !== out) {
    prev = out
    out = out
      .replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:=–—|·]\\s*`, 'i'), '')
      .trim()
  }
  return out
}

// ── Labeled fields ────────────────────────────────────────────────────────────

interface LabeledHit {
  field: keyof NormalizedExternalFields
  label: string
  value: string
  line: string
  rule: 'labeled' | 'next-line-label'
}

function readLabeledFields(lines: string[]): LabeledHit[] {
  const hits: LabeledHit[] = []
  const seen = new Set<keyof NormalizedExternalFields>()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue

    const same = line.match(SAME_LINE_LABEL)
    if (same?.groups) {
      const field = fieldForLabel(same.groups.label)
      if (field && !seen.has(field)) {
        const value = stripRepeatedLabel(cleanValue(same.groups.value), normalizeLabel(same.groups.label))
        if (value) {
          hits.push({ field, label: normalizeLabel(same.groups.label), value, line, rule: 'labeled' })
          seen.add(field)
        }
      }
      continue
    }

    const next = line.match(NEXT_LINE_LABEL)
    if (!next?.groups) continue
    const field = fieldForLabel(next.groups.label)
    if (!field || seen.has(field)) continue

    // The value is the next line that is not itself a label or blank.
    let valueLine: string | null = null
    let valueIndex = -1
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j]
      if (!candidate) continue
      if (SAME_LINE_LABEL.test(candidate) || NEXT_LINE_LABEL.test(candidate)) break
      valueLine = candidate
      valueIndex = j
      break
    }
    if (valueLine === null) continue

    const value = stripRepeatedLabel(cleanValue(valueLine), normalizeLabel(next.groups.label))
    if (!value) continue
    hits.push({ field, label: normalizeLabel(next.groups.label), value, line: valueLine, rule: 'next-line-label' })
    seen.add(field)
    i = valueIndex
  }

  return hits
}

// ── Prose fields ──────────────────────────────────────────────────────────────

const ROLE_WORDS =
  /\b(?:engineer|developer|architect|designer|consultant|analyst|manager|director|officer|founder|recruiter|headhunter|sourcer|specialist|coordinator|administrator|assistant|associate|intern|president|partner|owner|lead|chief|vp|cto|ceo|cfo|coo)\b/i

/** A person's name in prose: 2-4 words, no role words, no sentence punctuation. */
const PROSE_NAME = /^[A-Z][\p{L}'’.-]+(?:\s+[A-Za-z][\p{L}'’.-]+){0,3}$/u

function readProseName(text: string): string | null {
  // "My name is Mazhar khan," — the comma ends the name.
  const named = text.match(/\bmy name is\s+([^,\n.]+)/i)
  if (named) {
    const candidate = cleanValue(named[1])
    if (PROSE_NAME.test(candidate) && !ROLE_WORDS.test(candidate)) return candidate
  }

  // "I'm Mazhar khan" / "I am Mazhar khan" — must not capture a role.
  const self = text.match(/\b(?:i'm|i am|im)\s+([A-Z][\p{L}'’.-]+(?:\s+[A-Za-z][\p{L}'’.-]+){0,2})(?:\s|,|\.|$)/u)
  if (self) {
    const candidate = cleanValue(self[1])
    if (PROSE_NAME.test(candidate) && !ROLE_WORDS.test(candidate)) return candidate
  }

  return null
}

/**
 * "…I'm the Chief Technology Officer at Bpulse." The role and the employer are
 * read together so a title never absorbs the company (Contract 1).
 */
function readProseRoleAndCompany(text: string): { title: string | null; company: string | null } {
  const m = text.match(
    /\b(?:i'm|i am|im)\s+(?:the\s+|a\s+|an\s+)?([^,.\n]{2,60}?)\s+(?:at|with)\s+([A-Z][\p{L}0-9&.'’\-]*(?:\s+[\p{L}0-9&.'’\-]+){0,4})/iu,
  )
  if (!m) return { title: null, company: null }

  const title = cleanValue(m[1])
  const company = cleanValue(m[2]).replace(/[.]+$/, '')
  if (!title || !company) return { title: null, company: null }
  // "I'm at Bpulse" names no role; only credit a title that reads as one.
  if (title.length < 3 || /^(?:at|with|the|a|an)$/i.test(title)) return { title: null, company }
  return { title, company }
}

/** "Based in Austin", "located in Berlin, Germany". */
function readProseLocation(text: string): string | null {
  // Commas are part of a location ("Berlin, Germany"), so capture them; the
  // sentence end still terminates the match.
  const m = text.match(/\b(?:based in|located in|from)\s+([A-Z][\p{L},'\s]{1,60})/iu)
  return m ? cleanValue(m[1]).replace(/[.\s]+$/, '') : null
}

// ── Country ───────────────────────────────────────────────────────────────────

/**
 * The country named in a location string. "Austin, Texas, United States" names
 * the United States; the city is not a country. Returns null when the location
 * names no known country.
 */
export function countryFromLocation(location: string | null | undefined): string | null {
  const parts = (location ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  for (const part of [...parts].reverse()) {
    if (isCountryName(part)) return part.replace(/^the\s+/i, '')
  }
  return null
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * The ONE deterministic boundary. Returns the normalized text, every field it
 * could read, and the rule + source line behind each field.
 *
 * A field is null when the source does not state it — never invented.
 */
export function normalizeExternalInput(rawText: string): NormalizedExternalInput {
  const normalizedText = normalizeExternalWhitespace(rawText ?? '')
  if (!normalizedText) {
    return {
      normalizedText: '',
      structuredFields: {
        name: null, company: null, title: null, location: null, country: null,
        budget: null, timeline: null, source: null, jobTitle: null, industry: null,
      },
      provenance: [],
    }
  }

  const lines = normalizedText.split('\n')
  const fields: NormalizedExternalFields = {
    name: null, company: null, title: null, location: null, country: null,
    budget: null, timeline: null, source: null, jobTitle: null, industry: null,
  }
  const provenance: NormalizedFieldProvenance[] = []

  for (const hit of readLabeledFields(lines)) {
    fields[hit.field] = hit.value
    provenance.push({ field: hit.field, rule: hit.rule, line: hit.line })
  }

  // A person's "Job Title" is their role: expose the same stated value under
  // the person-facing field too, so a profile is never title-less because the
  // source used the posting wording.
  if (!fields.title && fields.jobTitle) {
    fields.title = fields.jobTitle
    provenance.push({ field: 'title', rule: 'derived', line: null })
  }

  // Prose only fills what the labels did not state.
  const proseText = normalizedText.replace(/\s+/g, ' ')
  if (!fields.name) {
    const name = readProseName(proseText)
    if (name) {
      fields.name = name
      provenance.push({ field: 'name', rule: 'prose', line: null })
    }
  }
  if (!fields.title || !fields.company) {
    const { title, company } = readProseRoleAndCompany(proseText)
    if (!fields.title && title) {
      fields.title = title
      provenance.push({ field: 'title', rule: 'prose', line: null })
    }
    if (!fields.company && company) {
      fields.company = company
      provenance.push({ field: 'company', rule: 'prose', line: null })
    }
  }
  if (!fields.location) {
    const location = readProseLocation(proseText)
    if (location) {
      fields.location = location
      provenance.push({ field: 'location', rule: 'prose', line: null })
    }
  }

  // Country is derived from the location, never invented independently.
  if (!fields.country && fields.location) {
    const country = countryFromLocation(fields.location)
    if (country) {
      fields.country = country
      provenance.push({ field: 'country', rule: 'derived', line: null })
    }
  }

  return { normalizedText, structuredFields: fields, provenance }
}
