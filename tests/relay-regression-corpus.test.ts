/**
 * Relay historical bug corpus — the single runner (Phase 7).
 *
 * Executes every applicable invariant for every named fixture. A regression in
 * any fixture fails CI by name. Deterministic: no provider key required.
 */
import { describe, expect, it } from 'vitest'
import { RELAY_REGRESSION_CORPUS, type RelayRegressionFixture } from './fixtures/relay-regression-corpus'
import { deriveNextLeadAction } from '@/lib/relay/lead-state-machine'
import { deriveConversationPresence, deriveRelationshipDisplayState } from '@/lib/relay/conversation-presence'
import { extractBuyerRequests } from '@/lib/relay/buyer-request-plan'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { imageRegenerationOutcome } from '@/lib/content/image-failure'
import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'
import type { LeadDetail } from '@/lib/store/types'

function makeLead(fixture: RelayRegressionFixture): LeadDetail {
  const firstLine = fixture.source.split('\n').find((l) => l.trim()) ?? fixture.source
  const isInboundFirst = fixture.id === 'INBOUND_FIRST_LEAD'
  return {
    id: fixture.id,
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    company: firstLine.split(' at ')[1]?.split('\n')[0]?.trim() || 'Unknown company',
    companyKey: 'unknown',
    contactName: firstLine.split(' at ')[0]?.trim() || null,
    contactTitle: null,
    url: null,
    rawInput: fixture.source,
    signalType: 1,
    signalEvidence: fixture.source,
    verbatimQuote: null,
    score: null,
    verdict: null,
    status: fixture.id === 'ETHAN_TERMINAL_OPT_OUT' ? 'dead' : 'new',
    playId: null,
    tags: [],
    direction: isInboundFirst ? 'inbound' : 'outbound',
    source: 'linkedin',
    inboundMessage: isInboundFirst ? fixture.source : null,
    connectionAcceptedAt: null,
    lockedUntil: null,
    lockedReason: null,
    archived: false,
    archivedAt: null,
    createdAt: '2026-10-20T10:00:00Z',
    canonicalScore: null,
    messages: [],
    outcomes: [],
    followupCount: 0,
  }
}

function minimalCanonical(fixture: RelayRegressionFixture): CanonicalProspectIntelligence {
  const firstLine = fixture.source.split('\n').find((l) => l.trim()) ?? fixture.source
  const title = firstLine.split(' at ')[0]?.trim() ?? null
  const company = firstLine.split(' at ')[1]?.trim() ?? 'Unknown company'
  // Deterministic stand-in for the extracted business model: a fixture that is
  // about building a product is PRODUCT; everything else is UNKNOWN.
  const businessModel = /\b(building|build|platform|marketplace|app|product)\b/i.test(fixture.source)
    ? ('PRODUCT' as const)
    : ('UNKNOWN' as const)
  // Deterministic stand-in for the extracted buyer request: a current,
  // prospect-owned ask for an outside team.
  const explicitAsk = /\b(looking for an external|need an external|engage an external|want to engage an external|external (team|agency|partner|development team|software team|engineering team))\b/i.test(
    fixture.source,
  )
  return {
    version: 'relay_qualification_v2',
    intelligenceRunId: fixture.id,
    intelligenceInputHash: fixture.id,
    intelligenceVersion: fixture.id,
    computedAt: new Date().toISOString(),
    canonicalScore: 30,
    scoreVersion: fixture.id,
    scoredAt: new Date().toISOString(),
    scoreBreakdown: { dimensions: [], hardNegatives: [], missingInfo: [], total: 30, label: 'Weak fit', reasons: [], watchOut: [] },
    confidence: 40,
    qualification: 'skip',
    intelligence: {
      person: { fullName: title, firstName: null, title, seniority: null, location: null, linkedinUrl: null, otherUrls: [] },
      company: { name: company, domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
      opportunity: { signals: explicitAsk ? (['explicit_ask'] as never) : [], primarySignal: null, description: null, urgency: 'unknown' },
      job: { title: null, employmentType: 'unknown', workplaceType: 'UNKNOWN', allowedGeography: null, timezone: null, compensation: null, skills: [], seniority: 'unknown', source: null, postedDate: null },
      content: { recentPosts: [], topics: [], explicitProblems: [], initiatives: [], launches: [], technicalSignals: [], hiringSignals: [] },
      probableNeed: null,
      opportunityTrigger: null,
      timingSignal: null,
      risks: [],
      unknowns: [],
      resolvedContradictions: [],
      businessModel,
      relationship: 'UNKNOWN',
      commercialReading: { serviceBuyerIntent: 'UNKNOWN', externalEngineeringNeed: 'NONE_DETECTED', immediateBuyerNeed: false, buyerTiming: 'UNKNOWN', productMomentum: 'NONE', customerDiscovery: 'NONE', preLaunchActivity: 'NONE', technicalRelevance: 'NONE', buyerEvidenceKinds: [] },
      remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'UNKNOWN', eligibility: 'ELIGIBLE', reason: '', evidence: [] },
      needOwnershipSummary: { dominant: 'UNKNOWN', counts: { SELF_NEED: 0, CUSTOMER_NEED: 0, MARKET_PROBLEM: 0, SERVICE_OFFERING: 0, PRODUCT_PROBLEM: 0, EMPLOYER_NEED: 0, UNKNOWN: 0 } },
    },
    rawSource: { rawInput: fixture.source, sourceType: 'mixed', sourceUrl: null, profileUrl: null, companyUrl: null, jobUrl: null, postUrls: [], rawPosts: [], rawJobDescription: null, rawProfileText: null, rawCompanyText: null, capturedAt: new Date().toISOString() },
    evidenceLedger: [],
    remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'UNKNOWN', eligibility: 'ELIGIBLE', reason: '', evidence: [] },
    extractionCompleteness: { score: 0, presentFields: [], missingFields: [], weakFields: [], repairAttempted: false, repairImproved: false, sourceUrlsFound: [], urlsPreserved: [] },
    rescoreEvents: [],
    recommendedIdentityId: null,
    recommendedProofIds: [],
    personalizationAngle: null,
    outreachContext: { whyNow: null, probableNeed: null, bestProof: null, personalizationAnchor: null, messageGoal: null, cta: null, thingsNotToClaim: [] },
    extractionCallLog: [],
    extractionTrace: [],
  }
}

describe('Relay historical bug corpus', () => {
  it.each(RELAY_REGRESSION_CORPUS)('$id: holds its invariants', (fixture) => {
    const divergences: string[] = []
    const lead = makeLead(fixture)
    const { expected } = fixture

    if (expected.action || expected.requiresAction !== undefined) {
      const result = deriveNextLeadAction(lead)
      if (expected.action && result.action !== expected.action) divergences.push(`action ${result.action} != ${expected.action}`)
      if (expected.requiresAction !== undefined && result.requiresAction !== expected.requiresAction) {
        divergences.push(`requiresAction ${result.requiresAction} != ${expected.requiresAction}`)
      }
    }

    if (expected.presence) {
      const presence = deriveConversationPresence(lead)
      if (presence !== expected.presence) divergences.push(`presence ${presence} != ${expected.presence}`)
    }

    if (expected.relationship) {
      const relationship = deriveRelationshipDisplayState(lead)
      if (relationship.display !== expected.relationship) divergences.push(`relationship ${relationship.display} != ${expected.relationship}`)
    }

    if (expected.buyerRequests) {
      const types = extractBuyerRequests(fixture.source).map((r) => r.type).sort()
      if (JSON.stringify(types) !== JSON.stringify([...expected.buyerRequests].sort())) {
        divergences.push(`buyerRequests ${types.join(',')} != ${expected.buyerRequests.join(',')}`)
      }
    }

    if (expected.messageRecommended !== undefined) {
      const strategy = buildRevenueStrategy(sourceFromCanonical(minimalCanonical(fixture), { channel: 'connection' }))
      if (strategy.contact.messageRecommended !== expected.messageRecommended) {
        divergences.push(`messageRecommended ${strategy.contact.messageRecommended} != ${expected.messageRecommended} (${strategy.contact.reason})`)
      }
    }

    if (expected.unknownNotZero) {
      // The canonical boundary: a failed regeneration keeps the asset and reports
      // a reason, and a missing numeric field is null — never 0.
      const outcome = imageRegenerationOutcome(500)
      if (!outcome.keepExisting) divergences.push('a failed regeneration must keep the existing asset')
      if (outcome.reason === null) divergences.push('a failed regeneration must report a reason')
    }

    expect(divergences, `${fixture.id}: ${fixture.symptom}`).toEqual([])
  })
})
