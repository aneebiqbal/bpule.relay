/**
 * Sales thesis — the WHY behind a message.
 *
 * The message engine must never invent a reason to talk. Every draft is built
 * on a thesis derived from verified SourceFacts and OpportunityFeatures, and
 * shaped by the lead archetype. Hypotheses stay labelled as hypotheses.
 */

export type ThesisConfidence = 'Possible' | 'Potential' | 'Unverified'

export interface SalesThesis {
  whyThisAccount: string
  likelyOpportunity: string
  whyUs: string
  whyThisSender: string
  bestEntryPoint: string
  missingEvidence: string[]
  risks: string[]
  confidence: ThesisConfidence
}

export type LeadArchetype =
  | 'explicit_buyer'
  | 'technical_founder'
  | 'enterprise_leader'
  | 'growth_builder'
  | 'unknown_intent'
  | 'service_provider'
  | 'recruiter'
  | 'candidate'
  | 'closed'

export interface ArchetypeStrategy {
  archetype: LeadArchetype
  /** What the message must lead with. */
  leadWith: string
  /** What it must NOT do. */
  avoid: string[]
  /** The structure the draft should follow. */
  structure: string[]
}

const STRATEGIES: Record<LeadArchetype, ArchetypeStrategy> = {
  explicit_buyer: {
    archetype: 'explicit_buyer',
    leadWith: 'Answer their stated need directly.',
    avoid: ['generic praise', 'discovery questions that ignore the ask', 'fake urgency'],
    structure: ['acknowledged need', 'concrete capability', 'relevant proof', 'one clear next step'],
  },
  technical_founder: {
    archetype: 'technical_founder',
    leadWith: 'A technical/business capacity thesis about their build.',
    avoid: ['vendor-speak', 'generic AI hype', 'asking for a call with no reason'],
    structure: ['source-grounded observation', 'implication', 'why we may help', 'low-friction CTA'],
  },
  enterprise_leader: {
    archetype: 'enterprise_leader',
    leadWith: 'Delivery risk, modernization or integration outcome.',
    avoid: ['overpromising', 'claiming unverified enterprise clients', 'a feature list'],
    structure: ['the risk they are carrying', 'a comparable outcome', 'proof if verified', 'next step'],
  },
  growth_builder: {
    archetype: 'growth_builder',
    leadWith: 'Product velocity and capacity.',
    avoid: ['long onboarding talk', 'generic growth advice'],
    structure: ['what they are shipping', 'the capacity pressure', 'why we may help', 'one question'],
  },
  unknown_intent: {
    archetype: 'unknown_intent',
    leadWith: 'A research-led, low-pressure thesis.',
    avoid: ['assuming a need', 'a hard pitch', 'a call ask'],
    structure: ['one specific observation', 'why it might matter', 'an easy permission-based ask'],
  },
  service_provider: {
    archetype: 'service_provider',
    leadWith: 'A partnership angle only if it is real.',
    avoid: ['a sales pitch', 'competing with their offer', 'fake familiarity'],
    structure: ['what they do', 'a possible complementary angle', 'an easy out'],
  },
  recruiter: {
    archetype: 'recruiter',
    leadWith: 'A talent/channel path only.',
    avoid: ['a client pitch', 'pretending to be a candidate'],
    structure: ['the channel observation', 'what we can offer a channel partner', 'one question'],
  },
  candidate: {
    archetype: 'candidate',
    leadWith: 'No sales outreach.',
    avoid: ['any pitch', 'asking for work'],
    structure: [],
  },
  closed: {
    archetype: 'closed',
    leadWith: 'No message.',
    avoid: ['any outreach'],
    structure: [],
  },
}

export function strategyForArchetype(archetype: LeadArchetype): ArchetypeStrategy {
  return STRATEGIES[archetype]
}

export function hasOutreachStrategy(archetype: LeadArchetype): boolean {
  return archetype !== 'candidate' && archetype !== 'closed'
}

/** The thesis as prompt text; hypotheses are labelled as hypotheses. */
export function thesisPromptText(thesis: SalesThesis | null): string {
  if (!thesis) {
    return 'Sales thesis: none established. Do not invent a commercial reason. Use only verified facts and ask one question.'
  }
  const missing = thesis.missingEvidence.length
    ? `Still unverified: ${thesis.missingEvidence.join('; ')}.`
    : 'Nothing material is unverified.'
  return [
    `WHY THIS ACCOUNT: ${thesis.whyThisAccount}`,
    `LIKELY OPPORTUNITY (hypothesis): ${thesis.likelyOpportunity}`,
    `WHY US: ${thesis.whyUs}`,
    `WHY THIS SENDER: ${thesis.whyThisSender}`,
    `BEST ENTRY POINT: ${thesis.bestEntryPoint}`,
    missing,
    thesis.confidence === 'Unverified' ? 'Confidence: UNVERIFIED. Treat every claim above as a hypothesis and never state it as fact.' : `Confidence: ${thesis.confidence}.`,
  ].join('\n')
}
