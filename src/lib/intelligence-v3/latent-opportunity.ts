/**
 * Latent Opportunity Assessment — V3
 *
 * Separates CURRENT BUYER INTENT from LATENT COMMERCIAL POTENTIAL.
 *
 * A lead can have intent = UNKNOWN while commercialPotential = MEDIUM/HIGH.
 * This layer answers: "Even without an explicit current request, is this
 * person worth starting a conversation with?"
 */

import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'

export type LatentPotentialLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface LatentOpportunityAssessment {
  capabilityFit: number          // 0-1: how well sender capabilities match prospect
  buyerRoleLikelihood: number    // 0-1: likelihood this person buys services
  decisionInfluence: number      // 0-1: how much influence they have on buying
  companyBuildIntensity: number  // 0-1: is their company/product actively building
  technicalRelevance: number     // 0-1: technical stack overlap
  likelyExternalCapacityNeed: number // 0-1: likely need outside help
  reachability: number           // 0-1: how reachable is this person
  relationshipPotential: number  // 0-1: long-term relationship value
  overallPotential: LatentPotentialLevel
  confidence: number             // 0-1: confidence in this assessment
  signals: string[]              // human-readable signals found
}

/**
 * Assess latent commercial potential when no active buyer episode exists.
 * Uses V2 extraction data (person, company, content) to evaluate.
 */
export async function assessLatentOpportunity(
  v2Canonical: CanonicalProspectIntelligence,
): Promise<LatentOpportunityAssessment> {
  const intel = v2Canonical.intelligence

  // Evaluate each dimension deterministically
  const capabilityFit = evaluateCapabilityFit(intel)
  const buyerRoleLikelihood = evaluateBuyerRoleLikelihood(intel)
  const decisionInfluence = evaluateDecisionInfluence(intel)
  const companyBuildIntensity = evaluateCompanyBuildIntensity(intel)
  const technicalRelevance = evaluateTechnicalRelevance(intel)
  const likelyExternalCapacityNeed = evaluateCapacityNeed(intel)
  const reachability = evaluateReachability(intel)
  const relationshipPotential = evaluateRelationshipPotential(intel)

  // Count independent signals
  const signals: string[] = []
  if (capabilityFit > 0.6) signals.push('Strong capability fit')
  if (buyerRoleLikelihood > 0.6) signals.push('Likely buyer role')
  if (decisionInfluence > 0.5) signals.push('Decision influence')
  if (companyBuildIntensity > 0.5) signals.push('Active product building')
  if (technicalRelevance > 0.6) signals.push('Technical stack overlap')
  if (likelyExternalCapacityNeed > 0.5) signals.push('Likely capacity need')
  if (reachability > 0.5) signals.push('Reachable')

  // Overall potential requires MULTIPLE independent signals
  const signalCount = signals.length
  const avgScore = (
    capabilityFit + buyerRoleLikelihood + decisionInfluence +
    companyBuildIntensity + technicalRelevance +
    likelyExternalCapacityNeed + reachability + relationshipPotential
  ) / 8

  let overallPotential: LatentPotentialLevel = 'LOW'
  if (signalCount >= 3 && avgScore > 0.5) overallPotential = 'HIGH'
  else if (signalCount >= 2 && avgScore > 0.35) overallPotential = 'MEDIUM'

  // Confidence based on evidence completeness
  const confidence = Math.min(1, signalCount / 4)

  return {
    capabilityFit,
    buyerRoleLikelihood,
    decisionInfluence,
    companyBuildIntensity,
    technicalRelevance,
    likelyExternalCapacityNeed,
    reachability,
    relationshipPotential,
    overallPotential,
    confidence,
    signals,
  }
}

// ── Dimension Evaluators ─────────────────────────────────────────────────────

function evaluateCapabilityFit(intel: CanonicalProspectIntelligence['intelligence']): number {
  const techSignals = intel.content.technicalSignals || []
  const topics = intel.content.topics || []
  const relevantTopics = ['react', 'node', 'typescript', 'next.js', 'python', 'saas', 'ai', 'automation', 'api']
  const matchCount = [...techSignals, ...topics].filter(t =>
    relevantTopics.some(rt => t.toLowerCase().includes(rt))
  ).length
  return Math.min(1, matchCount / 4)
}

function evaluateBuyerRoleLikelihood(intel: CanonicalProspectIntelligence['intelligence']): number {
  const title = (intel.person.title || '').toLowerCase()
  const seniority = (intel.person.seniority || '').toLowerCase()

  // Roles that typically buy software development services
  const buyerTitles = ['founder', 'co-founder', 'cto', 'ceo', 'vp', 'head', 'director', 'lead', 'principal']
  const isBuyer = buyerTitles.some(bt => title.includes(bt) || seniority.includes(bt))

  return isBuyer ? 0.8 : 0.2
}

function evaluateDecisionInfluence(intel: CanonicalProspectIntelligence['intelligence']): number {
  const title = (intel.person.title || '').toLowerCase()
  const seniority = (intel.person.seniority || '').toLowerCase()

  // Higher influence = higher score
  if (title.includes('ceo') || title.includes('founder') || title.includes('co-founder')) return 0.9
  if (title.includes('cto') || title.includes('chief')) return 0.85
  if (title.includes('vp') || title.includes('vice president')) return 0.7
  if (title.includes('director') || title.includes('head')) return 0.6
  if (title.includes('lead') || title.includes('senior') || seniority.includes('senior')) return 0.4
  return 0.2
}

function evaluateCompanyBuildIntensity(intel: CanonicalProspectIntelligence['intelligence']): number {
  const launches = intel.content.launches || []
  const initiatives = intel.content.initiatives || []
  const hasProduct = intel.company.product && intel.company.product !== 'Unknown'
  const stage = (intel.company.stage || '').toLowerCase()

  let score = 0
  if (launches.length > 0) score += 0.3
  if (initiatives.length > 0) score += 0.2
  if (hasProduct) score += 0.2
  if (stage.includes('seed') || stage.includes('series') || stage.includes('growth')) score += 0.3
  if (stage.includes('mvp') || stage.includes('beta') || stage.includes('early')) score += 0.25

  return Math.min(1, score)
}

function evaluateTechnicalRelevance(intel: CanonicalProspectIntelligence['intelligence']): number {
  const techSignals = intel.content.technicalSignals || []
  const topics = intel.content.topics || []

  // Count relevant technical signals
  const relevant = ['react', 'node', 'next.js', 'typescript', 'python', 'api', 'saas', 'ai', 'automation', 'aws', 'cloud']
  const matchCount = [...techSignals, ...topics].filter(t =>
    relevant.some(r => t.toLowerCase().includes(r))
  ).length

  return Math.min(1, matchCount / 3)
}

function evaluateCapacityNeed(intel: CanonicalProspectIntelligence['intelligence']): number {
  const companySize = (intel.company.size || '').toLowerCase()
  const stage = (intel.company.stage || '').toLowerCase()

  // Small companies and early-stage startups are most likely to need outside help
  if (companySize.includes('self-employed') || companySize.includes('1-10') || companySize.includes('small')) return 0.7
  if (companySize.includes('11-50') || companySize.includes('small')) return 0.5
  if (stage.includes('mvp') || stage.includes('beta') || stage.includes('early')) return 0.6
  if (stage.includes('seed') || stage.includes('series a')) return 0.5

  return 0.2
}

function evaluateReachability(intel: CanonicalProspectIntelligence['intelligence']): number {
  let score = 0.3 // base: they're on LinkedIn

  if (intel.person.linkedinUrl) score += 0.3
  if (intel.person.otherUrls && intel.person.otherUrls.length > 0) score += 0.2

  // Active content suggests they're engaged
  const posts = intel.content.recentPosts || []
  if (posts.length > 0) score += 0.2

  return Math.min(1, score)
}

function evaluateRelationshipPotential(intel: CanonicalProspectIntelligence['intelligence']): number {
  const stage = (intel.company.stage || '').toLowerCase()
  const size = (intel.company.size || '').toLowerCase()

  // Early-stage companies have more relationship potential
  if (stage.includes('seed') || stage.includes('series')) return 0.7
  if (stage.includes('mvp') || stage.includes('beta')) return 0.6
  if (size.includes('self-employed') || size.includes('1-10')) return 0.5

  return 0.2
}

// ── Latent Score Computation ──────────────────────────────────────────────────

/**
 * Convert latent potential to a 0-100 score.
 * Latent scores are capped — they should never exceed active buyer scores.
 */
export function computeLatentScore(assessment: LatentOpportunityAssessment): number {
  const baseScore = (
    assessment.capabilityFit * 20 +
    assessment.buyerRoleLikelihood * 15 +
    assessment.decisionInfluence * 15 +
    assessment.companyBuildIntensity * 15 +
    assessment.technicalRelevance * 15 +
    assessment.likelyExternalCapacityNeed * 10 +
    assessment.reachability * 5 +
    assessment.relationshipPotential * 5
  )

  // Cap latent scores — they should be meaningful but not inflated
  // HIGH potential: 30-55, MEDIUM: 15-30, LOW: 0-15
  switch (assessment.overallPotential) {
    case 'HIGH': return Math.min(55, Math.max(30, Math.round(baseScore)))
    case 'MEDIUM': return Math.min(30, Math.max(15, Math.round(baseScore * 0.6)))
    case 'LOW': return Math.min(15, Math.round(baseScore * 0.3))
    default: return 0
  }
}

/**
 * Map latent potential to an action.
 * Never CONTACT_NOW without current buyer evidence.
 */
export function latentActionFromPotential(
  potential: LatentPotentialLevel,
  confidence: number,
): { action: string; messageEligible: boolean } {
  if (potential === 'HIGH' && confidence > 0.4) {
    return { action: 'CONNECT_WITHOUT_NOTE', messageEligible: false }
  }
  if (potential === 'MEDIUM' && confidence > 0.3) {
    return { action: 'OBSERVE', messageEligible: false }
  }
  return { action: 'SKIP', messageEligible: false }
}
