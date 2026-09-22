/**
 * Find Jobs — normalization.
 *
 * Converts provider-shaped records into the shared Job shape. Provider data
 * is treated as untrusted: HTML descriptions are sanitized with a strict
 * allow-list, URLs must be http(s), and missing fields degrade to safe
 * fallbacks instead of throwing. Nothing here depends on a DOM — it runs on
 * the Next.js server and in plain Node tests.
 */

import type { Job, JobSource, SalaryInfo } from './types'
import { providerAttribution } from './attribution'
import { normalizeLocation } from './location'
import { parseSalary } from './salary'

const ALLOWED_TAGS = new Set([
  'p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 's',
  'h1', 'h2', 'h3', 'h4', 'h5', 'code', 'pre', 'blockquote', 'a',
])

/** Tag/attr + text tokenizer-safe splitter: every token starts with `<` and ends at the first `>`. */
const SEGMENT_RE = /(<\/?[a-zA-Z][\s\S]*?>)/g
const SINGLE_TAG_RE = /^<\/?([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?\/?>$/
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const UNSAFE_ELEMENT_RE =
  /<\s*(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select|noscript|template|svg|math)\b[\s\S]*?(?:>[\s\S]*?<\s*\/\s*\1\s*>|(\/?>))/gi

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * Strict allow-list HTML sanitizer. Removes scripts, comments, event
 * handlers, javascript: URLs and every unknown element/attribute so provider
 * content can be rendered safely. DOM-free so it runs on the server.
 */
export function sanitizeHtml(input: string): string {
  let s = input
  // Drop comments and whole unsafe elements (including their content).
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(UNSAFE_ELEMENT_RE, '')
  // Drop any dangling opening unsafe tag.
  s = s.replace(/<\s*(script|style|iframe|object|embed|form|input|button)\b[^>]*>/gi, '')

  const segments = s.split(SEGMENT_RE)
  const out: string[] = []
  for (const segment of segments) {
    if (!segment.startsWith('<')) {
      out.push(segment)
      continue
    }
    const match = segment.match(SINGLE_TAG_RE)
    if (!match) {
      // Malformed angle bracket — escape it so it renders as text.
      out.push(escapeText(segment))
      continue
    }
    const tagName = match[1].toLowerCase()
    const attrsRaw = match[2] ?? ''
    const isClosing = segment.startsWith('</')
    const isSelfClosing = segment.trimEnd().endsWith('/>')
    if (isClosing) {
      if (ALLOWED_TAGS.has(tagName)) out.push(`</${tagName}>`)
      continue
    }
    if (!ALLOWED_TAGS.has(tagName)) continue
    out.push(`<${tagName}${filterAttributes(tagName, attrsRaw)}${isSelfClosing ? ' />' : '>'}`)
  }
  return out.join('').replace(/\s{2,}/g, ' ').trim()
}

function filterAttributes(tagName: string, attrsRaw: string): string {
  if (tagName !== 'a') return ''
  const attrMatch = attrsRaw.match(HREF_RE)
  const href = attrMatch?.[1] ?? attrMatch?.[2] ?? attrMatch?.[3] ?? ''
  if (!/^(https?:|mailto:)/i.test(href)) return ''
  const clean = href.replace(/["'<>]/g, '')
  return ` href="${clean}" rel="noopener noreferrer nofollow" target="_blank"`
}

/** Strip every tag, preserving paragraph structure as newlines. DOM-free. */
export function toPlainText(input: string): string {
  const sanitized = sanitizeHtml(input.startsWith('<') ? input : `<div>${input}</div>`)
  return decodeEntities(
    sanitized
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|tr|ul|ol|blockquote|pre)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

export function asString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  const trimmed = s.trim()
  return trimmed || undefined
}

export function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : undefined
}

export function asBoolean(value: unknown): boolean {
  if (value === true) return true
  if (value === false) return false
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'y', 'remote', 'on', 'hybrid'].includes(value.trim().toLowerCase())
  }
  if (typeof value === 'number') return value !== 0
  return false
}

export function stringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
}

export function validHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') return value.trim()
  } catch {
    // fall through
  }
  return ''
}

export function normalizeDate(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value * 1000).toISOString() : undefined
  if (typeof value !== 'string') return undefined
  const s = value.trim()
  if (!s) return undefined

  const parsed = Date.parse(s)
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString()

  const ago = s.match(/^(\d+)\s*(d|day|h|hr|hour)s?\s*ago$/i)
  if (ago) {
    const n = Number(ago[1])
    const mult = ago[2].toLowerCase().startsWith('d') ? 86_400_000 : 3_600_000
    return new Date(Date.now() - n * mult).toISOString()
  }
  return undefined
}

export interface MakeJobInput {
  source: JobSource
  sourceJobId: unknown
  title: unknown
  company?: unknown
  companyLogo?: unknown
  locationRaw?: unknown
  locationExtra?: { remote?: boolean; hybrid?: boolean; onsite?: boolean }
  locations?: unknown
  employmentType?: unknown
  seniority?: unknown
  salaryRaw?: unknown
  salaryCurrency?: unknown
  description?: unknown
  excerpt?: unknown
  skills?: unknown
  categories?: unknown
  postedAt?: unknown
  expiresAt?: unknown
  applyUrl: unknown
  sourceUrl?: unknown
}

const TITLE_FALLBACKS = ['undefined', 'null', 'n/a', '—', '-', '']

function stripHtml(value: string): string {
  if (!value.includes('<')) return value.trim()
  return decodeEntities(value.replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ')).trim()
}

/**
 * Assemble and validate a normalized Job from provider-extracted fields.
 * Returns null when a fundamentally required field (title, apply URL,
 * source job id) is missing or unusable.
 */
export function makeJob(input: MakeJobInput): Job | null {
  const title = asString(input.title)
  const applyUrl = validHttpUrl(input.applyUrl)
  const sourceJobId = asString(input.sourceJobId)
  if (!title || !applyUrl || !sourceJobId || TITLE_FALLBACKS.includes(title.toLowerCase())) return null

  const descriptionRaw = asString(input.description) ?? ''
  const description = hasMarkup(descriptionRaw) ? sanitizeHtml(descriptionRaw) : stripHtml(descriptionRaw)
  const excerpt = asString(input.excerpt) ?? (description ? buildExcerpt(description) : undefined)

  const company = asString(input.company) ?? 'Unknown company'
  const normalizedLoc = normalizeLocation(input.locationRaw ?? input.locations ?? '', input.locationExtra)

  const salary = parseSalary(input.salaryRaw, asString(input.salaryCurrency))
  const categories = stringArray(input.categories)
  const skills = stringArray(input.skills)

  return {
    id: `${input.source}:${sourceJobId}`,
    source: input.source,
    sourceJobId,
    title,
    company,
    companyLogo: validHttpUrl(input.companyLogo) || undefined,
    location: normalizedLoc.location,
    country: normalizedLoc.country,
    locations: normalizedLoc.locations,
    remote: normalizedLoc.remote,
    hybrid: normalizedLoc.hybrid,
    onsite: normalizedLoc.onsite,
    employmentType: asString(input.employmentType),
    seniority: asString(input.seniority),
    salary,
    description,
    excerpt,
    skills,
    categories,
    postedAt: normalizeDate(input.postedAt),
    expiresAt: normalizeDate(input.expiresAt),
    applyUrl,
    sourceUrl: validHttpUrl(input.sourceUrl) || undefined,
    attribution: providerAttribution(input.source),
  }
}

function hasMarkup(value: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(value) || /&(amp|lt|gt|#\d+);/i.test(value)
}

function buildExcerpt(description: string): string {
  const text = toPlainText(description.startsWith('<') ? description : `<div>${description}</div>`)
  return text.slice(0, 220).replace(/\s+/g, ' ') || 'No description available.'
}

/** Re-validates an untrusted plain object as a Job (used for client-returned data). */
export function coerceJob(value: Record<string, unknown>): Job | null {
  const source = value.source as JobSource
  const sourceJobId = asString(value.sourceJobId)
  if (!source || !sourceJobId) return null
  return makeJob({
    source,
    sourceJobId,
    title: value.title,
    company: value.company,
    companyLogo: value.companyLogo,
    locationRaw: value.location ?? value.locations,
    locations: value.locations,
    employmentType: value.employmentType,
    seniority: value.seniority,
    salaryRaw: value.salary,
    description: value.description,
    excerpt: value.excerpt,
    skills: value.skills,
    categories: value.categories,
    postedAt: value.postedAt,
    expiresAt: value.expiresAt,
    applyUrl: value.applyUrl,
    sourceUrl: value.sourceUrl,
  }) as Job | null
}

export function safeSalarySolely(value: unknown): SalaryInfo | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return parseSalary({
      min: obj.min,
      max: obj.max,
      currency: obj.currency,
      period: obj.period,
      raw: obj.raw,
    })
  }
  return parseSalary(value)
}