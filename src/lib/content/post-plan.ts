import type { ContentProfile, ContentIdeaCard, ContentJourneyEntry } from '@/lib/domain/types'

/**
 * PostPlan — compact structured plan derived before prose generation.
 *
 * Deterministic-first. No AI call needed in most cases.
 */

export type GroundingMode =
  | 'PERSONAL_EXPERIENCE'
  | 'PROJECT_GROUNDED'
  | 'EXPERTISE'
  | 'CONFIRMED_OPINION'
  | 'RESEARCH'
  | 'EDUCATIONAL'
  | 'OBSERVATION'

export type PostStructure =
  | 'technical_breakdown'
  | 'observation'
  | 'contrarian_argument'
  | 'mini_case_study'
  | 'decision_framework'
  | 'before_after'
  | 'myth_correction'
  | 'tradeoff_analysis'
  | 'practical_checklist'
  | 'short_insight'
  | 'narrative'

export interface PostPlan {
  topic: string
  coreInsight: string
  whyThisPerson: string
  audienceValue: string
  groundingMode: GroundingMode
  supportingPoints: string[]
  allowedPersonalClaims: string[]
  forbiddenClaims: string[]
  structure: PostStructure
  territories: string[]
  voice: string
}

interface PlanInput {
  idea: ContentIdeaCard
  profile: ContentProfile | null
  journey: ContentJourneyEntry[]
  platform: 'linkedin' | 'x' | 'instagram'
}

export function buildPostPlan(input: PlanInput): PostPlan {
  const { idea, profile, journey, platform } = input

  // Determine grounding mode
  const groundingMode = determineGroundingMode(idea, journey)

  // Build core insight from angle + expertise
  const coreInsight = buildCoreInsight(idea, profile)

  // Determine what personal claims are allowed
  const allowedPersonalClaims = buildAllowedClaims(profile, journey)

  // Determine forbidden claims
  const forbiddenClaims = buildForbiddenClaims(allowedPersonalClaims, groundingMode)

  // Choose structure based on territory + grounding
  const structure = chooseStructure(idea.territory, groundingMode, platform)

  // Build supporting points
  const supportingPoints = buildSupportingPoints(idea, profile, journey)

  return {
    topic: idea.title,
    coreInsight,
    whyThisPerson: idea.whyYou ?? buildWhyThisPerson(profile, idea),
    audienceValue: idea.whyAudience ?? 'Professional insight from direct experience',
    groundingMode,
    supportingPoints,
    allowedPersonalClaims,
    forbiddenClaims,
    structure,
    territories: profile?.territories ?? [idea.territory],
    voice: profile?.writingCharacteristics?.sentenceRhythm ?? 'natural',
  }
}

function determineGroundingMode(idea: ContentIdeaCard, journey: ContentJourneyEntry[]): GroundingMode {
  if (idea.sourceKind === 'project' || idea.sourceKind === 'journey') {
    if (journey.length > 0) return 'PROJECT_GROUNDED'
  }
  if (idea.sourceKind === 'opinion') return 'CONFIRMED_OPINION'
  if (idea.territory === 'education') return 'EDUCATIONAL'
  if (idea.territory === 'perspective') return 'OBSERVATION'
  if (idea.territory === 'authority' || idea.territory === 'proof') return 'EXPERTISE'
  return 'EXPERTISE'
}

function buildCoreInsight(idea: ContentIdeaCard, profile: ContentProfile | null): string {
  // Start with the angle
  let insight = idea.angle

  // Add expertise context if available
  if (profile && profile.expertise.length > 0) {
    const topExpertise = profile.expertise
      .filter((e) => e.level === 'expert' || e.level === 'advanced')
      .slice(0, 2)
      .map((e) => e.area)
    if (topExpertise.length > 0) {
      insight = insight.replace(
        /^Write about/i,
        `From ${topExpertise.join(' + ')} experience:`
      )
    }
  }

  return insight
}

function buildAllowedClaims(profile: ContentProfile | null, journey: ContentJourneyEntry[]): string[] {
  const claims: string[] = []
  if (!profile) return claims

  // From expertise
  for (const exp of profile.expertise) {
    if (exp.level === 'expert' || exp.level === 'advanced') {
      claims.push(`worked with ${exp.area}`)
      claims.push(`has ${exp.level} knowledge of ${exp.area}`)
    }
  }

  // From projects
  for (const proj of profile.projects) {
    if (proj.name) claims.push(`delivered ${proj.name}`)
    for (const lesson of proj.lessons) {
      if (lesson.trim()) claims.push(`learned: ${lesson.slice(0, 60)}`)
    }
  }

  // From journey
  for (const event of journey) {
    claims.push(`${event.eventType}: ${event.title.slice(0, 60)}`)
    if (event.description) claims.push(event.description.slice(0, 60))
  }

  // From industries
  for (const ind of profile.industries) {
    claims.push(`has experience in ${ind}`)
  }

  return claims
}

function buildForbiddenClaims(allowedClaims: string[], groundingMode: GroundingMode): string[] {
  const forbidden: string[] = []

  // Always forbid unsupported first-person events
  forbidden.push('specific client names without permission')
  forbidden.push('exact revenue/profit figures without confirmation')
  forbidden.push('exact team size without confirmation')
  forbidden.push('specific timelines without confirmation')

  if (groundingMode !== 'PERSONAL_EXPERIENCE' && groundingMode !== 'PROJECT_GROUNDED') {
    forbidden.push('first-person anecdotes')
    forbidden.push('direct quotes from colleagues/clients')
    forbidden.push('specific meetings or conversations')
  }

  return forbidden
}

function chooseStructure(territory: string, grounding: GroundingMode, platform: 'linkedin' | 'x' | 'instagram'): PostStructure {
  // Platform-first for X and Instagram (they have strong native formats)
  if (platform === 'x') return 'observation'
  if (platform === 'instagram') return 'short_insight'
  if (territory === 'authority' || territory === 'proof') {
    return grounding === 'PROJECT_GROUNDED' ? 'mini_case_study' : 'technical_breakdown'
  }
  if (territory === 'perspective') return 'contrarian_argument'
  if (territory === 'education') return 'tradeoff_analysis'
  if (territory === 'journey') return 'narrative'
  if (territory === 'conversation') return 'short_insight'
  return 'observation'
}

function buildSupportingPoints(idea: ContentIdeaCard, profile: ContentProfile | null, journey: ContentJourneyEntry[]): string[] {
  const points: string[] = []

  // From profile expertise
  if (profile) {
    for (const exp of profile.expertise.slice(0, 3)) {
      points.push(`${exp.area} (${exp.level})`)
    }
    for (const op of profile.opinions.slice(0, 2)) {
      points.push(`Opinion: ${op.belief.slice(0, 60)}`)
    }
  }

  // From journey
  for (const event of journey.slice(0, 2)) {
    points.push(`Journey: ${event.title.slice(0, 60)}`)
  }

  return points.slice(0, 5)
}

function buildWhyThisPerson(profile: ContentProfile | null, idea: ContentIdeaCard): string {
  if (!profile) return 'Based on Content Identity'
  const expertise = profile.expertise.filter((e) => e.level === 'expert').map((e) => e.area)
  if (expertise.length > 0) {
    return `${profile.role} with expertise in ${expertise.slice(0, 3).join(', ')}`
  }
  return `As a ${profile.role}`
}

/**
 * Validates that a CoreInsight has substantive information.
 */
export function validateCoreInsight(insight: string): { valid: boolean; reason: string } {
  const lower = insight.toLowerCase()

  // Check for generic motivational patterns
  const genericPatterns = [
    /\b(keep it simple|keeping things simple)\b/,
    /\b(focus on the basics)\b/,
    /\b(overcomplicate what'?s? simple)\b/,
    /\b(progress happens)\b/,
    /\b(consistency matters)\b/,
    /\b(work smarter)\b/,
    /\b(communication matters)\b/,
    /\b(quality matters)\b/,
    /\b(learn from mistakes)\b/,
    /\b(trust the process)\b/,
    /\b(stay curious)\b/,
    /\b(embrace change)\b/,
    /\b(the truth is)\b/,
    /\b(here'?s? (the truth|what I learned))\b/,
    /\b(one thing I'?ve? realized)\b/,
    /\b(I'?ve? been thinking)\b/,
    /\b(sometimes the simplest)\b/,
  ]

  for (const pattern of genericPatterns) {
    if (pattern.test(lower)) {
      return { valid: false, reason: `Generic insight: ${pattern.source}` }
    }
  }

  // Check for substantive information
  const substanceIndicators = [
    // Specific mechanism
    /\b(because|cause|reason|happens when|results in|leads to|creates|produces)\b/,
    // Non-obvious distinction
    /\b(but|however|actually|in reality|the difference|unlike|instead|rather than)\b/,
    // Concrete example
    /\b(for example|for instance|such as|like when|specifically|in practice)\b/,
    // Useful heuristic
    /\b(rule|principle|heuristic|pattern|approach|strategy|technique)\b/,
    // Causal explanation
    /\b(means that|implies|so that|therefore|consequently|as a result)\b/,
    // Tradeoff
    /\b(tradeoff|cost|benefit|sacrifice|give up|at the expense|versus|vs)\b/,
    // Specific observation
    /\b(I'?ve? seen|I'?ve? noticed|observing|watching|the data shows|evidence)\b/,
    // Technical specificity
    /\b(architecture|system|component|layer|interface|protocol|algorithm|query|request|response|render|compile|deploy|cache|database|server|client)\b/,
  ]

  const hasSubstance = substanceIndicators.some((p) => p.test(lower))

  if (!hasSubstance && insight.split(/\s+/).length < 10) {
    return { valid: false, reason: 'Insight lacks substantive mechanism, distinction, or explanation' }
  }

  return { valid: true, reason: '' }
}
