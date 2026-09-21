import type { PostPlan, RelayContentOpportunity, ContentJob } from '@/lib/domain/types'

export function buildPostPlanFromOpportunity(opp: RelayContentOpportunity): PostPlan {
  return {
    audience: opp.audienceSegment.replace(/_/g, ' '),
    territory: opp.territory.replace(/_/g, ' '),
    contentJob: opp.contentJob,
    coreInsight: opp.insight,
    evidence: [opp.observation],
    claimBoundaries: opp.claimBoundaries,
    openingStrategy: pickOpeningStrategy(opp.contentJob),
    structure: pickStructure(opp.contentJob),
    takeaway: opp.insight,
    desiredReaction: pickDesiredReaction(opp.contentJob),
    productMention: pickProductMention(opp),
    cta: pickCTA(opp.contentJob),
  }
}

function pickOpeningStrategy(job: ContentJob): string {
  switch (job) {
    case 'teach': return 'Start with a specific observation from product work'
    case 'challenge': return 'Open with a counterintuitive claim grounded in evidence'
    case 'show': return 'Begin with a concrete example or result'
    case 'prove': return 'Open with the hypothesis or question being tested'
    case 'build_in_public': return 'Start with the problem or decision point'
    case 'start_conversation': return 'Open with a question the audience cares about'
    case 'create_category': return 'Define the category or problem space'
    case 'explain_product': return 'Start with the user problem Relay solves'
    case 'convert': return 'Start with the outcome or result'
    default: return 'Start with a specific, concrete observation'
  }
}

function pickStructure(job: ContentJob): string {
  switch (job) {
    case 'teach': return 'observation_to_lesson'
    case 'challenge': return 'expectation_to_reality'
    case 'show': return 'story_to_realization'
    case 'prove': return 'hypothesis_to_result'
    case 'build_in_public': return 'problem_to_decision'
    case 'start_conversation': return 'question_to_insight'
    case 'create_category': return 'category_definition'
    case 'explain_product': return 'problem_to_solution'
    case 'convert': return 'result_to_implication'
    default: return 'observation_to_lesson'
  }
}

function pickDesiredReaction(job: ContentJob): string {
  switch (job) {
    case 'teach': return 'Reader learns something actionable'
    case 'challenge': return 'Reader reconsiders an assumption'
    case 'show': return 'Reader sees a concrete example'
    case 'prove': return 'Reader trusts the evidence'
    case 'build_in_public': return 'Reader follows the journey'
    case 'start_conversation': return 'Reader wants to share their view'
    case 'create_category': return 'Reader adopts a new mental model'
    case 'explain_product': return 'Reader understands the value'
    case 'convert': return 'Reader considers using Relay'
    default: return 'Reader gains a useful insight'
  }
}

function pickProductMention(opp: RelayContentOpportunity): 'none' | 'natural' | 'direct' {
  if (opp.territory === 'building_relay' || opp.territory === 'dogfood') {
    return 'natural'
  }
  if (opp.contentJob === 'explain_product' || opp.contentJob === 'convert') {
    return 'direct'
  }
  return 'none'
}

function pickCTA(job: ContentJob): string | null {
  switch (job) {
    case 'convert': return 'Try Relay free — link in bio'
    case 'explain_product': return 'See how Relay handles this — link in bio'
    case 'start_conversation': return 'What has your experience been? Share below.'
    case 'teach': return null
    case 'challenge': return null
    case 'show': return null
    case 'prove': return null
    case 'build_in_public': return null
    case 'create_category': return null
    default: return null
  }
}
