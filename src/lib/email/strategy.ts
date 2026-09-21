import type {
  EmailGoal,
  EmailStrategy,
  OutreachArtifact,
  ResearchBrief,
  RevenueIdentity,
} from '@/lib/domain/types'
import type { RevenueStrategy } from '@/lib/relay/revenue-strategy'

function goalFromRevenue(source: RevenueStrategy, followup: boolean): EmailGoal {
  if (followup) return 'QUALIFY_NEED'
  if (source.messageJob === 'MOVE_TO_CALL') return 'BOOK_CALL'
  if (source.messageJob === 'CLOSE_LOOP') return 'RECONNECT'
  return 'GET_REPLY'
}

function attachmentRecommendation(
  brief: ResearchBrief,
  artifacts: OutreachArtifact[],
): EmailStrategy['attachmentRecommendation'] {
  const hiringLike = [brief.currentOpportunity, ...brief.currentSignals].some((v) => /hiring|apply|role|engineer/i.test(v ?? ''))
  if (hiringLike) {
    const cv = artifacts.find((a) => a.artifactType === 'CV' || a.artifactType === 'RESUME')
    if (cv) {
      return {
        relevance: 'RELEVANT',
        artifactId: cv.id,
        artifactName: cv.name,
        reason: 'Opportunity looks hiring-oriented and a CV is directly relevant.',
      }
    }
  }

  const caseStudy = artifacts.find((a) => a.artifactType === 'CASE_STUDY' || a.artifactType === 'PROJECT')
  if (caseStudy && brief.intent !== 'LOW') {
    return {
      relevance: 'OPTIONAL',
      artifactId: caseStudy.id,
      artifactName: caseStudy.name,
      reason: 'A case study could help after reply, but not required for first touch.',
    }
  }

  return {
    relevance: 'IRRELEVANT',
    artifactId: null,
    artifactName: null,
    reason: 'No attachment is needed for this first email.',
  }
}

export function buildEmailStrategy(input: {
  brief: ResearchBrief
  revenue: RevenueStrategy
  senderIdentity: RevenueIdentity
  artifacts: OutreachArtifact[]
  followup: boolean
}): EmailStrategy {
  const { brief, revenue, senderIdentity, artifacts, followup } = input
  const goal = goalFromRevenue(revenue, followup)

  return {
    relationshipType: brief.relationshipType,
    opportunityType: brief.rightToContact,
    recipient: `${brief.person ?? 'Unknown'} @ ${brief.company}`,
    sender: senderIdentity.identityName,
    commercialSituation: revenue.commercialSituation,
    strongestEvidence: revenue.strongestEvidence,
    primaryUncertainty: revenue.primaryUncertainty,
    whyEmail: revenue.contact.why,
    emailGoal: goal,
    tone: followup ? 'direct, concise, useful follow-up' : 'direct, human, specific',
    allowedEvidence: revenue.allowedNow,
    proofToUse: revenue.allowedNow.slice(0, 2),
    proofToHold: revenue.evidenceToHold,
    attachmentRecommendation: attachmentRecommendation(brief, artifacts),
    thingsNotToClaim: revenue.unsupportedClaims,
    ctaType: followup ? 'short reminder with value' : 'single low-friction question',
    successCondition: revenue.successCondition,
  }
}
