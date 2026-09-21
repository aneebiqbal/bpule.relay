import type {
  RelayContentOpportunity,
  RelayEditorialDecision,
  DailyEditorResult,
  ContentJob,
} from '@/lib/domain/types'

interface EditorInput {
  opportunities: RelayContentOpportunity[]
  recentDecisions: RelayEditorialDecision[]
  today: string
}

function scoreOpportunity(
  opp: RelayContentOpportunity,
  recentDecisions: RelayEditorialDecision[],
): number {
  const evidenceScore = opp.evidenceStrength === 'strong' ? 30 : opp.evidenceStrength === 'medium' ? 20 : 10
  const relevanceScore = opp.audienceRelevance * 0.2
  const noveltyScore = opp.novelty * 0.15
  const specificityScore = opp.specificity * 0.1
  const timelinessScore = opp.timeliness * 0.1
  const differentiationScore = opp.relayDifferentiation * 0.1
  const conversationScore = opp.conversationPotential * 0.05
  const learningScore = opp.learningValue * 0.05
  const commercialScore = opp.commercialRelevance * 0.05
  const repetitionPenalty = opp.repetitionRisk * 0.5

  const total = evidenceScore + relevanceScore + noveltyScore + specificityScore +
    timelinessScore + differentiationScore + conversationScore + learningScore +
    commercialScore - repetitionPenalty

  return Math.round(total * 10) / 10
}

function computeRepetitionRisk(
  opp: RelayContentOpportunity,
  recentDecisions: RelayEditorialDecision[],
): number {
  let risk = 0
  for (const decision of recentDecisions) {
    if (!decision.opportunityId) continue
    if (decision.status === 'rejected' || decision.status === 'not_today') continue
    if (decision.opportunityId === opp.id) {
      risk = 100
      break
    }
  }
  return risk
}

function buildWhyToday(opp: RelayContentOpportunity): string {
  const reasons: string[] = []

  if (opp.evidenceStrength === 'strong') {
    reasons.push('Grounded in verified product evidence')
  }
  if (opp.timeliness >= 70) {
    reasons.push('Timely given recent product activity')
  }
  if (opp.novelty >= 70) {
    reasons.push('Not covered in recent posts')
  }
  if (opp.relayDifferentiation >= 70) {
    reasons.push('Strong Relay-specific angle')
  }
  if (opp.audienceRelevance >= 70) {
    reasons.push('Highly relevant to target audience')
  }

  if (reasons.length === 0) {
    reasons.push('Solid editorial opportunity')
  }

  return reasons.join('. ') + '.'
}

function buildWhyRelayHasRight(opp: RelayContentOpportunity): string {
  if (opp.evidenceStrength === 'strong') {
    return 'Relay has direct product experience to support this claim.'
  }
  if (opp.sourceType === 'product_event' || opp.sourceType === 'product_memory') {
    return 'This comes from actual Relay product work.'
  }
  return 'Relay has enough domain expertise to discuss this topic.'
}

function buildTakeaway(opp: RelayContentOpportunity): string {
  return opp.insight
}

export function runDailyEditor(input: EditorInput): DailyEditorResult {
  const { opportunities, recentDecisions, today } = input

  if (opportunities.length === 0) {
    return {
      primary: null,
      backup: null,
      experimental: null,
      reasoning: 'No opportunities available today.',
      whyToday: 'No product memory or events to generate from.',
    }
  }

  const scored = opportunities.map((opp) => {
    const repetitionRisk = computeRepetitionRisk(opp, recentDecisions)
    const scoredOpp = { ...opp, repetitionRisk }
    const score = scoreOpportunity(scoredOpp, recentDecisions)
    return { opportunity: scoredOpp, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const primary = scored[0]?.opportunity ?? null
  const backup = scored[1]?.opportunity ?? null
  const experimental = scored[2]?.opportunity ?? null

  const reasoning = primary
    ? `Selected "${primary.title}" (score: ${scored[0].score}). Evidence: ${primary.evidenceStrength}. Territory: ${primary.territory}. Job: ${primary.contentJob}.`
    : 'No suitable opportunity found.'

  const whyToday = primary ? buildWhyToday(primary) : 'No opportunity to evaluate.'

  return {
    primary,
    backup,
    experimental,
    reasoning,
    whyToday,
  }
}

export function createEditorialDecisionFromResult(
  result: DailyEditorResult,
  today: string,
): Omit<RelayEditorialDecision, 'id' | 'createdAt' | 'decidedAt'> | null {
  if (!result.primary) return null

  return {
    organizationId: result.primary.organizationId,
    decisionDate: today,
    opportunityId: result.primary.id,
    primaryReason: result.reasoning,
    audienceReason: `Targets ${result.primary.audienceSegment.replace(/_/g, ' ')}`,
    timelinessReason: result.whyToday,
    evidenceReason: buildWhyRelayHasRight(result.primary),
    takeaway: buildTakeaway(result.primary),
    status: 'pending',
    adminFeedback: null,
    adminEdits: null,
  }
}
