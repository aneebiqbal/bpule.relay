/**
 * Normalize frozen examples into identical provider inputs.
 * Every provider receives the SAME normalized OpportunityEpisode.
 */


export function normalizeForProvider(example) {
  const text = example.rawText

  // Extract person name (best effort from raw text)
  const personMatch = text.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)+)/m)
  const personName = personMatch ? personMatch[1] : null

  // Extract organization (look for "at Company" or "CEO at Company" patterns)
  const orgMatch = text.match(/(?:at|@)\s+([A-Z][\w\s&.]+?)(?:\.|,|\n|$)/m)
  const organizationName = orgMatch ? orgMatch[1].trim() : null

  // Determine event type from category
  const eventType = inferEventType(example.category, text)

  // Detect explicit request signals
  const explicitRequest = detectExplicitRequest(text)

  // Extract requested capabilities
  const requestedCapabilities = extractCapabilities(text)

  // Detect application channels
  const applicationChannels = extractChannels(text)

  return {
    rawText: text,
    personName,
    organizationName,
    currentDate: new Date().toISOString(),
    eventType,
    explicitRequest,
    requestedCapabilities,
    applicationChannels,
    evidenceCount: 1,
  }
}

function inferEventType(category, text) {
  const lower = text.toLowerCase()
  if (category.includes('hiring') || category.includes('buyer') || lower.includes('hiring') || lower.includes('looking for')) {
    return 'HIRING'
  }
  if (category.includes('freelance') || category.includes('freelance')) return 'FREELANCE_REQUEST'
  if (category.includes('service') || category.includes('consulting')) return 'SERVICE_OFFERING'
  if (category.includes('competitor')) return 'SERVICE_OFFERING'
  if (category.includes('funding') || category.includes('series')) return 'FUNDING'
  if (category.includes('launch') || category.includes('product')) return 'PRODUCT_LAUNCH'
  return 'OTHER'
}

function detectExplicitRequest(text) {
  const lower = text.toLowerCase()
  return (
    /send.*(resume|portfolio|github|availability)/i.test(lower) ||
    /apply.*(here|now|at|via)/i.test(lower) ||
    /dm me|email me|reach out to me/i.test(lower) ||
    /contact.*(me|us|here)/i.test(lower) ||
    /one-day paid trial/i.test(lower)
  )
}

function extractCapabilities(text) {
  const capabilities = []
  const techPatterns = [
    'react', 'node', 'typescript', 'javascript', 'python', 'ruby', 'rails',
    'next.js', 'nextjs', 'vue', 'angular', 'aws', 'postgresql', 'postgres',
    'mongodb', 'graphql', 'rest api', 'fullstack', 'full-stack', 'frontend',
    'backend', 'mobile', 'react native', 'flutter', 'golang', 'rust',
    'kubernetes', 'docker', 'terraform', 'ci/cd',
  ]
  const lower = text.toLowerCase()
  for (const tech of techPatterns) {
    if (lower.includes(tech)) capabilities.push(tech)
  }
  return capabilities
}

function extractChannels(text) {
  const channels = []
  const lower = text.toLowerCase()
  if (/linkedin\.com\/in\//i.test(text)) channels.push('linkedin')
  if (/email|@\w+\.\w+/i.test(text)) channels.push('email')
  if (/dm me|direct message/i.test(lower)) channels.push('dm')
  if (/apply.*(here|at|via)/i.test(lower)) channels.push('application_link')
  return channels
}

// ── Deterministic V3 baseline (improved from earlier benchmark) ──────────────

export function deterministicDecide(text) {
  const t = text.toLowerCase()

  const hasApplyInstructions = /send.*(resume|portfolio|github|availability)|apply.*(email|here|link)|dm.*me|email.*to.*apply/i.test(t)
  const hasHiring = /(we'?re|we are|i am|i'm)\s*(hiring|looking for|seeking)\b/i.test(t) ||
    /join our (team|company)/i.test(t) ||
    /\b(hiring|open role|open position)\b/i.test(t)
  const hasExplicitAsk = /(looking for|need|seeking|want)\b.{0,40}(developer|engineer|team|contractor|freelancer|partner|help)\b/i.test(t)
  const hasService = /(we provide|we help|our services|agency|consulting firm|i help|my (agency|practice|business)|we (specialize|focus|offer|deliver))\b/i.test(t)
  const hasCompetitor = /(we are a|we're a)\b.{0,30}(development |dev |web |software )?(agency|shop|outsourcing|firm)/i.test(t) ||
    /(overflow work|we build.*for clients|we develop.*for clients)/i.test(t)
  const hasMarket = /\d{1,3}(?:,\d{3})*\s+(unfilled|open|vacant|positions|jobs)/i.test(t) ||
    /market.*(grew|growing|forecast|trend)/i.test(t) ||
    /(\d+%\s+of\s+companies|companies\s+(are\s+)?(struggle|need|growing))/i.test(t)
  const hasCustomerNeed = /(our|my)\s+(clients?|customers?)\s+(struggle|face|have|need|deal)/i.test(t)
  const hasFunding = /(raised|series [abc]|pre-seed|seed round|funding)/i.test(t)
  const hasProduct = /(we'?re|we are)\b.{0,20}(building|launching|creating)/i.test(t)
  const hasOpenToWork = /#?opentowork|open to (work|new)|looking for.*(job|role|position|opportunity)/i.test(t)
  const hasGeoRestriction = /(must be (?:based|located|resident))|(on[- ]?site.*required)|no remote/i.test(t)
  const hasPartnership = /(development|engineering|technical)\s+partner|partner.{0,20}(co[- ]?build|revenue share)/i.test(t)
  const hasCapacity = /(can'?t keep up|understaffed|backlog|need more (?:engineers|capacity)|stretched thin)/i.test(t)
  const hasStale = /(\d+ months? ago|\d+ weeks? ago)/i.test(t)
  const hasHiringOwnTeam = /(hiring our|first|join our team|growing our team|building our team)/i.test(t)

  let relationship = 'UNKNOWN'
  let buyerRequestProb = 0.1
  let needOwner = 'UNKNOWN'
  let confidence = 0.5

  if (hasMarket && !hasHiring && !hasExplicitAsk) {
    relationship = 'UNKNOWN'; buyerRequestProb = 0.05; needOwner = 'MARKET_PROBLEM'; confidence = 0.6
  } else if (hasCompetitor || (hasService && !hasHiring && !hasExplicitAsk)) {
    relationship = hasCompetitor ? 'COMPETITOR' : 'SERVICE_PROVIDER'
    buyerRequestProb = 0.08; needOwner = 'SERVICE_OFFERING'; confidence = 0.6
  } else if (hasCustomerNeed && !hasHiring) {
    relationship = 'UNKNOWN'; buyerRequestProb = 0.1; needOwner = 'CUSTOMER_NEED'; confidence = 0.5
  } else if (hasOpenToWork && !hasHiring) {
    relationship = 'CANDIDATE'; buyerRequestProb = 0.05; needOwner = 'UNKNOWN'; confidence = 0.5
  } else if (hasApplyInstructions && hasHiring) {
    relationship = 'BUYER'; buyerRequestProb = 0.85; needOwner = 'HIRING_NEED'; confidence = 0.75
  } else if (hasHiring || hasExplicitAsk) {
    relationship = 'BUYER'; buyerRequestProb = 0.6; needOwner = 'HIRING_NEED'; confidence = 0.5
  } else if (hasCapacity) {
    relationship = 'BUYER'; buyerRequestProb = 0.5; needOwner = 'ORGANIZATION_NEED'; confidence = 0.4
  } else if (hasPartnership) {
    relationship = 'PARTNER'; buyerRequestProb = 0.5; needOwner = 'ORGANIZATION_NEED'; confidence = 0.4
  } else if (hasFunding && hasProduct) {
    relationship = 'BUYER'; buyerRequestProb = 0.3; needOwner = 'ORGANIZATION_NEED'; confidence = 0.35
  } else if (hasProduct) {
    relationship = 'UNKNOWN'; buyerRequestProb = 0.15; needOwner = 'PRODUCT_PROBLEM'; confidence = 0.3
  } else {
    relationship = 'UNKNOWN'; buyerRequestProb = 0.1; needOwner = 'UNKNOWN'; confidence = 0.2
  }

  // Multi-role: service + buyer
  if (hasService && (hasHiring || hasExplicitAsk)) {
    relationship = 'MIXED'; buyerRequestProb = Math.max(buyerRequestProb, 0.6); confidence = 0.5
  }

  // Hiring own team dampening
  if (hasHiringOwnTeam && buyerRequestProb > 0.3) {
    buyerRequestProb *= 0.5
    needOwner = 'SELF_NEED'
  }

  // Staleness
  if (hasStale) {
    buyerRequestProb = Math.max(0.1, buyerRequestProb * 0.6)
    confidence = Math.max(0.2, confidence * 0.7)
  }

  const messageEligible = buyerRequestProb >= 0.4 && relationship !== 'SERVICE_PROVIDER' && relationship !== 'COMPETITOR' && relationship !== 'CANDIDATE'
    ? Math.min(0.8, buyerRequestProb) : buyerRequestProb >= 0.3 ? 0.3 : 0.05

  return {
    relationship,
    buyerRequestProbability: Math.round(buyerRequestProb * 100) / 100,
    externalNeedProbability: Math.round(buyerRequestProb * 0.8 * 100) / 100,
    needOwner,
    fit: 'MEDIUM',
    timing: hasStale ? 'AGING' : 'CURRENT',
    access: /linkedin\.com/i.test(text) ? 'CONNECTION' : 'INDIRECT',
    messageEligible: Math.round(messageEligible * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  }
}
