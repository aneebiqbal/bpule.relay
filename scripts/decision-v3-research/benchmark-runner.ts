/**
 * Benchmark Runner — V3 Decision Model Research
 *
 * Runs the frozen eval set through multiple decision providers
 * and measures accuracy, calibration, latency, and cost.
 *
 * Providers benchmarked:
 * - current_v2 (Relay's existing deterministic logic)
 * - deterministic_fallback (graph-based heuristic)
 * - openai_structured (GPT-4o-mini JSON schema)
 * - longcat_structured (LongCat JSON schema)
 * - embedding_lr (BGE-M3 + logistic regression baseline)
 * - jev_shadow (if API key available)
 * - kev_local (if endpoint available)
 */

import type { FrozenEvalExample } from './frozen-eval-set'

// ── Provider Result ──────────────────────────────────────────────────────────

export interface ProviderDecision {
  providerId: string
  relationship: string
  buyerRequestProbability: number
  externalNeedProbability: number
  needOwner: string
  fit: string
  timing: string
  access: string
  messageEligible: number
  latencyMs: number
}

export interface BenchmarkResult {
  exampleId: string
  category: string
  providerId: string
  decision: ProviderDecision
  labels: FrozenEvalExample['labels']
  /** Per-dimension correctness */
  correct: {
    relationship: boolean
    buyerRequest: boolean
    needOwner: boolean
    timing: boolean
    fit: boolean
    action: boolean
    messageEligible: boolean
  }
}

// ── Deterministic Fallback (no LLM) ─────────────────────────────────────────

export function deterministicDecision(example: FrozenEvalExample): ProviderDecision {
  const text = example.rawText.toLowerCase()
  const startTime = Date.now()

  // Simple structural analysis (NOT semantic regex — just pattern presence)
  const hasHiringLanguage = /\b(hiring|looking for|need.*developer|join our team)\b/.test(text)
  const hasApplyInstructions = /\b(send.*resume|apply.*email|dm.*me|portfolio.*github)\b/.test(text)
  const hasServiceLanguage = /\b(we provide|we help|our services|agency|consulting)\b/i.test(text)
  const hasMarketLanguage = /\b(\d+,\d+.*positions|market.*grew|industry.*trend|companies struggle)\b/i.test(text)

  let relationship = 'UNKNOWN'
  let buyerRequestProb = 0.1
  let needOwner = 'UNKNOWN'

  if (hasApplyInstructions && hasHiringLanguage) {
    relationship = 'BUYER'
    buyerRequestProb = 0.8
    needOwner = 'HIRING_NEED'
  } else if (hasHiringLanguage) {
    relationship = 'BUYER'
    buyerRequestProb = 0.5
    needOwner = 'HIRING_NEED'
  } else if (hasServiceLanguage) {
    relationship = 'SERVICE_PROVIDER'
    buyerRequestProb = 0.1
    needOwner = 'SERVICE_OFFERING'
  } else if (hasMarketLanguage) {
    relationship = 'UNKNOWN'
    buyerRequestProb = 0.05
    needOwner = 'MARKET_PROBLEM'
  }

  return {
    providerId: 'deterministic_fallback',
    relationship,
    buyerRequestProbability: buyerRequestProb,
    externalNeedProbability: buyerRequestProb * 0.8,
    needOwner,
    fit: 'MEDIUM',
    timing: 'CURRENT',
    access: 'INDIRECT',
    messageEligible: buyerRequestProb >= 0.5 ? 0.6 : 0.1,
    latencyMs: Date.now() - startTime,
  }
}

// ── Correctness Checker ─────────────────────────────────────────────────────

export function checkCorrectness(
  decision: ProviderDecision,
  labels: FrozenEvalExample['labels'],
): BenchmarkResult['correct'] {
  return {
    relationship: decision.relationship === labels.relationship ||
      // MIXED is acceptable if the model picks one of the components
      (labels.relationship === 'MIXED' && ['BUYER', 'SERVICE_PROVIDER', 'UNKNOWN'].includes(decision.relationship)),
    buyerRequest: classifyBuyerMatch(decision.buyerRequestProbability, labels.buyerRequest),
    needOwner: fuzzyNeedOwner(decision.needOwner, labels.needOwnership),
    timing: decision.timing === labels.timing || labels.timing === 'UNKNOWN',
    fit: true,  // fit is subjective, skip
    action: deriveAction(decision) === labels.action || labels.action === 'OBSERVE',
    messageEligible: classifyMessageEligible(decision.messageEligible, labels.messageEligible),
  }
}

function classifyBuyerMatch(prob: number, label: string): boolean {
  if (label === 'EXPLICIT') return prob >= 0.6
  if (label === 'STRONG') return prob >= 0.4
  if (label === 'WEAK') return prob >= 0.2 && prob < 0.6
  if (label === 'NONE') return prob < 0.3
  return false
}

function fuzzyNeedOwner(predicted: string, actual: string): boolean {
  if (predicted === actual) return true
  if (actual === 'UNKNOWN') return true
  // HIRING_NEED and ORGANIZATION_NEED are related
  if (
    (predicted === 'HIRING_NEED' && actual === 'ORGANIZATION_NEED') ||
    (predicted === 'ORGANIZATION_NEED' && actual === 'HIRING_NEED')
  ) return true
  return false
}

function deriveAction(decision: ProviderDecision): string {
  const score = decision.buyerRequestProbability * 100
  if (score >= 70 && decision.access === 'DIRECT') return 'CONTACT_NOW'
  if (score >= 60) return 'CONNECT_WITH_NOTE'
  if (score >= 40) return 'CONNECT_WITHOUT_NOTE'
  if (score >= 20) return 'OBSERVE'
  return 'SKIP'
}

function classifyMessageEligible(prob: number, label: string): boolean {
  if (label === 'YES') return prob >= 0.4
  if (label === 'NO') return prob < 0.3
  if (label === 'HUMAN_REVIEW') return prob >= 0.2 && prob < 0.6
  return false
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export interface BenchmarkMetrics {
  providerId: string
  totalExamples: number
  relationshipAccuracy: number
  buyerRequestAccuracy: number
  buyerRequestRecall: number  // catch explicit requests
  needOwnerAccuracy: number
  timingAccuracy: number
  messageEligibleAccuracy: number
  falseBuyerRate: number    // service providers classified as buyers
  falseMessageRate: number  // service providers eligible for message
  medianLatencyMs: number
  avgLatencyMs: number
}

export function computeMetrics(
  results: BenchmarkResult[],
  providerId: string,
): BenchmarkMetrics {
  const providerResults = results.filter((r) => r.providerId === providerId)
  if (providerResults.length === 0) {
    return {
      providerId,
      totalExamples: 0,
      relationshipAccuracy: 0,
      buyerRequestAccuracy: 0,
      buyerRequestRecall: 0,
      needOwnerAccuracy: 0,
      timingAccuracy: 0,
      messageEligibleAccuracy: 0,
      falseBuyerRate: 0,
      falseMessageRate: 0,
      medianLatencyMs: 0,
      avgLatencyMs: 0,
    }
  }

  const latencies = providerResults.map((r) => r.decision.latencyMs).sort((a, b) => a - b)

  // Buyer request recall: did we catch explicit buyer requests?
  const explicitBuyerExamples = providerResults.filter((r) => r.labels.buyerRequest === 'EXPLICIT')
  const caughtExplicit = explicitBuyerExamples.filter((r) => r.decision.buyerRequestProbability >= 0.5)

  // False buyer rate: service providers classified as buyers
  const serviceProviderExamples = providerResults.filter((r) => r.labels.relationship === 'SERVICE_PROVIDER' || r.labels.relationship === 'COMPETITOR')
  const falseBuyers = serviceProviderExamples.filter((r) => r.decision.buyerRequestProbability >= 0.5)

  // False message rate: service providers eligible for message
  const falseMessages = serviceProviderExamples.filter((r) => r.decision.messageEligible >= 0.4)

  return {
    providerId,
    totalExamples: providerResults.length,
    relationshipAccuracy: mean(providerResults.map((r) => r.correct.relationship ? 1 : 0)),
    buyerRequestAccuracy: mean(providerResults.map((r) => r.correct.buyerRequest ? 1 : 0)),
    buyerRequestRecall: explicitBuyerExamples.length > 0 ? caughtExplicit.length / explicitBuyerExamples.length : 1,
    needOwnerAccuracy: mean(providerResults.map((r) => r.correct.needOwner ? 1 : 0)),
    timingAccuracy: mean(providerResults.map((r) => r.correct.timing ? 1 : 0)),
    messageEligibleAccuracy: mean(providerResults.map((r) => r.correct.messageEligible ? 1 : 0)),
    falseBuyerRate: serviceProviderExamples.length > 0 ? falseBuyers.length / serviceProviderExamples.length : 0,
    falseMessageRate: serviceProviderExamples.length > 0 ? falseMessages.length / serviceProviderExamples.length : 0,
    medianLatencyMs: latencies[Math.floor(latencies.length / 2)] ?? 0,
    avgLatencyMs: mean(latencies),
  }
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
}
