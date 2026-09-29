/**
 * Need Ownership Classification — Phase 3
 *
 * Every problem/need statement must identify WHO owns the need.
 *
 * Examples:
 * - "I help companies hire engineers" → SERVICE_OFFERING (they sell this)
 * - "Our customers struggle with deployment" → CUSTOMER_NEED (their clients' problem)
 * - "We're hiring backend engineers" → SELF_NEED (their own company)
 * - "Currency exchange is difficult in emerging markets" → MARKET_PROBLEM (industry-level)
 * - "Our deployment pipeline is slow" → PRODUCT_PROBLEM (their own product)
 *
 * Only SELF_NEED or EMPLOYER_NEED should materially increase buyer intent.
 */

import type { NeedOwnership } from './types'

// Service offering patterns — the prospect describes services they PROVIDE
const SERVICE_OFFERING_PATTERNS: RegExp[] = [
  /\bi help (?:companies|businesses|teams|founders|people|startups)\b/i,
  /\bwe help (?:companies|businesses|teams|founders|clients|startups)\b/i,
  /\bwe (?:provide|offer|deliver|build|develop) (?:for|to) (?:clients|companies|businesses)\b/i,
  /\bbuilding .{0,40} (?:for|to) (?:clients|companies|businesses|startups)\b/i,
  /\bour (?:service|solution|offering) (?:for|helps?|enables?)\b/i,
  /\bwe (?:specialize|focus|work) (?:in|on) (?:helping|serving|supporting)\b/i,
  /\bwe(?:'re| are) (?:a|an) (?:consulting|development|engineering|design|agency) (?:company|firm|business)\b/i,
  /\bcoaching (?:clients|candidates|professionals)\b/i,
  /\bplacing (?:candidates|talent|engineers)\b/i,
  /\bI (?:consult|advise|guide|mentor|coach|partner with)\b/i,
  /\bwe (?:consult|advise|guide|mentor|partner with)\b/i,
  /\bmy (?:service|practice|business|agency)\b/i,
  /\bfor (?:my|our) (?:clients?|customers?)\b/i,
  /\bI (?:am|'m) (?:a |an )?(?:fractional|consulting|advisory)\b/i,
  /\bpartner with (?:companies|businesses|clients|founders|startups)\b/i,
  /\bhelping (?:startups|companies|founders|businesses) (?:accelerate|scale|build|modernize|launch)\b/i,
  /\bI (?:specialize|focus) (?:in|on) (?:helping|serving|advising)\b/i,
  /\bI (?:am|'m) (?:a |an )?(?:CTO|chief technology)\b/i,
]

// Customer need patterns — the prospect's customers have the problem
const CUSTOMER_NEED_PATTERNS: RegExp[] = [
  /\bour (?:clients?|customers?) (?:struggle|face|have|deal with|encounter)\b/i,
  /\bmy (?:clients?|customers?) (?:need|want|ask|require)\b/i,
  /\bfor (?:our|my) (?:clients?|customers?)\b.{0,40}\b(?:struggle|challenge|problem|pain)\b/i,
  /\bhelping (?:clients?|customers?|businesses|companies)\b.{0,40}\b(?:overcome|solve|address|tackle)\b/i,
]

// Market problem patterns — industry/market-level problems
const MARKET_PROBLEM_PATTERNS: RegExp[] = [
  /\bthe (?:market|industry|sector) (?:is|has|faces?|struggles?)\b/i,
  /\b(?:globally|worldwide|across (?:the|all) (?:industries|markets|sectors))\b/i,
  /\bemerging markets\b.{0,40}\b(?:challenge|problem|difficult|hard)\b/i,
  /\bcompanies (?:across|in) (?:the|all)\b.{0,40}\b(?:struggle|face|challenge)\b/i,
  /\bindustry\b.{0,40}\b(?:challenge|problem|issue|gap)\b/i,
]

// Self need patterns — the prospect's own company has the need
// CRITICAL: "hiring" means they want EMPLOYEES, not outside contractors.
// Only patterns that clearly indicate OUTSIDE help should match here.
const SELF_NEED_PATTERNS: RegExp[] = [
  /\bwe need (?:a |an |someone |help )/i,
  /\bour (?:team|company) (?:needs?|is looking for|wants)\b/i,
  /\bwe(?:'re| are) looking for (?:a |an )?(?:developer|engineer|team|partner|contractor)\b/i,
  /\blooking for (?:a |an )?(?:developer|engineer|team|contractor)\b.{0,30}\bto help (?:us|our|my)\b/i,
  /\bwe(?:'ve| have) tried (?:agencies|contractors|freelancers|vendors)\b/i,
  /\bhelp us build\b/i,
  /\blooking for (?:a |an )?(?:technical|development|engineering) partner\b/i,
  /\blooking for (?:a |an )?(?:development|engineering|technical) team\b.{0,40}\b(?:to help|to build|to support|to assist)\b/i,
  /\bneed (?:a |an )?(?:development|engineering|technical) (?:team|partner|firm)\b/i,
  /\bseeking (?:a |an )?(?:development|engineering|technical) (?:team|partner|firm|company)\b/i,
]

// Product problem patterns — the prospect's own product has issues
// These must describe actual PROBLEMS, not just technical work.
const PRODUCT_PROBLEM_PATTERNS: RegExp[] = [
  /\bour (?:product|platform|system|app) (?:is |are |was |has been )(?:slow|broken|failing|struggling|outdated|legacy|unstable)\b/i,
  /\btechnical debt\b.{0,20}\b(?:is |has |was )(?:killing|slowing|blocking|hurting|the problem|the issue)\b/i,
  /\bwe(?:'re| are) (?:rebuilding|rewriting|migrating) our\b.{0,30}\b(?:because|due to|after)\b/i,
  /\bour (?:codebase|infrastructure|architecture) (?:is |has )(?:a mess|outdated|unmaintainable|fragile)\b/i,
]

/**
 * Classify need ownership for a given text fragment describing a problem/need.
 */
export function classifyNeedOwnership(text: string): NeedOwnership {
  const normalized = text.toLowerCase().trim()
  if (!normalized) return 'UNKNOWN'

  // Check service offering first — highest priority because it's the most
  // commonly misclassified (a fractional CTO offering services looks like
  // a buyer if we don't catch this)
  for (const pattern of SERVICE_OFFERING_PATTERNS) {
    if (pattern.test(normalized)) return 'SERVICE_OFFERING'
  }

  // Customer need
  for (const pattern of CUSTOMER_NEED_PATTERNS) {
    if (pattern.test(normalized)) return 'CUSTOMER_NEED'
  }

  // Self need
  for (const pattern of SELF_NEED_PATTERNS) {
    if (pattern.test(normalized)) return 'SELF_NEED'
  }

  // Product problem
  for (const pattern of PRODUCT_PROBLEM_PATTERNS) {
    if (pattern.test(normalized)) return 'PRODUCT_PROBLEM'
  }

  // Market problem
  for (const pattern of MARKET_PROBLEM_PATTERNS) {
    if (pattern.test(normalized)) return 'MARKET_PROBLEM'
  }

  return 'UNKNOWN'
}

/**
 * Determine if a need ownership type contributes to buyer intent.
 * Only SELF_NEED and EMPLOYER_NEED indicate the prospect themselves
 * might purchase services.
 */
export function isBuyerNeedOwnership(ownership: NeedOwnership): boolean {
  return ownership === 'SELF_NEED' || ownership === 'EMPLOYER_NEED'
}

/**
 * Get the dominant need ownership from a list of classifications.
 * Priority: SELF_NEED > EMPLOYER_NEED > PRODUCT_PROBLEM > CUSTOMER_NEED > SERVICE_OFFERING > MARKET_PROBLEM > UNKNOWN
 */
export function dominantNeedOwnership(ownerships: NeedOwnership[]): NeedOwnership {
  if (ownerships.length === 0) return 'UNKNOWN'

  const priority: NeedOwnership[] = [
    'SELF_NEED', 'EMPLOYER_NEED', 'PRODUCT_PROBLEM', 'CUSTOMER_NEED',
    'SERVICE_OFFERING', 'MARKET_PROBLEM', 'UNKNOWN',
  ]

  for (const type of priority) {
    if (ownerships.includes(type)) return type
  }

  return 'UNKNOWN'
}
