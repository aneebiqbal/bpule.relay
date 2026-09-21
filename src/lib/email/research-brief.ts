import type { ContactPoint, Lead, ResearchBrief, RightToContactReason } from '@/lib/domain/types'
import type { RevenueStrategy } from '@/lib/relay/revenue-strategy'

function mapRightToContact(strategy: RevenueStrategy): RightToContactReason {
  if (!strategy.contact.messageRecommended) return 'NONE'
  switch (strategy.contact.reason) {
    case 'EXPLICIT_NEED':
      return strategy.knownFacts.some((f) => /hiring|hire/i.test(f)) ? 'HIRING' : 'ACTIVE_NEED'
    case 'DEMONSTRATED_PROBLEM':
      return 'PROJECT_SIGNAL'
    case 'RELEVANT_CHANGE':
      return 'OUTSOURCING_SIGNAL'
    case 'STRONG_FIT':
      return 'STRONG_FIT'
    case 'RELATIONSHIP_CONTEXT':
      return 'RELATIONSHIP'
    default:
      return 'NONE'
  }
}

export function buildResearchBrief(input: {
  lead: Lead
  contactPoint: ContactPoint | null
  revenue: RevenueStrategy
}): ResearchBrief {
  const { lead, contactPoint, revenue } = input
  const rightToContact = mapRightToContact(revenue)

  return {
    person: lead.contactName ?? null,
    currentRole: lead.contactTitle ?? null,
    company: lead.company,
    companyOffering: null,
    companyStage: null,
    currentSignals: revenue.allowedNow.slice(0, 3),
    currentOpportunity: revenue.reasonToActNow,
    relationshipType: revenue.relationshipState,
    fit: revenue.assessment.fit,
    intent: revenue.assessment.intent,
    confidence: revenue.assessment.confidence,
    rightToContact,
    recentRelevantEvidence: revenue.allowedNow.slice(0, 4),
    possibleNeed: revenue.primaryUncertainty,
    known: revenue.knownFacts,
    inferred: revenue.supportedInferences,
    unknown: revenue.unknowns,
    thingsNotToClaim: revenue.unsupportedClaims,
    contactRoute: contactPoint?.type === 'email' ? 'BUSINESS_EMAIL' : 'NO_EMAIL',
    sourceReferences: [
      {
        label: lead.url ?? lead.company,
        url: lead.url,
        sourceType: lead.source ?? null,
      },
      ...(contactPoint
        ? [{ label: contactPoint.value, url: contactPoint.sourceUrl, sourceType: contactPoint.sourceType }]
        : []),
    ],
  }
}
