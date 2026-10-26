/**
 * Buyer request plan — the canonical structured layer for REL-QA-009.
 *
 * A reply must not be generated first and inspected afterward. Every buyer
 * request in the client's message is extracted into a typed plan BEFORE
 * generation, the generator is handed that plan, and the draft is mapped back
 * to it afterward. Any explicit request that is not answered, acknowledged as
 * needing verification, or clarified is a blocker.
 *
 * This module is the only place a buyer request is classified. The keyword
 * gate in `buyer-questions.ts` is an adapter over it, so there is no second
 * implementation to drift.
 */

// ── Taxonomy ────────────────────────────────────────────────────────────────

export type BuyerRequestType =
  | 'EXPERIENCE'
  | 'CASE_STUDY'
  | 'TECHNICAL_APPROACH'
  | 'DELIVERY_TIMELINE'
  | 'START_DATE'
  | 'TEAM_AVAILABILITY'
  | 'MEETING_AVAILABILITY'
  | 'PRICING'
  | 'BUDGET'
  | 'RATE'
  | 'ESTIMATE'
  | 'PROPOSAL'
  | 'SCOPE'
  | 'TEAM_SIZE'
  | 'LOCATION'
  | 'TIMEZONE'
  | 'SECURITY'
  | 'COMPLIANCE'
  | 'NDA'
  | 'INTEGRATION'
  | 'TECH_STACK'
  | 'SUPPORT'
  | 'REFERENCES'
  | 'NEXT_STEP'

export type BuyerRequestActor = 'BUYER' | 'THIRD_PARTY'

/**
 * Where an answer may come from.
 *
 * `UNSAFE_TO_INVENT` is the important one: a meeting or calendar slot cannot be
 * answered from profile, proof or project facts, because Relay holds no calendar
 * for the rep. The reply may offer to coordinate; it must never name a slot.
 */
export type BuyerRequestAnswerability =
  | 'ANSWER_FROM_PROOF'
  | 'ANSWER_FROM_PROFILE'
  | 'ANSWER_FROM_PROJECT_FACTS'
  | 'NEEDS_HUMAN_VERIFICATION'
  | 'ASK_CLIENT'
  | 'UNSAFE_TO_INVENT'

export interface BuyerRequest {
  type: BuyerRequestType
  /** The request as the buyer wrote it (single clause). */
  quote: string
  /** 0..1: how confident the classifier is that this is a live buyer request. */
  confidence: number
  actor: BuyerRequestActor
  answerability: BuyerRequestAnswerability
}

// ── Detectors ───────────────────────────────────────────────────────────────

interface Detector {
  type: BuyerRequestType
  pattern: RegExp
  /** Minimum confidence for this detector (specific phrasing beats generic). */
  confidence: number
}

/**
 * Ordered: the first match wins. Specific detectors precede generic ones so
 * "when could your team start" is a START_DATE, not a DELIVERY_TIMELINE.
 */
const DETECTORS: readonly Detector[] = [
  { type: 'MEETING_AVAILABILITY', pattern: /\b(are you|would you|could you|can you)\b.{0,40}\b(free|available|around|speak|talk|call|meet|jump on)\b|\b(speak|talk|call|meet)\b.{0,30}\b(sometime|next week|this week|tomorrow|monday|tuesday|wednesday|thursday|friday)\b|\b(schedule|book)\b.{0,20}\b(a |a call|time|meeting)\b|\bavailab\w*\b.{0,25}\b(next week|this week|tomorrow|sometime)\b/i, confidence: 0.9 },
  { type: 'START_DATE', pattern: /\b(start|begin|kick ?off|onboard)\b.{0,30}\b(next week|next month|this week|january|february|march|april|may|june|july|august|september|october|november|december|asap|immediately|right away)\b|\bwhen (could|can|would) (you|your team|you all)\b.{0,20}\b(start|begin)\b|\bhow soon\b/i, confidence: 0.9 },
  { type: 'TEAM_AVAILABILITY', pattern: /\b(team|who|which|capacity|resourcing|headcount|people)\b.{0,40}\b(availab\w*|free|dedicat\w*|assigned)\b|\b(is|are) (your )?team\b.{0,30}\b(availab\w*|free)\b|\bcapacity\b|\bdedicat\w*\b/i, confidence: 0.85 },
  { type: 'DELIVERY_TIMELINE', pattern: /\b(how long|timeline|turn ?around|delivery|time to (market|launch|live)|get this live|go live|launch date|deadline|roll ?out|duration|how quickly|how fast)\b/i, confidence: 0.85 },
  { type: 'ESTIMATE', pattern: /\b(estimate|ballpark|rough (number|figure|range)|approximate|what would it (take|cost))\b/i, confidence: 0.85 },
  { type: 'RATE', pattern: /\b(rate|hourly|per hour|\/hr|\bhr\b|day rate|daily rate|monthly rate)\b/i, confidence: 0.8 },
  { type: 'PRICING', pattern: /\b(price|pricing|cost|how much|quote|investment|fee|charge)\b/i, confidence: 0.85 },
  { type: 'BUDGET', pattern: /\b(budget|what kind of budget|how much (are you|would you) (willing|looking) to (spend|invest))\b/i, confidence: 0.85 },
  { type: 'PROPOSAL', pattern: /\b(proposal|formal (proposal|quote|document|something)|send (something|over|us) (formal|official)|rfp|statement of work|\bsow\b)\b/i, confidence: 0.9 },
  { type: 'CASE_STUDY', pattern: /\b(case studi?e?s?|similar projects?|relevant projects?|past projects?|previous (projects?|work)|built (anything|something) (similar|like this)|done this before|shipped|portfolio)\b/i, confidence: 0.9 },
  { type: 'REFERENCES', pattern: /\b(references?|testimonials?|client list|who else|past clients)\b/i, confidence: 0.9 },
  { type: 'EXPERIENCE', pattern: /\b(experience|worked with|relevant|background|track record|handled|migration|before)\b/i, confidence: 0.7 },
  { type: 'TECHNICAL_APPROACH', pattern: /\b(approach|methodology|how (do|would) you (build|work|approach)|process|architecture|how you would)\b/i, confidence: 0.8 },
  { type: 'INTEGRATION', pattern: /\b(integrat|connect to|hook into|api access|salesforce|netsuite|hubspot|sap)\b/i, confidence: 0.85 },
  { type: 'TECH_STACK', pattern: /\b(tech stack|stack|framework|language|react|node|python|typescript|postgres|aws|django|rails)\b/i, confidence: 0.8 },
  { type: 'SECURITY', pattern: /\b(security|soc ?2|iso ?27001|pen ?test|vulnerability|encryption)\b/i, confidence: 0.85 },
  { type: 'COMPLIANCE', pattern: /\b(compliance|regulat|audit|certif|pci|fedramp|accessibility|wcag|gdpr|hipaa)\b/i, confidence: 0.85 },
  { type: 'NDA', pattern: /\b(nda|non[- ]disclosure|confidentiality|confidential)\b/i, confidence: 0.9 },
  { type: 'SCOPE', pattern: /\b(scope|what'?s included|deliverables|out of scope|requirements|spec)\b/i, confidence: 0.8 },
  { type: 'TEAM_SIZE', pattern: /\b(how many (people|developers|engineers)|team size|headcount|who would (work|be on))\b/i, confidence: 0.85 },
  { type: 'TIMEZONE', pattern: /\b(time ?zone|gmt|est|pst|utc|overlap hours|working hours)\b/i, confidence: 0.9 },
  { type: 'LOCATION', pattern: /\b(where (are you|is your team)|location|on[- ]site|onsite|remote|hybrid|which country)\b/i, confidence: 0.8 },
  { type: 'SUPPORT', pattern: /\b(support|maintenance|warranty|sla|bug fix|post[- ]launch|after launch)\b/i, confidence: 0.85 },
  { type: 'NEXT_STEP', pattern: /\b(next steps?|what happens next|how do we (proceed|move forward|start)|follow[- ]?up|call to (discuss|talk))\b/i, confidence: 0.85 },
]

/** A request with no question marker and no implicit-ask phrasing is not a request. */
const REQUEST_MARKER = /\?|\b(can you|could you|do you|would you|what|how|when|where|are you|have you|is it|we'?d love to|i'?d like to|please (share|send)|share|send (us |over )?(some|your|the)|let us know|curious whether|would be useful to understand|interested to (know|understand))\b/i

const THIRD_PARTY_MARKER = /\b(they|their team|the client|our client|the customer|my client|the founder|the hiring manager)\b/i

// ── Extraction ──────────────────────────────────────────────────────────────

/**
 * Split a message into clauses. Sentences split on their terminator; within a
 * sentence a compound ask ("case studies, and how long would it take?") splits
 * on ", and" / "; also" / " and" so each request is its own clause. The
 * sentence's marker is carried with each clause so a list member
 * ("...expected timeline, and availability next week.") still counts.
 */
function splitClauses(text: string): Array<{ clause: string; sentenceHasMarker: boolean }> {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const out: Array<{ clause: string; sentenceHasMarker: boolean }> = []
  for (const sentence of sentences) {
    const sentenceHasMarker = REQUEST_MARKER.test(sentence)
    const parts = sentence
      .split(/[,;]\s*(?:and|plus|also)\s+|[,;]\s*|\s+(?:and|plus|also)\s+/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 3)
    for (const clause of parts) out.push({ clause, sentenceHasMarker })
  }
  return out
}

/**
 * Every explicit buyer request in a client message, typed, quoted, and
 * classified for answerability. Deterministic; no model, no reply.
 */
export function extractBuyerRequests(text: string): BuyerRequest[] {
  if (!text || !text.trim()) return []
  const requests: BuyerRequest[] = []
  for (const { clause, sentenceHasMarker } of splitClauses(text)) {
    const detector = DETECTORS.find((d) => d.pattern.test(clause))
    if (!detector) continue
    // A clause is a request when it carries its own marker, or when it is one
    // member of a compound ask whose sentence does.
    if (!REQUEST_MARKER.test(clause) && !sentenceHasMarker) continue
    requests.push({
      type: detector.type,
      quote: clause,
      confidence: detector.confidence,
      actor: THIRD_PARTY_MARKER.test(clause) ? 'THIRD_PARTY' : 'BUYER',
      answerability: answerabilityFor(detector.type),
    })
  }
  // A compound list can repeat a type ("React and Node", "Salesforce and
  // NetSuite"); one request per type is enough to gate the reply.
  const byType = new Map<BuyerRequestType, BuyerRequest>()
  for (const request of requests) {
    const existing = byType.get(request.type)
    if (!existing || request.confidence > existing.confidence) byType.set(request.type, request)
  }
  return [...byType.values()]
}

/**
 * Where the answer may come from for a request type. Calendar-backed types are
 * `UNSAFE_TO_INVENT` because Relay holds no rep calendar.
 */
export function answerabilityFor(type: BuyerRequestType): BuyerRequestAnswerability {
  switch (type) {
    case 'MEETING_AVAILABILITY':
    case 'TEAM_AVAILABILITY':
    case 'START_DATE':
      return 'UNSAFE_TO_INVENT'
    case 'PRICING':
    case 'RATE':
    case 'ESTIMATE':
    case 'BUDGET':
    case 'DELIVERY_TIMELINE':
    case 'SCOPE':
      return 'ANSWER_FROM_PROJECT_FACTS'
    case 'TEAM_SIZE':
    case 'LOCATION':
    case 'TIMEZONE':
    case 'SUPPORT':
      return 'ANSWER_FROM_PROFILE'
    case 'EXPERIENCE':
    case 'CASE_STUDY':
    case 'REFERENCES':
    case 'TECHNICAL_APPROACH':
    case 'TECH_STACK':
    case 'INTEGRATION':
    case 'SECURITY':
    case 'COMPLIANCE':
    case 'NDA':
    case 'PROPOSAL':
      return 'ANSWER_FROM_PROOF'
    case 'NEXT_STEP':
      return 'ASK_CLIENT'
  }
}

// ── Reply plan ──────────────────────────────────────────────────────────────

export interface ReplyPlan {
  buyerRequests: BuyerRequest[]
  /** Requests that must be answered for the reply to be complete. */
  requiredAnswers: BuyerRequest[]
  /** Requests that cannot be answered and must be acknowledged or clarified. */
  unresolvedRequests: BuyerRequest[]
  /** Proof the reply may lean on (filled by the caller). */
  verifiedProof: string[]
  /** Claims the reply must never make (calendar slots, invented facts). */
  prohibitedClaims: string[]
  /** The single call to action the reply should land on. */
  cta: string
}

export interface ReplyPlanContext {
  verifiedProof?: readonly string[]
  cta?: string
}

/**
 * The plan the generator consumes. Built BEFORE generation; the generator does
 * not re-read the raw client text to decide what to answer.
 */
export function buildReplyPlan(requests: readonly BuyerRequest[], ctx: ReplyPlanContext = {}): ReplyPlan {
  const requiredAnswers = requests.filter((r) => r.answerability !== 'UNSAFE_TO_INVENT')
  const unresolvedRequests = requests.filter((r) => r.answerability === 'UNSAFE_TO_INVENT')
  return {
    buyerRequests: [...requests],
    requiredAnswers,
    unresolvedRequests,
    verifiedProof: [...(ctx.verifiedProof ?? [])],
    prohibitedClaims: buildProhibitedClaims(unresolvedRequests),
    cta: ctx.cta ?? 'Offer to coordinate a time that suits them.',
  }
}

function buildProhibitedClaims(unresolved: readonly BuyerRequest[]): string[] {
  const claims: string[] = []
  for (const r of unresolved) {
    if (r.type === 'MEETING_AVAILABILITY') claims.push('A specific meeting day or time')
    if (r.type === 'TEAM_AVAILABILITY') claims.push('A specific start date or guaranteed capacity')
    if (r.type === 'START_DATE') claims.push('A specific start date')
  }
  return [...new Set(claims)]
}

// ── Coverage ────────────────────────────────────────────────────────────────

export type RequestCoverageStatus = 'ANSWERED' | 'ACKNOWLEDGED_NEEDS_VERIFICATION' | 'CLARIFIED' | 'UNANSWERED'

/** Words that satisfy a request type. `UNSAFE_TO_INVENT` types accept a hedge. */
const COVERAGE_KEYWORDS: Record<BuyerRequestType, readonly string[]> = {
  EXPERIENCE: ['experience', 'worked', 'portfolio', 'case stud', 'project', 'client', 'built', 'delivered', 'similar', 'like this', 'before', 'shipped'],
  CASE_STUDY: ['case stud', 'similar project', 'relevant project', 'past project', 'previous work', 'portfolio', 'example', 'built', 'delivered', 'similar', 'shipped', 'like this', 'before'],
  TECHNICAL_APPROACH: ['approach', 'process', 'workflow', 'methodology', 'architecture', 'step', 'sprint', 'discovery', 'how we build'],
  DELIVERY_TIMELINE: ['week', 'weeks', 'month', 'months', 'timeline', 'deliver', 'estimate', 'start', 'phase', 'schedule', 'long', 'live'],
  START_DATE: ['start', 'coordinate', 'week', 'month', 'schedule', 'kick off'],
  TEAM_AVAILABILITY: ['availab', 'capacity', 'team', 'coordinate', 'schedule', 'window'],
  MEETING_AVAILABILITY: ['coordinate', 'schedule', 'time next week', 'window', 'calendar', 'offer', 'suits you'],
  PRICING: ['price', 'pricing', 'cost', 'rate', 'budget', 'quote', 'investment', 'fee', 'ballpark'],
  BUDGET: ['budget', 'invest', 'spend', 'range', 'depends on scope'],
  RATE: ['rate', 'per hour', '/hr', 'hourly', 'day rate'],
  ESTIMATE: ['estimate', 'ballpark', 'rough', 'depends on scope', 'range'],
  PROPOSAL: ['proposal', 'send over', 'share', 'formal', 'document', 'follow up with'],
  SCOPE: ['scope', 'include', 'deliverable', 'requirement', 'out of scope'],
  TEAM_SIZE: ['team', 'developer', 'designer', 'engineer', 'specialist', 'who works', 'people'],
  LOCATION: ['remote', 'hybrid', 'on-site', 'location', 'based in'],
  TIMEZONE: ['timezone', 'time zone', 'gmt', 'est', 'pst', 'utc', 'overlap', 'hours'],
  SECURITY: ['security', 'soc 2', 'soc2', 'iso', 'gdpr', 'hipaa', 'encryption', 'pen test'],
  COMPLIANCE: ['compliance', 'regulat', 'audit', 'certif', 'pci', 'wcag', 'accessibility'],
  NDA: ['nda', 'non-disclosure', 'confidential'],
  INTEGRATION: ['integrat', 'connect', 'api', 'salesforce', 'netsuite', 'hubspot'],
  TECH_STACK: ['react', 'node', 'python', 'typescript', 'stack', 'framework', 'postgres', 'aws', 'django', 'rails'],
  SUPPORT: ['support', 'maintenance', 'warranty', 'sla', 'bug fix', 'after launch'],
  REFERENCES: ['reference', 'testimonial', 'client', 'past clients'],
  NEXT_STEP: ['next step', 'call', 'coordinate', 'follow up', 'schedule'],
}

const CLARIFICATION_MARKER = /\?|\b(what|which|when|how many|could you clarify|can you clarify|what scope|what budget)\b/i

export interface RequestCoverage {
  request: BuyerRequest
  status: RequestCoverageStatus
}

export interface ReplyPlanCoverage {
  total: number
  answered: number
  covered: number
  /** covered / total; 1 when there are no requests. */
  ratio: number
  complete: boolean
  coverage: RequestCoverage[]
}

/**
 * Map the generated draft back to the plan. Every request must be ANSWERED,
 * ACKNOWLEDGED_NEEDS_VERIFICATION, or CLARIFIED. A calendar-backed request is
 * satisfied by offering to coordinate, never by naming a slot.
 */
export function assessReplyPlan(plan: ReplyPlan, draftText: string): ReplyPlanCoverage {
  const draft = (draftText ?? '').toLowerCase()
  const clarifying = CLARIFICATION_MARKER.test(draft)
  const coverage = plan.buyerRequests.map((request) => {
    const keywords = COVERAGE_KEYWORDS[request.type] ?? []
    if (keywords.some((k) => draft.includes(k))) {
      return { request, status: 'ANSWERED' as const }
    }
    // Asking the buyer back is acceptable only when the draft engages this
    // specific request — one unrelated question must not cover them all.
    const words = request.quote.toLowerCase().split(/\W+/).filter((w) => w.length >= 5)
    if (clarifying && words.some((w) => draft.includes(w))) {
      return { request, status: 'CLARIFIED' as const }
    }
    // An UNSAFE_TO_INVENT request that is not answered is acknowledged, not a
    // fabrication, when the draft offers to coordinate instead of naming a slot.
    if (request.answerability === 'UNSAFE_TO_INVENT' && /coordinat|schedule a time|offer|what works|suits you/.test(draft)) {
      return { request, status: 'ACKNOWLEDGED_NEEDS_VERIFICATION' as const }
    }
    return { request, status: 'UNANSWERED' as const }
  })
  const total = coverage.length
  const answered = coverage.filter((c) => c.status === 'ANSWERED').length
  const covered = coverage.filter((c) => c.status !== 'UNANSWERED').length
  const ratio = total === 0 ? 1 : covered / total
  return { total, answered, covered, ratio, complete: total === 0 || covered === total, coverage }
}

// ── Message quality decision ────────────────────────────────────────────────

export interface MessageQualityDecision {
  sendable: boolean
  blockers: string[]
  warnings: string[]
  questionCoverage: number
  unsupportedClaims: string[]
}

/**
 * The single sendability decision. The UI consumes this object; it must not
 * decide sendability on its own.
 */
export function decideMessageQuality(
  coverage: ReplyPlanCoverage,
  options: { inventedAvailability?: boolean; unsupportedClaims?: readonly string[] } = {},
): MessageQualityDecision {
  const blockers: string[] = []
  const warnings: string[] = []
  const unsupportedClaims = [...(options.unsupportedClaims ?? [])]

  if (!coverage.complete) {
    const missed = coverage.coverage.filter((c) => c.status === 'UNANSWERED').map((c) => c.request.quote)
    blockers.push(`Unanswered buyer request(s): ${missed.join(' | ')}`)
  }
  if (options.inventedAvailability) {
    blockers.push('The draft invents a calendar slot. Offer to coordinate instead.')
  }
  if (unsupportedClaims.length > 0) {
    blockers.push(`Unsupported claim(s): ${unsupportedClaims.join(' | ')}`)
  }

  return {
    sendable: blockers.length === 0,
    blockers,
    warnings,
    questionCoverage: coverage.ratio,
    unsupportedClaims,
  }
}

/** True when the draft proposes a specific day/time slot. Never calendar-backed. */
export function hasInventedAvailability(draftText: string): boolean {
  const draft = (draftText ?? '').toLowerCase()
  return /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.{0,20}\b(at\s+)?\d{1,2}(:\d{2})?\s?(am|pm)\b|\b(at\s+)?\d{1,2}(:\d{2})?\s?(am|pm)\b.{0,20}\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bnext\s+(monday|tuesday|wednesday|thursday|friday)\s+at\b|\bhow about\s+(monday|tuesday|wednesday|thursday|friday)\b/i.test(draft)
}
