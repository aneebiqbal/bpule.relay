import type { ContentProfile, ContentPersona } from '@/lib/domain/types'
import type { TrendCandidate } from '@/lib/trends/types'

/**
 * "Why This Could Perform" Scoring Model
 *
 * Before writing, each candidate is judged for its realistic chance
 * of increasing reach. This is NOT a guarantee — it's a probability
 * optimization based on observable signals.
 *
 * Dimensions:
 * - timeliness:     Is this relevant right now?
 * - novelty:        Has the persona already covered this?
 * - specificity:    Concrete details vs vague generalities?
 * - personaAuthority: Can this person credibly say this?
 * - conversationPotential: Will people reply/quote?
 * - emotionalTension: Does it create a reason to engage?
 * - visualStoppingPower: Will the visual make people pause?
 *
 * Key rule: Weight performance alongside credibility and persona consistency.
 * A post with high reach potential but poor persona fit should NOT win.
 */

export interface ReachScore {
  timeliness: number       // 0-1
  novelty: number          // 0-1
  specificity: number      // 0-1
  personaAuthority: number  // 0-1
  conversationPotential: number // 0-1
  emotionalTension: number  // 0-1
  visualStoppingPower: number // 0-1
  overall: number          // weighted composite
  verdict: 'strong' | 'viable' | 'weak'
  reasons: string[]
}

export interface ReachInput {
  ideaTitle: string
  ideaAngle: string
  territory?: string
  trendCandidate?: TrendCandidate
  persona: ContentPersona
  profile: ContentProfile
  platform: 'linkedin' | 'x'
  isTrendGrounded: boolean
}

/**
 * Score a candidate idea for its realistic reach potential.
 *
 * This is a deterministic model — no AI calls. It evaluates the idea
 * against the persona, the trend signals, and platform dynamics.
 */
export function scoreReachPotential(input: ReachInput): ReachScore {
  const reasons: string[] = []

  // 1. Timeliness
  const timeliness = scoreTimeliness(input, reasons)

  // 2. Novelty (vs persona's recent content)
  const novelty = scoreNovelty(input, reasons)

  // 3. Specificity
  const specificity = scoreSpecificity(input, reasons)

  // 4. Persona authority
  const personaAuthority = scorePersonaAuthority(input, reasons)

  // 5. Conversation potential
  const conversationPotential = scoreConversationPotential(input, reasons)

  // 6. Emotional tension
  const emotionalTension = scoreEmotionalTension(input, reasons)

  // 7. Visual stopping power
  const visualStoppingPower = scoreVisualStoppingPower(input, reasons)

  // Weighted composite — authority and novelty matter most
  const overall =
    timeliness * 0.15 +
    novelty * 0.20 +
    specificity * 0.15 +
    personaAuthority * 0.20 +
    conversationPotential * 0.15 +
    emotionalTension * 0.10 +
    visualStoppingPower * 0.05

  const verdict: ReachScore['verdict'] =
    overall >= 0.7 ? 'strong' :
    overall >= 0.45 ? 'viable' : 'weak'

  return {
    timeliness, novelty, specificity, personaAuthority,
    conversationPotential, emotionalTension, visualStoppingPower,
    overall, verdict, reasons,
  }
}

/**
 * Apply reach score as a multiplier to the idea's selection score.
 * Strong reach ideas get a boost, weak ones get penalized.
 *
 * But: never let reach override persona fit. If authority is low,
 * cap the boost to prevent clickbait drift.
 */
export function applyReachScoring(
  baseScore: number,
  reachScore: ReachScore,
): number {
  // Authority guard: if persona can't credibly say this, cap the boost
  const authorityGuard = reachScore.personaAuthority < 0.3 ? 0.5 : 1.0

  // Reach multiplier: 0.8 to 1.3 range
  const reachMultiplier = 0.8 + (reachScore.overall * 0.5 * authorityGuard)

  return baseScore * reachMultiplier
}


function scoreTimeliness(input: ReachInput, reasons: string[]): number {
  if (!input.trendCandidate) {
    // Evergreen content — moderate timeliness
    return 0.5
  }

  const tc = input.trendCandidate
  let score = tc.freshnessScore * 0.6 + (tc.velocityScore ?? 0) * 0.4

  if (tc.trendPhase === 'breaking') {
    score = Math.min(1, score + 0.2)
    reasons.push('Breaking trend — high timeliness')
  } else if (tc.trendPhase === 'saturated') {
    score = Math.max(0, score - 0.3)
    reasons.push('Saturated trend — low timeliness')
  }

  return Math.max(0, Math.min(1, score))
}

function scoreNovelty(input: ReachInput, reasons: string[]): number {
  if (!input.trendCandidate) return 0.7 // Evergreen = moderate novelty

  const novelty = input.trendCandidate.noveltyScore
  if (novelty > 0.7) reasons.push('Fresh topic for this persona')
  else if (novelty < 0.3) reasons.push('Recently covered — low novelty')

  return novelty
}

function scoreSpecificity(input: ReachInput, reasons: string[]): number {
  const text = `${input.ideaTitle} ${input.ideaAngle}`.toLowerCase()
  let score = 0.4 // baseline

  // Numbers indicate specificity
  if (/\d+%/.test(text) || /\d+x/.test(text)) { score += 0.2; reasons.push('Contains specific metrics') }
  if (/\b(we|our|my|I)\b/.test(text)) { score += 0.15; reasons.push('First-person experience') }

  // Named tools/technologies
  const toolPatterns = /\b(kubernetes|docker|aws|gcp|azure|react|rust|go|python|postgres|redis|terraform|github|vercel|railway)\b/g
  const toolMatches = text.match(toolPatterns)
  if (toolMatches && toolMatches.length >= 2) { score += 0.15; reasons.push('Named specific tools') }
  else if (toolMatches && toolMatches.length >= 1) { score += 0.08 }

  // Penalize vague language
  const vaguePatterns = /\b(things?|stuff|lots?|many|various|several|good|great|amazing|awesome)\b/g
  const vagueMatches = text.match(vaguePatterns)
  if (vagueMatches && vagueMatches.length >= 2) { score -= 0.15; reasons.push('Vague language detected') }

  return Math.max(0, Math.min(1, score))
}

function scorePersonaAuthority(input: ReachInput, reasons: string[]): number {
  const profile = input.profile
  let score = 0.5 // baseline

  // Territory match = authority
  if (input.territory && profile.territories?.includes(input.territory)) {
    score += 0.3
    reasons.push(`Credible in territory: ${input.territory}`)
  }

  // Expertise match
  const expertiseAreas = (profile.expertise ?? []).map(e => e.area.toLowerCase())
  const ideaText = `${input.ideaTitle} ${input.ideaAngle}`.toLowerCase()
  const expertiseMatch = expertiseAreas.some(ea => ideaText.includes(ea))
  if (expertiseMatch) {
    score += 0.2
    reasons.push('Matches demonstrated expertise')
  }

  // Seniority bonus for opinion content
  if (profile.seniority === 'senior' || profile.seniority === 'executive' || profile.seniority === 'lead') {
    score += 0.1
  }

  // Penalty: if the idea is far from any known expertise
  if (profile.territories && profile.territories.length > 0 && !expertiseMatch) {
    const territoryMatch = profile.territories.some(t => ideaText.includes(t.toLowerCase()))
    if (!territoryMatch) {
      score -= 0.2
      reasons.push('Outside known expertise — authority risk')
    }
  }

  return Math.max(0, Math.min(1, score))
}

function scoreConversationPotential(input: ReachInput, reasons: string[]): number {
  const text = `${input.ideaTitle} ${input.ideaAngle}`.toLowerCase()
  let score = 0.3 // baseline

  // Question hooks drive comments
  if (/\?/.test(input.ideaTitle) || /\b(how|what|why|when|which)\b/.test(input.ideaTitle)) {
    score += 0.2
    reasons.push('Question format invites replies')
  }

  // Controversial takes drive engagement
  const controversialPatterns = /\b(wrong|myth|mistake|never|always|should|must|stop|avoid|overrated|underrated)\b/
  if (controversialPatterns.test(text)) {
    score += 0.15
    reasons.push('Opinionated stance — conversation potential')
  }

  // Personal stories drive comments
  if (/\b(I |my |our |we )\b/i.test(input.ideaAngle)) {
    score += 0.1
    reasons.push('Personal experience — relatable')
  }

  // Platform-specific: X rewards quotability
  if (input.platform === 'x') {
    if (input.ideaTitle.length < 80) {
      score += 0.1
      reasons.push('Short enough to quote-tweet')
    }
  }

  // Platform-specific: LinkedIn rewards expertise sharing
  if (input.platform === 'linkedin') {
    if (/\b(lesson|learned|framework|approach|strategy|principle)\b/.test(text)) {
      score += 0.1
      reasons.push('Educational framing — LinkedIn native')
    }
  }

  return Math.max(0, Math.min(1, score))
}

function scoreEmotionalTension(input: ReachInput, reasons: string[]): number {
  const text = `${input.ideaTitle} ${input.ideaAngle}`.toLowerCase()
  let score = 0.2 // baseline

  // Problem-solution tension
  if (/\b(problem|issue|challenge|struggle|fail|break|crash|bug|incident)\b/.test(text)) {
    score += 0.2
    reasons.push('Problem narrative — creates tension')
  }

  // Surprise/contrast
  if (/\b(but|however|actually|turns out|unexpected|counterintuitive|surprising)\b/.test(text)) {
    score += 0.15
    reasons.push('Contrast/surprise — holds attention')
  }

  // Stakes
  if (/\b(cost|revenue|customer|production|downtime|outage|security|breach)\b/.test(text)) {
    score += 0.1
    reasons.push('Real stakes — consequences matter')
  }

  return Math.max(0, Math.min(1, score))
}

function scoreVisualStoppingPower(input: ReachInput, reasons: string[]): number {
  // Ideas with concrete visual potential score higher
  const text = `${input.ideaTitle} ${input.ideaAngle}`.toLowerCase()
  let score = 0.3

  // Architecture/system topics have strong visual potential
  if (/\b(architecture|system|pipeline|flow|diagram|infrastructure|deployment|cluster)\b/.test(text)) {
    score += 0.25
    reasons.push('System/architecture topic — strong visual potential')
  }

  // Data/metrics topics
  if (/\b(\d+%|\d+x|latency|throughput|performance|benchmark|metric)\b/.test(text)) {
    score += 0.15
    reasons.push('Metrics topic — data visualization potential')
  }

  // Before/after topics
  if (/\b(before|after|migration|upgrade|refactor|rewrite|from .* to)\b/.test(text)) {
    score += 0.15
    reasons.push('Before/after narrative — comparison visual')
  }

  return Math.max(0, Math.min(1, score))
}
