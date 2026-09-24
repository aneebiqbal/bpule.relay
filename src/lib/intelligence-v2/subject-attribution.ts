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
  | 'SERVICE_PROVIDER' // sells engineering/technical delivery or consulting TO clients (see types.ts BusinessModel for full doc)
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
  /\b(?:build(?:ing|s)?|creat(?:ing|es)?|launch(?:ing|ed)?)\s+(?:a\s+)?(?:new\s+)?(?:product|platform|app|SaaS|service|tool|solution|infrastructure)\b/i,
  /\bour\s+(?:product|platform|app|SaaS|service|tool|solution|infrastructure)\b/i,
  // "we're building X Y Z infrastructure/software/platform..." — allow a
  // bounded run of descriptive words between the verb and the noun, since
  // founders routinely qualify what they build at length ("AI coding
  // collaboration and version-control infrastructure", not just
  // "infrastructure").
  /\bwe(?:'?re)?\s+(?:build(?:ing)?|creat(?:e|ing)?|offer(?:ing)?|provid(?:e|ing)?|deliver(?:ing)?)\s+[\w\s-]{0,80}?\b(?:software|apps?|platforms?|solutions?|products?|infrastructure)\b/i,
  /\btech\s+(?:startup|company)\b/i,
  /\b(?:SaaS|B2B|B2C|D2C)\s+(?:startup|company|platform|product|business)\b/i,
  /\bsoftware\s+(?:company|product|platform|engineering)\b/i,
  /\b(?:seed|series\s+[abc])\s+round\b/i,
  /\braised\s+\$?\d+m\b/i,
  /\bjust\s+closed\s+(?:our|the)\s+(?:seed|series|funding)\b/i,
  // Founder-of-own-product self-introduction: "I'm the founder/CEO of X" +
  // (elsewhere) "platform/tool/solution/app for [customers]". A generic
  // shape covering many founders describing what their OWN company sells —
  // not specific to any one profile's wording. Split into two anchored,
  // linear checks (combined in classifyBusinessModel) rather than one
  // backtracking-prone pattern.
  /\b(?:i'?m|i am)\s+the\s+(?:founder|co-?founder|ceo)\s+(?:and\s+ceo\s+)?of\b/i,
  // Founder-as-seller doing business development / partnership-seeking for
  // their own company — general BD language, not a buying signal.
  /\bopen\s+to\s+partnerships\s+with\b/i,
  // Third-person company-description style, as LinkedIn's "Experience"
  // section renders it ("XHYRE Ltd. is the next generation Global RE Asset
  // Exchange platform...", "Acme is a marketplace for..."): "[Company] is
  // (a|the) [qualifiers] platform/marketplace/exchange/app/product/service".
  // General shape, not tied to any one company name or industry — matches
  // any company-name-shaped token followed by "is a/the ... platform/
  // marketplace/exchange/product/app/service".
  /\b[A-Z][\w.]*\s+(?:ltd\.?|inc\.?|llc)?\s*is\s+(?:a|the|also\s+a)\b[\w\s,-]{0,80}?\b(?:platform|marketplace|exchange|product|app|service|infrastructure)\b/i,
]

// Paired with the "I'm the founder of X" marker above: only counts as a
// product-model signal when the profile ALSO names what that company sells
// as a platform/tool/solution/app/software/product FOR some audience — this
// keeps the check general (any founder + own-product description) without
// matching an unrelated "founder of X" mention with no product description.
const OWN_PRODUCT_FOR_AUDIENCE = /\ban?\s+[\w\s-]{0,40}?\b(?:platform|tool|solution|app|software|product)\b[\w\s-]{0,20}?\bfor\b/i

/**
 * Phrases describing a services / consulting / delivery business — the
 * prospect's company diagnoses or fixes problems FOR OTHER COMPANIES (or a
 * defined customer segment) as its service, rather than building a single
 * product it sells or having the problem itself. General shape covering any
 * founder/consultancy pitching "we assess your X and bring in a team to fix
 * it" — not tied to any one company's wording or vertical (engineering,
 * marketing, security, etc. all qualify). This is the pattern the
 * RECRUITER/PRODUCT split was missing: a services business that talks
 * heavily about its customers' problems is describing what it SELLS them,
 * not a problem it has itself.
 */
const SERVICE_PROVIDER_PATTERNS = [
  /\bpartnerships?\s+with\s+specialized\s+engineering\s+teams?\b/i,
  /\bdrop\s+in\s+the\s+right\s+engineering\s+pod\b/i,
  /\bengineering\s+pods?\s+to\s+(?:drop\s+in|unblock|audit)\b/i,
  /\b(?:architecture|technical)\s+diagnostics?\b/i,
  /\bmap\s+(?:those\s+)?(?:exact\s+)?friction\s+points\b/i,
  /\bwe\s+(?:audit|assess|diagnose)\s+(?:your|clients?'?|customers?'?)\s+(?:architecture|codebase|tech\s+stack|systems?)\b/i,
  /\b(?:it|management|business|strategic)\s+consulting\b/i,
  /\bconsulting\s+(?:firm|services?|partnership)\b/i,
  /\bengineering\s+(?:services|delivery|execution)\s+partner\b/i,
  /\bspecialized\s+engineering\s+(?:teams?|partnerships?)\b/i,
  // General first-person "I/we help [a named customer segment] [do/solve/
  // navigate something]" — the classic services-business self-introduction,
  // independent of vertical. "I work with orthopedic practices that feel
  // they've hit a plateau" and "we help protocols find vulnerabilities" are
  // the same shape: the customer segment named after "help"/"work with" is
  // the one WITH the problem, and the speaker is the one who solves it for
  // them as a service.
  /\b(?:i|we)\s+(?:help|work\s+with|partner\s+with)\s+[\w\s,'-]{0,60}?\b(?:that|who|feel|struggl|navigat|solve|fix|find|overcome)\b/i,
  // "my/our focus is on applying/providing/delivering X (for|to) Y" — a
  // services positioning statement naming what is delivered to a customer.
  /\b(?:my|our)\s+focus\s+is\s+on\s+(?:applying|providing|delivering|offering)\b/i,
]

// A founder/exec doing visible outbound sales/business-development for their
// OWN product — pitching it to customers, seeking partnerships/pilots with
// the kind of organizations that would BUY or co-sell it. This is evidence
// they are a SELLER, not evidence they are shopping for external software
// delivery. General shape (not tied to any one company/industry): "open to
// partnerships with <customer-type>", attending/sponsoring a trade
// conference or roadshow to meet prospective customers, or explicitly
// discussing pilots/collaboration with customer organizations.
const OWN_PRODUCT_SALES_BD_PATTERNS = [
  /\bopen\s+to\s+partnerships\s+with\b/i,
  /\bexplore\s+opportunities\s+for\s+pilots?,?\s+partnerships?\s+and\s+collaboration\b/i,
  /\b(?:roadshow|delegation|pavilion)\b.{0,80}\bmeet(?:ing)?\s+(?:the\s+)?(?:founders?|teams?|clients?|customers?|insurers?|carriers?)\b/i,
  /\bsponsor(?:ing|ed)?\s+(?:the\s+)?[A-Z][\w.]*\s*(?:conference|summit|vegas|expo)\b/i,
]

// A founder actively BUILDING and VALIDATING their own product — customer/
// founder discovery, pre-launch, inviting early access/beta users. This is
// PRODUCT EXECUTION evidence (they are making something and testing it with
// the market), not evidence they are shopping for external engineering
// delivery. General shape, not tied to any one company: talking to
// founders/customers about their workflow/problem, being "close to launch"
// or "pre-launch," and inviting people to try/access the product early.
// Distinct from OWN_PRODUCT_SALES_BD_PATTERNS (post-launch partnership/BD
// outreach to co-sell) — this covers the pre-launch/validation stage, which
// the BD patterns don't recognize at all, leaving founders in this stage to
// fall through to the POTENTIAL_BUYER default.
const OWN_PRODUCT_VALIDATION_PATTERNS = [
  /\btalk(?:ing|ed)?\s+to\s+(?:founders?|customers?|engineering\s+leaders?|users?)\s+(?:about|to\s+understand)\b/i,
  /\bcustomer\s+discovery\b/i,
  /\bfounder\s+(?:conversations?|discovery)\b/i,
  /\b(?:not\s+public\s+yet|pre[- ]?launch|close\s+to\s+launch)\b.{0,60}\b(?:we'?re|i'?m)\s+(?:close|building)\b/i,
  /\b(?:we'?re|i'?m)\s+(?:not\s+public\s+yet|pre[- ]?launch|close\s+to\s+launch)\b/i,
  /\b(?:get|request)\s+early\s+access\b/i,
  /\binvit(?:e|ing)\s+(?:you|people|builders?)\s+to\s+(?:get|try|access)\b/i,
  /\b(?:validating|validated)\s+(?:the\s+)?(?:problem|idea|hypothesis)\b/i,
]

/**
 * Whether the text shows the prospect themselves seeking to BUY/commission
 * external software delivery (as opposed to selling their own product). A
 * founder who both sells a product AND separately says they need engineering
 * help/a dev partner is still a real buyer signal — this only exists to stop
 * "founder + product + partnership-with-customers language" from defaulting
 * to POTENTIAL_BUYER when there is no such buyer-seeking language at all.
 */
function hasExternalDeliverySeekingSignal(blob: string): boolean {
  return /\b(?:looking\s+for|need|hiring|seeking)\s+(?:a\s+)?(?:dev(?:elopment)?\s+(?:shop|agency|partner|team)|external\s+(?:developer|engineer|dev\s+team)|software\s+(?:vendor|contractor|agency))\b/i.test(blob)
    || /\bwe\s+(?:need|are\s+looking\s+for|want\s+to\s+hire)\s+(?:an?\s+)?(?:agency|contractor|freelancer|dev\s+shop)\b/i.test(blob)
}

export function classifyBusinessModel(text: string): BusinessModel {
  const lower = ` ${text.toLowerCase()} `

  const recruiterScore = RECRUITER_MODEL_PATTERNS.reduce(
    (n, p) => n + (p.test(lower) ? 1 : 0),
    0,
  )
  let productScore = PRODUCT_MODEL_PATTERNS.reduce(
    (n, p) => n + (p.test(lower) ? 1 : 0),
    0,
  )
  const serviceProviderScore = SERVICE_PROVIDER_PATTERNS.reduce(
    (n, p) => n + (p.test(lower) ? 1 : 0),
    0,
  )
  // "I'm the founder of X" only counts toward product-model when the same
  // text also describes what X sells as a platform/tool/product FOR an
  // audience — otherwise a bare "founder of X" (with no product description
  // at all) is too weak a signal on its own.
  if (/\b(?:i'?m|i am)\s+the\s+(?:founder|co-?founder|ceo)\s+(?:and\s+ceo\s+)?of\b/i.test(lower) && OWN_PRODUCT_FOR_AUDIENCE.test(lower)) {
    productScore += 1
  }

  // Recruiter model needs strong signal — a single ambiguous phrase is not
  // enough, because tech founders also talk about "connecting" and "talent".
  if (recruiterScore >= 2) return 'RECRUITER'
  if (recruiterScore >= 1 && productScore === 0) return 'RECRUITER'
  // Service-provider needs a similarly strong signal, and must not fire
  // alongside genuine product-model evidence (a SaaS founder who mentions
  // "consulting" once in passing is still a product company).
  if (serviceProviderScore >= 2) return 'SERVICE_PROVIDER'
  if (serviceProviderScore >= 1 && productScore === 0 && recruiterScore === 0) return 'SERVICE_PROVIDER'
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
 * NETWORKING: a founder/exec who is visibly selling/doing business
 * development for their OWN product (open to partnerships with customers,
 * attending trade events to meet prospective customers) with no evidence
 * they are ALSO seeking to buy external software delivery. Worth a real
 * connection — a commercial relationship may develop — but must not be
 * scored as if they currently have BPulse delivery demand just because they
 * are a decision-maker at a product company.
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
  // A company that SELLS engineering/technical delivery/consulting services
  // is a potential partner (they could subcontract, co-deliver, or refer
  // work), never a straightforward buyer — their architecture/technical-debt
  // language describes what they diagnose and fix FOR CLIENTS, not a
  // problem their own company has. See SERVICE_PROVIDER_PATTERNS.
  if (businessModel === 'SERVICE_PROVIDER') return 'POTENTIAL_PARTNER'

  const title = (passA.person.title ?? '').toLowerCase()
  const company = (passA.company.name ?? '').toLowerCase()
  const blob = `${title} ${company} ${rawText}`.toLowerCase()

  // Agency / vendor / dev-shop → potential partner, not buyer. Bare "agency"
  // is too broad on its own — it matches "Donor Agency", "Implementing
  // Agency", government/NGO stakeholder mentions with no commercial-services
  // meaning at all (see Mansur/XHYRE, a former government e-procurement
  // project naming "Donor Agency" as a meeting stakeholder). Require the
  // word to appear in a services/delivery framing (a marketing/development/
  // creative/dev-shop agency, or "agency" paired with client/customer
  // language), not just anywhere in the text.
  if (/\b(?:dev shop|outsourcing|development agency|marketing agency|creative agency|digital agency|consulting firm|freelance marketplace)\b/i.test(blob)
    || /\bagency\b.{0,40}\b(?:clients?|customers?)\b/i.test(blob)
    || /\b(?:clients?|customers?)\b.{0,40}\bagency\b/i.test(blob)) {
    return 'POTENTIAL_PARTNER'
  }

  // Non-decision-making individual contributor at a non-product org
  const isIC = /\b(junior|intern|associate|individual contributor)\b/i.test(blob)
  const hasDecisionRole = /\b(ceo|cto|cfo|coo|founder|co[- ]?founder|president|partner|managing director|vp|head of|director|owner|chief)\b/i.test(title)
  if (isIC && !hasDecisionRole) return 'PEER'

  // Founder/exec of a product business, visibly selling/doing BD for that
  // product to customers, with no sign they are also shopping for external
  // delivery help. Check BD/sales-outbound language before defaulting a
  // decision-maker at a product company to POTENTIAL_BUYER — otherwise every
  // founder who mentions "partnerships" becomes a buyer signal for BPulse.
  if (
    businessModel === 'PRODUCT'
    && OWN_PRODUCT_SALES_BD_PATTERNS.some((p) => p.test(blob))
    && !hasExternalDeliverySeekingSignal(blob)
  ) {
    return 'NETWORKING'
  }

  // Founder/exec actively BUILDING and VALIDATING their own product
  // (customer discovery, pre-launch, inviting early access) with no sign
  // they are also shopping for external delivery help. Same non-buyer
  // category as the BD/partnership case above — active product execution is
  // not evidence of buyer demand for BPulse, regardless of how much
  // engineering/technical language surrounds it.
  if (
    businessModel === 'PRODUCT'
    && OWN_PRODUCT_VALIDATION_PATTERNS.some((p) => p.test(blob))
    && !hasExternalDeliverySeekingSignal(blob)
  ) {
    return 'NETWORKING'
  }

  // Decision-maker (founder/CTO/CEO/etc.) at their OWN current product
  // company, with no explicit sign they are shopping for external software
  // delivery AND no independently-detected buyer/hiring opportunity signal.
  // Running/leading a product business is not, on its own, buyer evidence
  // for BPulse — a technical decision-maker is not automatically an active
  // buyer (see Mansur/XHYRE: a CTO's own current company being a product
  // platform, with zero external-delivery-seeking language, must not
  // default to POTENTIAL_BUYER just because no other non-buyer pattern
  // matched). This is the general fallback for the many profiles that
  // describe their OWN company in third person (a LinkedIn "Experience"
  // section) rather than in the first-person "we're building X" phrasing
  // PRODUCT_MODEL_PATTERNS also matches.
  //
  // Must NOT fire when a real buyer/hiring opportunity signal already exists
  // (hiring, hiring_pressure, freelance_project_need, technical_problem,
  // explicit_ask) — a founder/CTO who is ALSO explicitly hiring engineers or
  // stating a technical need IS a real buyer signal (see Abdul Hakim/
  // Fullscript: "Hiring senior fullstack engineers", "looking for senior
  // fullstack engineers" — a decision-maker with an explicit hiring ask,
  // not mere product-company leadership).
  const hasBuyerOpportunitySignal = (passA.opportunity.signals as string[]).some((s) =>
    ['hiring', 'hiring_pressure', 'freelance_project_need', 'technical_problem', 'explicit_ask'].includes(s),
  )
  if (
    businessModel === 'PRODUCT'
    && hasDecisionRole
    && !hasExternalDeliverySeekingSignal(blob)
    && !hasBuyerOpportunitySignal
  ) {
    return 'NETWORKING'
  }

  return 'POTENTIAL_BUYER'
}

/**
 * Whether this prospect should be treated as a non-buyer for software
 * delivery. Recruiters, agencies, peers, and networking contacts are not
 * buyers — they may still be worth contacting (networking/partnership) but
 * must not be scored as if they have delivery demand.
 */
export function isNonBuyerRelationship(relationship: CommercialRelationship): boolean {
  return relationship === 'RECRUITER' || relationship === 'POTENTIAL_PARTNER' || relationship === 'PEER' || relationship === 'NETWORKING'
}

// ── Repost / third-party-authorship scoping ─────────────────────────────────

/**
 * Pasted LinkedIn activity feeds interleave the prospect's OWN posts with
 * REPOSTS of other people's posts (and, on a repost, the reposted author's
 * bio/title/company line). Each post/repost block in the paste is preceded
 * by a "View <Name>'s profile" line naming who AUTHORED that specific block.
 * Without this scoping, a third party's post — their meeting locations,
 * their employer, their "in person" language, their opinions — gets
 * attributed to the prospect simply because it appears inside the
 * prospect's pasted activity feed.
 *
 * This function removes any block whose "View <Name>'s profile" author is
 * NOT the prospect (name match, case-insensitive), so downstream extraction
 * (signals, remote eligibility, location) only ever sees content the
 * prospect actually authored (plus any text with no attributable "View ...
 * profile" marker at all, e.g. the profile header/About section, which is
 * kept as prospect-owned by default).
 */
export function stripThirdPartyRepostBlocks(rawText: string, prospectName: string | null): string {
  if (!prospectName?.trim()) return rawText

  // English possessive: names not ending in "s" get 's ("Kobi Bendelak's
  // profile"), names already ending in "s" get a bare trailing apostrophe
  // ("Saar Meents' profile") — LinkedIn renders both forms depending on the
  // author's name, so both must match or every block under a name ending in
  // "s" (including the prospect's own) is misread as unattributed content.
  //
  // LinkedIn renders TWO kinds of attribution marker before a repost block:
  //   "View <Person>'s profile"  (person repost) and
  //   "View company: <Company>"   (company/organization repost).
  // Both must be treated as third-party content and stripped unless the
  // author IS the prospect. A Pendo product-launch post reposted by Mick
  // Cunningham (RALCO) must never become RALCO buying evidence.
  // LinkedIn exports use Unicode smart quotes (’ U+2019) for possessives,
  // not ASCII apostrophes ('). Match both so "Brian Maccaba's profile"
  // and "Brian Maccaba's profile" both match.
  const VIEW_PROFILE_RE = /^View (.+?)['\u2019]s?\s+profile$/i
  const VIEW_COMPANY_RE = /^View company:\s*(.+)$/i
  // A profile-section header (Experience/Education/Skills/etc.) always marks
  // the start of the prospect's OWN structured data — it can never appear
  // inside someone else's reposted post. Without ending any active repost
  // skip here, a trailing repost block with no closing "View <prospect>'s
  // profile" marker (i.e. the Activity feed simply ends mid-skip on the last
  // OTHER person's repost) silently swallows the entire Experience section
  // that follows, since nothing ever flips `skipping` back off.
  const SECTION_HEADER_RE = /^(?:experience|education|licenses?\s*&\s*certifications?|skills|volunteering|interests|projects|publications|honors?\s*&\s*awards?|recommendations)$/i
  const lines = rawText.split(/\r?\n/)
  const normalizedProspect = prospectName.trim().toLowerCase()

  const kept: string[] = []
  let skipping = false

  for (const line of lines) {
    const trimmed = line.trim()
    const profileMatch = VIEW_PROFILE_RE.exec(trimmed)
    const companyMatch = VIEW_COMPANY_RE.exec(trimmed)
    if (profileMatch || companyMatch) {
      const author = (profileMatch?.[1] ?? companyMatch?.[1] ?? '').trim().toLowerCase()
      // A block belongs to the prospect only if the named author IS the
      // prospect (person) — company pages are ALWAYS third-party reposts from
      // the prospect's perspective (a person reposting a company's post is
      // sharing someone else's content, not their own).
      skipping = companyMatch ? true : author !== normalizedProspect
      // Drop the attribution marker line itself either way — it is
      // navigation chrome, not content.
      continue
    }
    if (SECTION_HEADER_RE.test(trimmed)) {
      skipping = false
    }
    if (!skipping) kept.push(line)
  }

  return kept.join('\n')
}
