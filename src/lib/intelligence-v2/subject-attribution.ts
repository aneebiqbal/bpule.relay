/**
 * Subject Attribution & Business-Model Classification
 *
 * The pipeline's root failure mode: every extracted sentence is treated as if
 * it were spoken by or about the prospect. Market commentary ("79,000
 * unfilled IT positions in Germany"), audience language ("anyone looking
 * for a job"), and a recruiter's own service descriptions all become
 * buying-intent evidence for the prospect.
 *
 * This module provides deterministic attribution so downstream scoring can
 * distinguish:
 *   - what the prospect's OWN company is doing (buying signal, if they are a buyer)
 *   - what the prospect SAYS ABOUT THE MARKET / OTHER COMPANIES (not a buying signal)
 *   - who the prospect's AUDIENCE is (not the prospect's own intent)
 *   - what BUSINESS MODEL the prospect operates (recruiter vs. product buyer)
 */

import type { CommercialRelationship } from './types'

export type EvidenceSubject =
  | 'PROSPECT'
  | 'MARKET'
  | 'AUDIENCE'
  | 'UNKNOWN'

export type BusinessModel =
  | 'PRODUCT' // builds/sells a product or service (potential buyer of delivery)
  | 'RECRUITER' // recruitment / career-coaching / talent-placement business
  | 'UNKNOWN'

// ── Market-commentary detection ─────────────────────────────────────────────

/**
 * Third-person patterns that describe the broader market, other companies,
 * industry trends, or macro statistics — NOT the prospect's own commercial
 * situation. These must never produce buyer signals.
 */
const MARKET_PATTERNS = [
  // Macro statistics about a country / sector
  /\b\d{1,3}(?:,\d{3})*\s+(?:unfilled|open|vacant|available)\b/i,
  /\b\d{1,3}(?:,\d{3})*\s+(?:positions|jobs|roles|openings|vacancies)\b/i,
  /€\s*\d+(?:\.\d+)?\s*billion/i,
  /\bgrowth\s+forecast\b/i,
  /\braised\s+its\s+forecast\b/i,
  // "X% of companies..."
  /\b\d{1,3}%\s+of\s+(?:companies|employers|businesses|organizations)\b/i,
  /\b\d{1,3}%\s+of\s+companies\s+(?:say|expect|report|have|plan)\b/i,
  // Named institutions reporting
  /\b(?:the\s+)?OECD\b/i,
  /\bBitkom\b/i,
  /\bifo\s+forecast\b/i,
  /\bFederal\s+Employment\s+Agency\b/i,
  /\bthe\s+Federal\s+Employment\s+Agency\b/i,
  // Third-person generalization about hiring/talent
  /\bcompanies\s+(?:are\s+)?(?:becoming|need|struggle|expect)\b/i,
  /\bcompanies\s+(?:with|that\s+have)\s+(?:IT|tech|positions|vacancies)\b/i,
  // Sector-level trend language
  /\bthe\s+(?:German|global|UK|US|European)\s+(?:tech\s+)?(?:job\s+)?market\b/i,
  /\bthe\s+(?:German|UK|US)\s+(?:economy|AI\s+market)\b/i,
  /\bGerman(?:y'?s?)?\s+(?:AI\s+|tech\s+)?(?:job\s+)?market\b/i,
  /\bGerman(?:y'?s?)?\s+(?:economy|exports|companies)\b/i,
  /\bthe\s+German\s+(?:economy|AI\s+market|digital\s+economy|Tech\s+job\s+market)\b/i,
  /\bindustry\b.+\b(?:growing|expanding|shortage|demand)\b/i,
  /\b(?:skilled\s+immigration|immigration\s+for\s+qualified)\b/i,
  /\bunfilled\s+IT\s+positions\b/i,
  /\bIT\s+skills\s+shortage\b/i,
  /\b(?:Fachkräftemangel|skills?\s+shortage)\b/i,
  // "there are still risks", "considerable uncertainty" — analyst voice
  /\b(?:there\s+are\s+still\s+risks|considerable\s+uncertainty)\b/i,
  // Macro-economy / labor-market analyst voice
  /\b(?:economic\s+(?:boom|recovery)|employment\s+growing?|unemployment|demographic\s+pressure|ageing\s+population|gross\s+value\s+added|foreign\s+workers?|international\s+employees?)\b/i,
]

// First-person / prospect-company markers that indicate the prospect themselves
const PROSPECT_MARKERS = [
  /\b(?:I|I'm|I've|we|we're|we've|our|my)\s+(?:help|coach|connect|place|recruit|built|founded|lead|run|manage|started)\b/i,
  /\b(?:I|we)\s+(?:am|are)\s+(?:on\s+a\s+mission|building|launching|creating|hiring)\b/i,
  /\bour\s+(?:mission|platform|product|service|team|clients?|candidates?)\b/i,
  /\bcoached\s+\d+\+/i,
  /\bhelped\s+\d+\+\s+(?:professionals|candidates|people)\b/i,
  /\b(?:co-founded|founded)\s+\w+/i,
]

// Audience patterns: the prospect's customers/clients/candidates doing something
const AUDIENCE_PATTERNS = [
  /\banyone\s+(?:looking|searching|seeking)\b/i,
  /\bfor\s+(?:anyone|those|professionals|candidates|job\s+seekers)\s+(?:looking|searching|seeking|considering|applying)\b/i,
  /\b(?:professionals|candidates|job\s+seekers)\s+(?:looking|searching|seeking|considering|applying|around\s+the\s+world)\b/i,
  /\bpeople\s+from\s+(?:different\s+)?countries\b/i,
  /\bclients?\s+(?:in\s+person|face-to-face)\b/i,
]

/**
 * Classify a single sentence/line by who it is about.
 *
 * Order matters: audience and market are checked before generic prospect,
 * because a recruiter legitimately talks about both. A line like
 * "professionals looking for jobs in Germany" is about the AUDIENCE, not the
 * prospect's own job search.
 */
export function classifySentence(line: string): EvidenceSubject {
  const trimmed = line.trim()
  if (!trimmed) return 'UNKNOWN'

  // Audience language takes priority: the prospect describing their audience
  // must not be mistaken for the prospect's own intent.
  if (AUDIENCE_PATTERNS.some((p) => p.test(trimmed))) {
    // But if it's clearly first-person self-description, it's the prospect.
    if (PROSPECT_MARKERS.some((p) => p.test(trimmed))) return 'PROSPECT'
    return 'AUDIENCE'
  }

  // Market commentary: third-person statistics, trends, other companies.
  if (MARKET_PATTERNS.some((p) => p.test(trimmed))) {
    return 'MARKET'
  }

  // First-person prospect language.
  if (PROSPECT_MARKERS.some((p) => p.test(trimmed))) {
    return 'PROSPECT'
  }

  return 'UNKNOWN'
}

// ── Business-model classification ───────────────────────────────────────────

/**
 * Phrases describing a recruitment / career-coaching / talent-placement
 * BUSINESS (the prospect helps others get placed). This is mutually exclusive
 * with being a software-delivery buyer — a recruitment company's "hiring"
 * content is about its service, not about buying external engineering.
 */
const RECRUITER_MODEL_PATTERNS = [
  /\bhelp\s+(?:skilled\s+)?(?:professionals?|candidates?|people)\s+(?:land|find|get)\s+(?:jobs?|roles?|positions?|work)\b/i,
  /\bcoach(?:e|ing|ed)\s+(?:international\s+)?(?:tech\s+|IT\s+)?(?:professionals?|candidates?)\b/i,
  /\b(?:place|placing|placed|recruit(?:ing|ed)?)\s+(?:international\s+)?(?:IT\s+|tech\s+)?(?:professionals?|candidates?|talent)\b/i,
  /\brecruitment\s+for\s+(?:the\s+)?(?:German|UK|US|Austrian|European)\s+(?:market|companies)\b/i,
  /\binternational\s+tech\s+recruitment\b/i,
  /\btalent\s+pipelines?\b/i,
  /\bsourcing\s+(?:and\s+)?(?:placing|recruiting)\b/i,
  /\b(?:navigat(?:e|ing)|guid(?:e|ing))\s+(?:the\s+)?(?:complex\s+)?(?:process\s+of\s+)?finding\s+a\s+job\b/i,
  /\bcareer\s+coaching\b/i,
  /\bconnect\s+(?:international\s+)?(?:professionals?|talent)\s+with\s+(?:the\s+)?(?:job\s+market|employers?|companies)\b/i,
  /\b(?:CV|resume)\s+optimi[sz]ation\b/i,
  /\binterview\s+preparation\b/i,
  /\bco-found(?:ed|er).+\b(?:recruit(?:er|ment)|talent|staffing|career|placement)\b/i,
  /\b(?:recruitment|staffing|talent\s+(?:acquisition|agency))\s+(?:firm|company|business|agency)\b/i,
]

/**
 * Phrases describing a product / platform / service the prospect BUILDS and
 * sells (as distinct from a service that places candidates). These
 * prospects can be delivery buyers.
 */
const PRODUCT_MODEL_PATTERNS = [
  /\b(?:build(?:ing|s)?|creat(?:ing|es)?|launch(?:ing|ed)?)\s+(?:a\s+)?(?:new\s+)?(?:product|platform|app|SaaS|service|tool|solution)\b/i,
  /\bour\s+(?:product|platform|app|SaaS|service|tool|solution)\b/i,
  /\bwe\s+(?:build|create|offer|provide|deliver)\s+(?:software|apps?|platforms?|solutions?|products?)\b/i,
  /\btech\s+(?:startup|company)\b/i,
  /\b(?:SaaS|B2B|B2C|D2C)\s+(?:startup|company|platform|product|business)\b/i,
  /\bsoftware\s+(?:company|product|platform|engineering)\b/i,
  /\b(?:seed|series\s+[abc])\s+round\b/i,
  /\braised\s+\$?\d+m\b/i,
  /\bjust\s+closed\s+(?:our|the)\s+(?:seed|series|funding)\b/i,
]

export function classifyBusinessModel(text: string): BusinessModel {
  const lower = ` ${text.toLowerCase()} `

  const recruiterScore = RECRUITER_MODEL_PATTERNS.reduce(
    (n, p) => n + (p.test(lower) ? 1 : 0),
    0,
  )
  const productScore = PRODUCT_MODEL_PATTERNS.reduce(
    (n, p) => n + (p.test(lower) ? 1 : 0),
    0,
  )

  // Recruiter model needs strong signal — a single ambiguous phrase is not
  // enough, because tech founders also talk about "connecting" and "talent".
  if (recruiterScore >= 2) return 'RECRUITER'
  if (recruiterScore >= 1 && productScore === 0) return 'RECRUITER'
  if (productScore >= 1 && recruiterScore === 0) return 'PRODUCT'
  return 'UNKNOWN'
}

// ── Section-aware extraction ────────────────────────────────────────────────

/**
 * Split a pasted LinkedIn profile into named sections so attribution can
 * prefer the identity/About blocks (prospect-owned) over the Activity/Posts
 * blocks (where market commentary lives). Returns sections in order with
 * their rough role.
 *
 * This is heuristic and tolerant of formatting variance — it only needs to
 * separate the profile header + About (high-value prospect ownership) from
 * the long stream of repostable posts (where market commentary accumulates).
 */
export type ProfileSection = {
  name: 'identity' | 'about' | 'posts' | 'experience' | 'education' | 'other'
  text: string
}

const SECTION_HEADERS: Array<{ re: RegExp; name: ProfileSection['name'] }> = [
  { re: /^about$/im, name: 'about' },
  { re: /^activity$/im, name: 'posts' },
  { re: /^(posts|comments|images)$/im, name: 'posts' },
  { re: /^experience$/im, name: 'experience' },
  { re: /^education$/im, name: 'education' },
  { re: /^licenses?\s*&\s*certifications?$/im, name: 'other' },
  { re: /^skills$/im, name: 'other' },
]

export function splitProfileSections(rawText: string): ProfileSection[] {
  const lines = rawText.split(/\r?\n/)
  const sections: ProfileSection[] = []
  let current: ProfileSection = { name: 'identity', text: '' }

  const flush = () => {
    const text = current.text.trim()
    if (text) sections.push({ name: current.name, text })
  }

  for (const line of lines) {
    const header = SECTION_HEADERS.find((h) => h.re.test(line.trim()))
    if (header) {
      flush()
      current = { name: header.name, text: '' }
      continue
    }
    current.text += line + '\n'
  }
  flush()

  return sections
}

export function firstNonEmptyString(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/**
 * Derive the canonical commercial relationship from the classified business
 * model + extracted entities. This is the single source of truth that scoring
 * and strategy consults — it must be computed before either.
 *
 * RECRUITER: the prospect's business is recruiting/career-coaching. They are
 * not a buyer of software delivery, but may be a valuable network contact or
 * channel partner. Their "hiring" content is about their service.
 *
 * POTENTIAL_PARTNER: the prospect is an agency/vendor (could subcontract or
 * partner) — not a direct buyer, but a commercial relationship exists.
 *
 * PEER: a non-decision-making technical individual at another company.
 *
 * POTENTIAL_BUYER: default when the prospect operates a product business and
 * has no disqualifying non-buyer signals.
 */
export function deriveRelationship(
  businessModel: BusinessModel,
  passA: { person: { title: string | null }; company: { name: string | null }; opportunity: { signals: string[] } },
  rawText: string,
): CommercialRelationship {
  if (businessModel === 'RECRUITER') return 'RECRUITER'

  const title = (passA.person.title ?? '').toLowerCase()
  const company = (passA.company.name ?? '').toLowerCase()
  const blob = `${title} ${company} ${rawText}`.toLowerCase()

  // Agency / vendor / dev-shop → potential partner, not buyer
  if (/\b(agency|dev shop|outsourcing|development agency|consulting firm|freelance marketplace)\b/i.test(blob)) {
    return 'POTENTIAL_PARTNER'
  }

  // Non-decision-making individual contributor at a non-product org
  const isIC = /\b(junior|intern|associate|individual contributor)\b/i.test(blob)
  const hasDecisionRole = /\b(ceo|cto|cfo|coo|founder|co[- ]?founder|president|partner|managing director|vp|head of|director|owner|chief)\b/i.test(title)
  if (isIC && !hasDecisionRole) return 'PEER'

  return 'POTENTIAL_BUYER'
}

/**
 * Whether this prospect should be treated as a non-buyer for software
 * delivery. Recruiters, agencies, and peers are not buyers — they may still
 * be worth contacting (networking/partnership) but must not be scored as if
 * they have delivery demand.
 */
export function isNonBuyerRelationship(relationship: CommercialRelationship): boolean {
  return relationship === 'RECRUITER' || relationship === 'POTENTIAL_PARTNER' || relationship === 'PEER'
}
