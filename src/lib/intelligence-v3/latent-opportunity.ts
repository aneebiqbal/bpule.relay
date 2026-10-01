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
  rawText?: string,
): Promise<LatentOpportunityAssessment> {
  const intel = v2Canonical.intelligence
  const textSource = rawText || buildTextSource(intel)

  // Evaluate each dimension deterministically (with text context)
  const capabilityFit = evaluateCapabilityFit(intel)
  const buyerRoleLikelihood = evaluateBuyerRoleLikelihood(intel, textSource)
  const decisionInfluence = evaluateDecisionInfluence(intel, textSource)
  const companyBuildIntensity = evaluateCompanyBuildIntensity(intel, textSource)
  const technicalRelevance = evaluateTechnicalRelevance(intel, textSource)
  const likelyExternalCapacityNeed = evaluateCapacityNeed(intel)
  const reachability = evaluateReachability(intel)
  const relationshipPotential = evaluateRelationshipPotential(intel)

  // Count independent signals
  const signals: string[] = []
  if (capabilityFit > 0.5) signals.push('Strong capability fit')
  if (buyerRoleLikelihood > 0.4) signals.push('Likely buyer role')
  if (decisionInfluence > 0.3) signals.push('Decision influence')
  if (companyBuildIntensity > 0.3) signals.push('Active product building')
  if (technicalRelevance > 0.5) signals.push('Technical stack overlap')
  if (likelyExternalCapacityNeed > 0.4) signals.push('Likely capacity need')
  if (reachability > 0.4) signals.push('Reachable')

  // Scan raw text for additional signals
  const textSignals = scanTextForSignals(textSource)
  for (const sig of textSignals) {
    if (!signals.includes(sig)) signals.push(sig)
  }

  // Overall potential requires MULTIPLE independent signals
  const signalCount = signals.length
  const avgScore = (
    capabilityFit + buyerRoleLikelihood + decisionInfluence +
    companyBuildIntensity + technicalRelevance +
    likelyExternalCapacityNeed + reachability + relationshipPotential
  ) / 8

  // Signal-based scoring: strong text signals can override low structured scores
  let overallPotential: LatentPotentialLevel = 'LOW'
  if (signalCount >= 3 && avgScore > 0.3) overallPotential = 'HIGH'
  else if (signalCount >= 3) overallPotential = 'MEDIUM'
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

function evaluateBuyerRoleLikelihood(intel: CanonicalProspectIntelligence['intelligence'], text: string): number {
  const title = (intel.person.title || '').toLowerCase()
  const seniority = (intel.person.seniority || '').toLowerCase()

  // Roles that typically buy software development services
  const buyerTitles = ['founder', 'co-founder', 'cto', 'ceo', 'vp', 'head', 'director', 'lead', 'principal']
  const isBuyer = buyerTitles.some(bt => title.includes(bt) || seniority.includes(bt))

  // Founders (even of side projects) have buyer intent
  const isFounder = text.includes('founder') || text.includes('co-founder') || text.includes('startup') || text.includes('started')

  // Developers at product companies also buy services (they decide what to outsource)
  const isDeveloperAtProductCompany = (
    title.includes('developer') || title.includes('engineer') ||
    seniority.includes('senior') || seniority.includes('staff')
  ) && isProductCompany(intel)

  if (isBuyer || isFounder) return 0.8
  if (isDeveloperAtProductCompany) return 0.5
  return 0.2
}

function evaluateDecisionInfluence(intel: CanonicalProspectIntelligence['intelligence'], text: string): number {
  const title = (intel.person.title || '').toLowerCase()
  const seniority = (intel.person.seniority || '').toLowerCase()

  // Higher influence = higher score
  if (title.includes('ceo') || title.includes('founder') || title.includes('co-founder')) return 0.9
  if (title.includes('cto') || title.includes('chief')) return 0.85
  if (title.includes('vp') || title.includes('vice president')) return 0.7
  if (title.includes('director') || title.includes('head')) return 0.6
  if (title.includes('lead') || title.includes('senior') || seniority.includes('senior')) return 0.4

  // Text-based influence signals
  if (text.includes('founder') || text.includes('architect') || text.includes('lead')) return 0.4

  return 0.2
}

function evaluateCompanyBuildIntensity(intel: CanonicalProspectIntelligence['intelligence'], text: string): number {
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

  // Text-based building signals
  if (text.includes('building') || text.includes('developing') || text.includes('growing') || text.includes('scaling')) score += 0.15
  if (text.includes('saas') || text.includes('platform') || text.includes('product')) score += 0.1

  return Math.min(1, score)
}

function evaluateTechnicalRelevance(intel: CanonicalProspectIntelligence['intelligence'], text: string): number {
  const techSignals = intel.content.technicalSignals || []
  const topics = intel.content.topics || []

  // Count relevant technical signals from structured data
  const relevant = ['react', 'node', 'next.js', 'typescript', 'python', 'api', 'saas', 'ai', 'automation', 'aws', 'cloud']
  let matchCount = [...techSignals, ...topics].filter(t =>
    relevant.some(r => t.toLowerCase().includes(r))
  ).length

  // Also scan raw text for tech stack
  const textTech = ['javascript', 'typescript', 'react', 'node', 'python', '.net', 'java', 'azure', 'aws', 'api', 'postgresql', 'mongodb']
  const textMatches = textTech.filter(t => text.includes(t)).length
  matchCount = Math.max(matchCount, textMatches)

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

function isProductCompany(intel: CanonicalProspectIntelligence['intelligence']): boolean {
  const stage = (intel.company.stage || '').toLowerCase()
  const size = (intel.company.size || '').toLowerCase()
  const product = (intel.company.product || '').toLowerCase()

  if (stage.includes('seed') || stage.includes('series') || stage.includes('growth')) return true
  if (product.includes('saas') || product.includes('platform') || product.includes('product')) return true
  if (size.includes('self-employed') || size.includes('1-10') || size.includes('11-50')) return true

  const expText = JSON.stringify(intel.person.affiliations || []).toLowerCase()
  if (expText.includes('building') || expText.includes('founding') || expText.includes('product') || expText.includes('saas')) return true

  return false
}

function buildTextSource(intel: CanonicalProspectIntelligence['intelligence']): string {
  const parts: string[] = []
  if (intel.person.title) parts.push(intel.person.title)
  if (intel.company.name) parts.push(intel.company.name)
  if (intel.company.product) parts.push(intel.company.product)
  parts.push(...(intel.content.topics || []))
  parts.push(...(intel.content.technicalSignals || []))
  parts.push(...(intel.content.initiatives || []))
  parts.push(...(intel.content.launches || []))
  return parts.join(' ').toLowerCase()
}

function scanTextForSignals(text: string): string[] {
  const signals: string[] = []
  if (!text) return signals

  if (/\b(saas|platform|product|app|application)\b/.test(text)) {
    signals.push('Building product/platform')
  }

  const techKeywords = ['react', 'node', 'typescript', 'next.js', 'python', 'azure', 'aws', 'api', 'frontend', 'backend', 'fullstack', 'full-stack', 'javascript', 'csharp', 'c#', 'cosmos', 'postgresql', 'mongodb', 'docker', 'kubernetes']
  const techMatches = techKeywords.filter(t => text.includes(t))
  if (techMatches.length >= 3) {
    signals.push('Strong technical stack')
  }

  if (/\b(building|developing|growing|scaling|launching|started|founded|creating)\b/.test(text)) {
    signals.push('Active development')
  }

  if (/\b(self-employed|solo|freelance|small team|just me|1-10|personal project)\b/.test(text)) {
    signals.push('Small team — likely needs help')
  }

  if (/\b(developer|engineer|architect|technical lead|cto|founder|co-founder)\b/.test(text)) {
    const productSignals = ['saas', 'platform', 'product', 'startup', 'building', 'growing']
    if (productSignals.some(p => text.includes(p))) {
      signals.push('Technical role at product company')
    }
  }

  return signals
}
