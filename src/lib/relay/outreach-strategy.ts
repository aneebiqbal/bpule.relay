import type {
  MessageMode,
  OutreachStrategy,
  Profile,
  MatchedProof,
  SafeFact,
} from '@/lib/domain/types'
import { revenueStrategyToPromptBlock, type RevenueStrategy } from '@/lib/relay/revenue-strategy'

/**
 * Outreach Strategy Engine
 *
 * Before writing ANY message, Relay creates a compact strategy that distills:
 * - who the prospect is (only safe-to-mention context)
 * - what trigger is safe to reference
 * - which sender profile and proof to use
 * - what the message should accomplish
 * - what tone/CTA fits the relationship stage
 *
 * The message generator receives this strategy + evidence, not raw scraped context.
 */

export interface StrategyInput {
  leadCompany: string
  contactName: string | null
  contactTitle: string | null
  signalType: number | null
  signalEvidence: string
  verbatimQuote: string | null
  tags: string[]
  safeFacts: SafeFact[]
  senderProfile: Profile
  matchedProof: MatchedProof[]
  channel: 'dm' | 'connection' | 'upwork' | 'email'
  relationshipStage: 'first_touch' | 'followup' | 'reply' | 'warming'
  priorMessages?: { type: string; sentText: string; sentAt: string }[]
  conversationStage?: string
}

/**
 * Select the best message mode for this situation.
 */
export function selectMessageMode(input: StrategyInput): MessageMode {
  const { relationshipStage, safeFacts, matchedProof, signalType } = input

  if (relationshipStage === 'followup') return 'followup'
  if (relationshipStage === 'reply') return 'reply'

  // Strong proof available — lead with credibility
  if (matchedProof.some((m) => m.proofCard.strength === 'strong' && m.relevanceScore >= 5)) {
    return 'proof_led'
  }

  // Technical founder — peer approach
  if (signalType === 6 || signalType === 5) {
    return 'technical_peer'
  }

  // Pain signals — problem recognition (carefully)
  if (signalType === 6) {
    return 'problem_recognition'
  }

  // Hiring signal — offer a small win
  if (signalType === 1) {
    return 'offer_small_win'
  }

  // Publicly asking — direct but warm
  if (signalType === 7) {
    return 'warm_conversational'
  }

  // Default: observation + question
  return 'relevant_question'
}

/**
 * Create the outreach strategy for a lead + sender combination.
 */
export function createOutreachStrategy(input: StrategyInput): OutreachStrategy {
  const mode = selectMessageMode(input)
  const channel = input.channel

  // Build lead context from SAFE facts only
  const leadContext = buildLeadContext(input)

  // Determine the safe trigger to reference
  const safeTrigger = buildSafeTrigger(input)

  // Infer probable need (for strategy only, not stated as fact)
  const probableNeed = inferProbableNeed(input)

  // Sender identity
  const sender = input.senderProfile.label ?? input.senderProfile.headline ?? 'the sender'

  // Relevant proof (just the safe claims)
  const relevantProof = input.matchedProof.map((m) => m.safeClaim)

  // Message goal based on stage
  const messageGoal = getMessageGoal(input.relationshipStage, mode)

  // Relationship stage for the strategy
  const relationshipStage = input.relationshipStage

  // Tone based on channel + role
  const tone = getTone(input)

  // Risk assessment
  const risk = assessRisk(input, mode)

  // CTA strategy
  const ctaStrategy = getCtaStrategy(input.relationshipStage, mode, channel)

  return {
    leadContext,
    safeTrigger,
    probableNeed,
    sender,
    relevantProof,
    messageGoal,
    relationshipStage,
    channel,
    tone,
    risk,
    ctaStrategy,
    mode,
  }
}

function buildLeadContext(input: StrategyInput): string {
  const parts: string[] = []
  parts.push(`Company: ${input.leadCompany}`)

  if (input.contactName) {
    parts.push(`Contact: ${input.contactName}${input.contactTitle ? ` (${input.contactTitle})` : ''}`)
  }

  // Only include safe-to-mention facts
  const safe = input.safeFacts.filter((f) => f.safeToMention)
  if (safe.length > 0) {
    parts.push(`Safe context: ${safe.map((f) => f.fact).join('; ')}`)
  }

  return parts.join('. ')
}

function buildSafeTrigger(input: StrategyInput): string {
  // Use verbatim quotes when available — they're the safest reference
  if (input.verbatimQuote && input.verbatimQuote.trim().length > 10) {
    return `Their own words: "${input.verbatimQuote.trim()}"`
  }

  // Use safe facts
  const safe = input.safeFacts.filter((f) => f.safeToMention)
  if (safe.length > 0) {
    return safe[0].fact
  }

  // Fall back to signal evidence but mark it as observed
  if (input.signalEvidence && input.signalEvidence.trim().length > 10) {
    return input.signalEvidence.trim()
  }

  return 'their current focus'
}

function inferProbableNeed(input: StrategyInput): string {
  const { signalType, tags } = input

  switch (signalType) {
    case 1:
      return 'likely needs reliable delivery capacity'
    case 2:
      return 'likely needs technical execution support'
    case 3:
      return 'likely scaling and needs delivery velocity'
    case 4:
      return 'likely needs modernization or fresh energy'
    case 5:
      return 'likely needs platform/infrastructure upgrade'
    case 6:
      return 'likely facing delivery or technical challenges'
    case 7:
      return 'actively seeking external help'
    default:
      return tags.length > 0 ? `active in ${tags.slice(0, 2).join(', ')}` : 'building product'
  }
}

function getMessageGoal(stage: StrategyInput['relationshipStage'], mode: MessageMode): string {
  if (stage === 'followup') return 'earn a reply by adding value or clarifying'
  if (stage === 'reply') return 'respond directly to what they said and move forward'

  switch (mode) {
    case 'proof_led':
      return 'earn a reply by showing relevant credibility'
    case 'relevant_question':
      return 'earn a reply by asking something they can answer easily'
    case 'technical_peer':
      return 'earn a reply through technical credibility'
    case 'offer_small_win':
      return 'earn a reply by offering something immediately useful'
    case 'warm_conversational':
      return 'earn a reply by being genuinely helpful'
    default:
      return 'earn a reply'
  }
}

function getTone(input: StrategyInput): string {
  const { contactTitle, channel } = input

  const isTechnical = contactTitle
    ? /\b(engineer|cto|developer|architect|technical|founder)/i.test(contactTitle)
    : false

  if (channel === 'upwork') return 'professional, specific, delivery-focused'
  if (isTechnical) return 'peer-level, technical, no fluff'
  if (channel === 'connection') return 'warm, brief, genuine'
  return 'direct, professional, human'
}

function assessRisk(input: StrategyInput, mode: MessageMode): string {
  const risks: string[] = []

  if (mode === 'problem_recognition') {
    risks.push('appears to assume their internal state')
  }
  if (input.safeFacts.some((f) => !f.safeToMention)) {
    risks.push('has internal intelligence that must not leak')
  }
  if (input.relationshipStage === 'followup') {
    risks.push('appears pushy if no value added')
  }
  if (mode === 'proof_led' && input.matchedProof.length === 0) {
    risks.push('proof-led mode but no relevant proof matched')
  }

  return risks.length > 0 ? risks.join('; ') : 'low'
}

function getCtaStrategy(
  stage: StrategyInput['relationshipStage'],
  mode: MessageMode,
  channel: string,
): string {
  if (stage === 'followup') {
    return 'low-friction: easy yes/no or "not now"'
  }

  if (channel === 'upwork') {
    return 'concrete next step: specific question about their project or offer to share a focused thought'
  }

  switch (mode) {
    case 'relevant_question':
      return 'end with a specific, easy-to-answer question'
    case 'offer_small_win':
      return 'offer a specific useful thing, no call/meeting ask'
    case 'proof_led':
      return 'light credibility signal + simple question'
    case 'warm_conversational':
      return 'genuine question or permission to share something'
    default:
      return 'simple, low-friction question or offer'
  }
}

/**
 * Serialize strategy for the message generator prompt.
 * Compact — never dumps a full CV or all context.
 */
export function strategyToPromptBlock(strategy: OutreachStrategy, revenue?: RevenueStrategy | null): string {
  if (revenue) {
    return revenueStrategyToPromptBlock(revenue)
  }
  if (strategy.allowedNow || strategy.messageJob) {
    const synthetic: RevenueStrategy = {
      who: strategy.leadContext,
      assessment: strategy.assessment ?? {
        fit: 'UNKNOWN',
        intent: 'UNKNOWN',
        confidence: 'LOW',
        fitWhy: '',
        intentWhy: '',
        confidenceWhy: '',
      },
      contact: strategy.contact
        ? {
            reason: strategy.contact.reason as import('./revenue-strategy').ContactReason,
            action: strategy.contact.action as import('./revenue-strategy').ContactAction,
            why: strategy.contact.why,
            messageRecommended: strategy.contact.messageRecommended,
            noMessageReason: strategy.contact.noMessageReason,
          }
        : {
            reason: 'NO_CREDIBLE_REASON',
            action: 'SKIP',
            why: strategy.uiRationale ?? '',
            messageRecommended: false,
            noMessageReason: 'No revenue strategy attached.',
          },
      knownFacts: [],
      supportedInferences: [],
      unknowns: [],
      commercialSituation: strategy.leadContext,
      relationshipState: strategy.relationshipStage,
      strongestEvidence: strategy.safeTrigger,
      reasonToActNow: strategy.uiRationale ?? null,
      primaryUncertainty: null,
      nextMove: 'ASK',
      messageJob: (strategy.messageJob as RevenueStrategy['messageJob']) ?? null,
      allowedNow: strategy.allowedNow ?? [],
      evidenceToHold: strategy.hold ?? [],
      unsupportedClaims: strategy.neverClaim ?? [],
      proofNeeded: null,
      successCondition: strategy.messageGoal,
      knowledge: [],
      nextAction: strategy.messageGoal,
      uiRationale: strategy.uiRationale ?? strategy.messageGoal,
      wordBudget: strategy.wordBudget ?? { min: 15, max: 55, label: strategy.channel },
      channel: strategy.channel as RevenueStrategy['channel'],
    }
    return revenueStrategyToPromptBlock(synthetic)
  }

  const parts = [
    `## Outreach Strategy`,
    ``,
    `**Mode:** ${strategy.mode}`,
    `**Goal:** ${strategy.messageGoal}`,
    `**Channel:** ${strategy.channel}`,
    `**Tone:** ${strategy.tone}`,
    ``,
    `### Lead context (safe to reference):`,
    strategy.leadContext,
    ``,
    `### Safe trigger (what to reference):`,
    strategy.safeTrigger,
  ]

  if (strategy.relevantProof.length > 0) {
    parts.push(
      ``,
      `### Relevant proof (sender can credibly reference):`,
      ...strategy.relevantProof.map((p) => `- ${p}`),
    )
  }

  parts.push(
    ``,
    `### CTA approach:`,
    strategy.ctaStrategy,
  )

  if (strategy.risk !== 'low') {
    parts.push(
      ``,
      `### Risks to avoid:`,
      strategy.risk,
    )
  }

  return parts.join('\n')
}
