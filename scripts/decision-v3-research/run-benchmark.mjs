/**
 * Run V3 Decision Benchmark
 * Tests deterministic fallback + rule-based provider on frozen eval set.
 * Outputs CSV results to stdout.
 */

import { FROZEN_EVAL_SET, datasetStats } from './frozen-eval-data.mjs'

// ── Provider: Deterministic Fallback ───────────────────────────────────────

function deterministicDecide(text) {
  const t = text.toLowerCase()

  const hasApplyInstructions = /send.*(resume|portfolio|github|availability)|apply.*(email|here|link)|dm.*me|email.*to.*apply/i.test(t)
  const hasHiringLanguage = /(we'?re|we are|i am|i'm)?\s*(hiring|looking for|need.*(a |an )?(developer|engineer|team|contractor|freelancer))/i.test(t) ||
    /join our (team|company)/i.test(t) ||
    /(hiring|open role|open position)/i.test(t)
  const hasExplicitAsk = /(looking for|need|seeking|want).{0,40}(developer|engineer|team|contractor|freelancer|partner|help)/i.test(t)
  const hasServiceLanguage = /(we provide|we help|our services|agency|consulting firm|i help|my (agency|practice|business)|we (specialize|focus|offer|deliver))/i.test(t)
  const hasCompetitorLanguage = /(we are a|we're a).{0,30}(development |dev |web |software )?(agency|shop|outsourcing|firm)/i.test(t) ||
    /(overflow work|we build.*for clients|we develop.*for clients)/i.test(t)
  const hasMarketLanguage = /\d{1,3}(?:,\d{3})*\s+(unfilled|open|vacant|positions|jobs)/i.test(t) ||
    /market.*(grew|growing|forecast|trend)/i.test(t) ||
    /(\d+%\s+of\s+companies|companies\s+(are\s+)?(struggle|need|growing))/i.test(t) ||
    /(fachkräftemangel|skills?\s+shortage)/i.test(t)
  const hasCustomerNeed = /(our|my)\s+(clients?|customers?)\s+(struggle|face|have|need|deal)/i.test(t)
  const hasFunding = /(raised|series [abc]|pre-seed|seed round|funding)/i.test(t)
  const hasProductBuilding = /(we'?re|we are).{0,20}(building|launching|creating)/i.test(t)
  const hasOpenToWork = /#?opentowork|open to (work|new)|looking for.*(job|role|position|opportunity)/i.test(t)
  const hasGeoRestriction = /(must be (?:based|located|resident))|(on[- ]?site.*required)|no remote/i.test(t)
  const hasPartnership = /(development|engineering|technical)\s+partner|partner.{0,20}(co[- ]?build|revenue share)/i.test(t)
  const hasCapacity = /(can'?t keep up|understaffed|backlog|need more (?:engineers|capacity)|stretched thin)/i.test(t)
  const hasStaleIndicator = /(\d+ months? ago|\d+ weeks? ago)/i.test(t)

  // Decision logic
  let relationship = 'UNKNOWN'
  let buyerRequestProb = 0.1
  let needOwner = 'UNKNOWN'
  let confidence = 0.5

  // Market commentary = not buyer
  if (hasMarketLanguage && !hasHiringLanguage && !hasExplicitAsk) {
    relationship = 'UNKNOWN'
    buyerRequestProb = 0.05
    needOwner = 'MARKET_PROBLEM'
    confidence = 0.6
  }
  // Service provider patterns
  else if (hasCompetitorLanguage || (hasServiceLanguage && !hasHiringLanguage)) {
    relationship = hasCompetitorLanguage ? 'COMPETITOR' : 'SERVICE_PROVIDER'
    buyerRequestProb = 0.08
    needOwner = 'SERVICE_OFFERING'
    confidence = 0.6
  }
  // Customer need (not self need)
  else if (hasCustomerNeed && !hasHiringLanguage) {
    relationship = 'UNKNOWN'
    buyerRequestProb = 0.1
    needOwner = 'CUSTOMER_NEED'
    confidence = 0.5
  }
  // Job seeker
  else if (hasOpenToWork && !hasHiringLanguage) {
    relationship = 'CANDIDATE'
    buyerRequestProb = 0.05
    needOwner = 'UNKNOWN'
    confidence = 0.5
  }
  // Explicit hiring + apply instructions = strong buyer
  else if (hasApplyInstructions && hasHiringLanguage) {
    relationship = 'BUYER'
    buyerRequestProb = 0.85
    needOwner = 'HIRING_NEED'
    confidence = 0.75
  }
  // Hiring language without apply
  else if (hasHiringLanguage || hasExplicitAsk) {
    relationship = 'BUYER'
    buyerRequestProb = 0.6
    needOwner = 'HIRING_NEED'
    confidence = 0.5
  }
  // Capacity request
  else if (hasCapacity) {
    relationship = 'BUYER'
    buyerRequestProb = 0.5
    needOwner = 'ORGANIZATION_NEED'
    confidence = 0.4
  }
  // Partnership
  else if (hasPartnership) {
    relationship = 'PARTNER'
    buyerRequestProb = 0.5
    needOwner = 'ORGANIZATION_NEED'
    confidence = 0.4
  }
  // Funding without explicit hiring
  else if (hasFunding && hasProductBuilding) {
    relationship = 'BUYER'
    buyerRequestProb = 0.3
    needOwner = 'ORGANIZATION_NEED'
    confidence = 0.35
  }
  // Product building only
  else if (hasProductBuilding) {
    relationship = 'UNKNOWN'
    buyerRequestProb = 0.15
    needOwner = 'PRODUCT_PROBLEM'
    confidence = 0.3
  }
  // Geo restricted buyer
  else if (hasGeoRestriction && hasHiringLanguage) {
    relationship = 'BUYER'
    buyerRequestProb = 0.4
    needOwner = 'HIRING_NEED'
    confidence = 0.4
  }
  // Weak signal
  else {
    relationship = 'UNKNOWN'
    buyerRequestProb = 0.1
    needOwner = 'UNKNOWN'
    confidence = 0.2
  }

  // Multi-role detection: service + buyer
  if (hasServiceLanguage && (hasHiringLanguage || hasExplicitAsk)) {
    relationship = 'MIXED'
    buyerRequestProb = Math.max(buyerRequestProb, 0.6)
    confidence = 0.5
  }

  // Staleness reduces buyer probability
  if (hasStaleIndicator) {
    buyerRequestProb = Math.max(0.1, buyerRequestProb * 0.6)
    confidence = Math.max(0.2, confidence * 0.7)
  }

  // Message eligibility
  const messageEligible = buyerRequestProb >= 0.4 && relationship !== 'SERVICE_PROVIDER' && relationship !== 'COMPETITOR' && relationship !== 'CANDIDATE'
    ? Math.min(0.8, buyerRequestProb)
    : buyerRequestProb >= 0.3 ? 0.3 : 0.05

  return {
    relationship,
    buyerRequestProbability: Math.round(buyerRequestProb * 100) / 100,
    externalNeedProbability: Math.round(buyerRequestProb * 0.8 * 100) / 100,
    needOwner,
    fit: 'MEDIUM',
    timing: hasStaleIndicator ? 'AGING' : 'CURRENT',
    access: /linkedin\.com/i.test(text) ? 'CONNECTION' : 'INDIRECT',
    messageEligible: Math.round(messageEligible * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
  }
}

// ── Provider: Rule-Based V2 Proxy ──────────────────────────────────────────

function v2ProxyDecide(text) {
  const t = text.toLowerCase()

  // V2-like logic: heavy penalties for service provider
  const hasServiceLanguage = /(we provide|we help|our services|agency|consulting|i help|we (specialize|focus|offer))/i.test(t)
  const hasHiringLanguage = /(hiring|looking for|need.*developer|join our team)/i.test(t)
  const hasApplyInstructions = /send.*(resume|portfolio|github)|apply.*here|dm.*me/i.test(t)

  // V2 bug: service provider status globally suppresses buyer signal
  if (hasServiceLanguage && !hasApplyInstructions) {
    return {
      relationship: 'SERVICE_PROVIDER',
      buyerRequestProbability: 0.05,
      externalNeedProbability: 0.05,
      needOwner: 'SERVICE_OFFERING',
      fit: 'WEAK',
      timing: 'CURRENT',
      access: 'INDIRECT',
      messageEligible: 0.02,
      confidence: 0.7,
    }
  }

  if (hasHiringLanguage) {
    return {
      relationship: 'BUYER',
      buyerRequestProbability: hasApplyInstructions ? 0.75 : 0.45,
      externalNeedProbability: 0.5,
      needOwner: 'HIRING_NEED',
      fit: 'STRONG',
      timing: 'CURRENT',
      access: 'CONNECTION',
      messageEligible: hasApplyInstructions ? 0.7 : 0.3,
      confidence: 0.6,
    }
  }

  return {
    relationship: 'UNKNOWN',
    buyerRequestProbability: 0.1,
    externalNeedProbability: 0.1,
    needOwner: 'UNKNOWN',
    fit: 'MEDIUM',
    timing: 'CURRENT',
    access: 'INDIRECT',
    messageEligible: 0.05,
    confidence: 0.3,
  }
}

// ── Correctness Check ──────────────────────────────────────────────────────

function checkCorrectness(decision, labels) {
  // Relationship: exact match or MIXED covers component
  const relCorrect =
    decision.relationship === labels.relationship ||
    (labels.relationship === 'MIXED' && ['BUYER', 'SERVICE_PROVIDER', 'PARTNER', 'UNKNOWN'].includes(decision.relationship)) ||
    (labels.relationship === 'UNKNOWN' && ['UNKNOWN', 'CANDIDATE'].includes(decision.relationship))

  // Buyer request
  const buyerCorrect =
    (labels.buyerRequest === 'EXPLICIT' && decision.buyerRequestProbability >= 0.5) ||
    (labels.buyerRequest === 'STRONG' && decision.buyerRequestProbability >= 0.35) ||
    (labels.buyerRequest === 'WEAK' && decision.buyerRequestProbability >= 0.15 && decision.buyerRequestProbability < 0.6) ||
    (labels.buyerRequest === 'NONE' && decision.buyerRequestProbability < 0.25)

  // Need owner
  const needCorrect =
    decision.needOwner === labels.needOwner ||
    labels.needOwner === 'UNKNOWN' ||
    (decision.needOwner === 'HIRING_NEED' && labels.needOwner === 'ORGANIZATION_NEED') ||
    (decision.needOwner === 'ORGANIZATION_NEED' && labels.needOwner === 'HIRING_NEED')

  // Message eligibility
  const msgCorrect =
    (labels.messageEligible === 'YES' && decision.messageEligible >= 0.3) ||
    (labels.messageEligible === 'NO' && decision.messageEligible < 0.3) ||
    (labels.messageEligible === 'HUMAN_REVIEW')

  // Action
  const action = deriveAction(decision.buyerRequestProbability, decision.relationship, decision.messageEligible)
  const actionCorrect = action === labels.action ||
    (labels.action === 'OBSERVE' && ['WAIT', 'CONNECT_WITHOUT_NOTE'].includes(action)) ||
    (labels.action === 'CONNECT_WITH_NOTE' && ['CONTACT_NOW', 'CONNECT_WITHOUT_NOTE'].includes(action))

  return {
    relationship: relCorrect,
    buyerRequest: buyerCorrect,
    needOwner: needCorrect,
    messageEligible: msgCorrect,
    action: actionCorrect,
  }
}

function deriveAction(buyerProb, relationship, msgEligible) {
  if (relationship === 'SERVICE_PROVIDER' || relationship === 'COMPETITOR' || relationship === 'CANDIDATE') return 'SKIP'
  if (buyerProb >= 0.7 && msgEligible >= 0.6) return 'CONTACT_NOW'
  if (buyerProb >= 0.5 && msgEligible >= 0.4) return 'CONNECT_WITH_NOTE'
  if (buyerProb >= 0.3) return 'CONNECT_WITHOUT_NOTE'
  if (buyerProb >= 0.15) return 'OBSERVE'
  return 'SKIP'
}

// ── Run Benchmark ──────────────────────────────────────────────────────────

const providers = {
  deterministic: deterministicDecide,
  v2_proxy: v2ProxyDecide,
}

const results = []

for (const example of FROZEN_EVAL_SET) {
  for (const [providerName, providerFn] of Object.entries(providers)) {
    const start = performance.now()
    const decision = providerFn(example.rawText)
    const latency = performance.now() - start

    const correct = checkCorrectness(decision, example.labels)

    results.push({
      exampleId: example.id,
      category: example.category,
      provider: providerName,
      decision,
      labels: example.labels,
      correct,
      latencyMs: Math.round(latency * 100) / 100,
    })
  }
}

// ── Compute Metrics ────────────────────────────────────────────────────────

function computeMetrics(results, provider) {
  const r = results.filter((x) => x.provider === provider)
  if (r.length === 0) return null

  const relAcc = r.filter((x) => x.correct.relationship).length / r.length
  const buyerAcc = r.filter((x) => x.correct.buyerRequest).length / r.length
  const needAcc = r.filter((x) => x.correct.needOwner).length / r.length
  const msgAcc = r.filter((x) => x.correct.messageEligible).length / r.length
  const actionAcc = r.filter((x) => x.correct.action).length / r.length

  // Buyer request recall (explicit buyers caught)
  const explicitBuyers = r.filter((x) => x.labels.buyerRequest === 'EXPLICIT')
  const caughtExplicit = explicitBuyers.filter((x) => x.decision.buyerRequestProbability >= 0.5)
  const buyerRecall = explicitBuyers.length > 0 ? caughtExplicit.length / explicitBuyers.length : 1

  // Buyer request precision (predicted buyers that are actually buyers)
  const predictedBuyers = r.filter((x) => x.decision.buyerRequestProbability >= 0.5)
  const trueBuyers = predictedBuyers.filter((x) => ['EXPLICIT', 'STRONG'].includes(x.labels.buyerRequest))
  const buyerPrecision = predictedBuyers.length > 0 ? trueBuyers.length / predictedBuyers.length : 0

  // F1
  const f1 = (buyerPrecision + buyerRecall) > 0 ? 2 * (buyerPrecision * buyerRecall) / (buyerPrecision + buyerRecall) : 0

  // Service provider false buyer rate
  const spExamples = r.filter((x) => ['SERVICE_PROVIDER', 'COMPETITOR'].includes(x.labels.relationship))
  const falseBuyers = spExamples.filter((x) => x.decision.buyerRequestProbability >= 0.4)
  const falseBuyerRate = spExamples.length > 0 ? falseBuyers.length / spExamples.length : 0

  // Service provider false message rate
  const falseMessages = spExamples.filter((x) => x.decision.messageEligible >= 0.3)
  const falseMessageRate = spExamples.length > 0 ? falseMessages.length / spExamples.length : 0

  // Latencies
  const latencies = r.map((x) => x.latencyMs).sort((a, b) => a - b)
  const medianLat = latencies[Math.floor(latencies.length / 2)]
  const avgLat = latencies.reduce((a, b) => a + b, 0) / latencies.length

  return {
    provider,
    total: r.length,
    relationshipAccuracy: Math.round(relAcc * 100) / 100,
    buyerRequestAccuracy: Math.round(buyerAcc * 100) / 100,
    buyerRequestPrecision: Math.round(buyerPrecision * 100) / 100,
    buyerRequestRecall: Math.round(buyerRecall * 100) / 100,
    buyerRequestF1: Math.round(f1 * 100) / 100,
    needOwnerAccuracy: Math.round(needAcc * 100) / 100,
    messageEligibleAccuracy: Math.round(msgAcc * 100) / 100,
    actionAccuracy: Math.round(actionAcc * 100) / 100,
    serviceProviderFalseBuyerRate: Math.round(falseBuyerRate * 100) / 100,
    serviceProviderFalseMessageRate: Math.round(falseMessageRate * 100) / 100,
    medianLatencyMs: Math.round(medianLat * 100) / 100,
    avgLatencyMs: Math.round(avgLat * 100) / 100,
  }
}

// ── Output ─────────────────────────────────────────────────────────────────

console.log('=== DATASET STATS ===')
console.log(JSON.stringify(datasetStats(), null, 2))

console.log('\n=== PROVIDER METRICS ===')
for (const provider of Object.keys(providers)) {
  const m = computeMetrics(results, provider)
  console.log(JSON.stringify(m, null, 2))
}

console.log('\n=== DETAILED RESULTS (CSV) ===')
console.log('example_id,category,provider,rel_pred,rel_actual,rel_correct,buyer_prob,buyer_label,buyer_correct,need_pred,need_actual,need_correct,msg_prob,msg_label,msg_correct,action_pred,action_actual,action_correct,latency_ms')

for (const r of results) {
  console.log([
    r.exampleId,
    r.category,
    r.provider,
    r.decision.relationship,
    r.labels.relationship,
    r.correct.relationship ? 1 : 0,
    r.decision.buyerRequestProbability,
    r.labels.buyerRequest,
    r.correct.buyerRequest ? 1 : 0,
    r.decision.needOwner,
    r.labels.needOwner,
    r.correct.needOwner ? 1 : 0,
    r.decision.messageEligible,
    r.labels.messageEligible,
    r.correct.messageEligible ? 1 : 0,
    deriveAction(r.decision.buyerRequestProbability, r.decision.relationship, r.decision.messageEligible),
    r.labels.action,
    r.correct.action ? 1 : 0,
    r.latencyMs,
  ].join(','))
}

// ── Failure Analysis ──────────────────────────────────────────────────────

console.log('\n=== FAILURES: DETERMINISTIC ===')
for (const r of results.filter((x) => x.provider === 'deterministic' && (!x.correct.relationship || !x.correct.buyerRequest))) {
  console.log(`  ${r.exampleId} (${r.category}): rel=${r.decision.relationship}/${r.labels.relationship} buyer=${r.decision.buyerRequestProbability}/${r.labels.buyerRequest} msg=${r.decision.messageEligible}/${r.labels.messageEligible}`)
}

console.log('\n=== FAILURES: V2 PROXY ===')
for (const r of results.filter((x) => x.provider === 'v2_proxy' && (!x.correct.relationship || !x.correct.buyerRequest))) {
  console.log(`  ${r.exampleId} (${r.category}): rel=${r.decision.relationship}/${r.labels.relationship} buyer=${r.decision.buyerRequestProbability}/${r.labels.buyerRequest} msg=${r.decision.messageEligible}/${r.labels.messageEligible}`)
}
