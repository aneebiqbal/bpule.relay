/**
 * Explanation consistency — Phase 1/2 regression set.
 *
 * The decision is the authority. A verified buyer request must not coexist with
 * "no clear need signal"; a terminal lead must not be described as contactable;
 * a lead with no thread must not be described as having replied.
 *
 * Fixtures: EMMA / NADIA / HANNAH explanation, plus the contradiction detector.
 */
import { describe, expect, it } from 'vitest'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import {
  detectExplanationContradictions,
  filterContradictoryExplanation,
  type ExplanationContext,
} from '@/lib/relay/explanation-consistency'
import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'

function makeCanonical(overrides: Partial<CanonicalProspectIntelligence['intelligence']> = {}): CanonicalProspectIntelligence {
  return {
    version: 'relay_qualification_v2',
    intelligenceRunId: 'test',
    intelligenceInputHash: 'test',
    intelligenceVersion: 'test',
    computedAt: new Date().toISOString(),
    canonicalScore: 35,
    scoreVersion: 'test',
    scoredAt: new Date().toISOString(),
    scoreBreakdown: { dimensions: [], hardNegatives: [], missingInfo: [], total: 35, label: 'Weak fit', reasons: [], watchOut: [] },
    confidence: 50,
    qualification: 'worth_pursuing',
    intelligence: {
      person: { fullName: 'Emma Lindqvist', firstName: 'Emma', title: 'Head of Digital', seniority: null, location: null, linkedinUrl: null, otherUrls: [] },
      company: { name: 'Fjord Bank', domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
      opportunity: { signals: [], primarySignal: null, description: null, urgency: 'unknown' },
      job: { title: null, employmentType: 'unknown', workplaceType: 'UNKNOWN', allowedGeography: null, timezone: null, compensation: null, skills: [], seniority: 'unknown', source: null, postedDate: null },
      content: { recentPosts: [], topics: [], explicitProblems: [], initiatives: [], launches: [], technicalSignals: [], hiringSignals: [] },
      probableNeed: null,
      opportunityTrigger: null,
      timingSignal: null,
      risks: [],
      unknowns: [],
      resolvedContradictions: [],
      businessModel: 'UNKNOWN',
      relationship: 'UNKNOWN',
      // The canonical source facts verified an external request. This is what
      // the explanation must honor instead of re-deriving intent from signals.
      commercialReading: { serviceBuyerIntent: 'EXPLICIT', externalEngineeringNeed: 'EXPLICIT', immediateBuyerNeed: true, buyerTiming: 'CURRENT', productMomentum: 'NONE', customerDiscovery: 'NONE', preLaunchActivity: 'NONE', technicalRelevance: 'NONE', buyerEvidenceKinds: ['BUYER_REQUEST'] },
      remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'UNKNOWN', eligibility: 'ELIGIBLE', reason: '', evidence: [] },
      needOwnershipSummary: { dominant: 'SELF_NEED', counts: { SELF_NEED: 1, CUSTOMER_NEED: 0, MARKET_PROBLEM: 0, SERVICE_OFFERING: 0, PRODUCT_PROBLEM: 0, EMPLOYER_NEED: 0, UNKNOWN: 0 } },
      ...overrides,
    },
    rawSource: { rawInput: '', sourceType: 'mixed', sourceUrl: null, profileUrl: null, companyUrl: null, jobUrl: null, postUrls: [], rawPosts: [], rawJobDescription: null, rawProfileText: null, rawCompanyText: null, capturedAt: new Date().toISOString() },
    evidenceLedger: [],
    remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'UNKNOWN', eligibility: 'ELIGIBLE', reason: '', evidence: [] },
    extractionCompleteness: { score: 50, presentFields: [], missingFields: [], weakFields: [], repairAttempted: false, repairImproved: false, sourceUrlsFound: [], urlsPreserved: [] },
    rescoreEvents: [],
    recommendedIdentityId: null,
    recommendedProofIds: [],
    personalizationAngle: null,
    outreachContext: { whyNow: null, probableNeed: null, bestProof: null, personalizationAnchor: null, messageGoal: null, cta: null, thingsNotToClaim: [] },
    extractionCallLog: [],
    extractionTrace: [],
  }
}

describe('EMMA_HIGH_INTENT_EXPLANATION', () => {
  it('the rationale agrees with the verified request: HIGH intent, not UNKNOWN', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(makeCanonical(), { channel: 'connection' }))
    expect(strategy.assessment.intent).toBe('HIGH')
    expect(strategy.uiRationale).toMatch(/HIGH intent/i)
    expect(strategy.uiRationale).not.toMatch(/UNKNOWN intent/i)
    expect(strategy.uiRationale).not.toMatch(/have not asked for help/i)
  })
})

describe('NADIA_HIGH_INTENT_EXPLANATION', () => {
  it('an explicit ask yields a HIGH-intent rationale', () => {
    const strategy = buildRevenueStrategy(
      sourceFromCanonical(
        makeCanonical({
          person: { fullName: 'Nadia Rahman', firstName: 'Nadia', title: 'CTO', seniority: null, location: null, linkedinUrl: null, otherUrls: [] },
          company: { name: 'Meridian Logistics', domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
          opportunity: { signals: ['explicit_ask'], primarySignal: 'explicit_ask', description: null, urgency: 'immediate' },
        }),
        { channel: 'connection' },
      ),
    )
    expect(strategy.assessment.intent).toBe('HIGH')
    expect(strategy.uiRationale).toMatch(/HIGH intent/i)
  })
})

describe('HANNAH_MODEL_DISAGREEMENT_EXPLANATION', () => {
  it('a verified request keeps HIGH intent even with no V2 signals', () => {
    const strategy = buildRevenueStrategy(
      sourceFromCanonical(
        makeCanonical({
          person: { fullName: 'Hannah Cole', firstName: 'Hannah', title: 'VP Operations', seniority: null, location: null, linkedinUrl: null, otherUrls: [] },
          company: { name: 'Northwind Retail', domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
          opportunity: { signals: [], primarySignal: null, description: null, urgency: 'unknown' },
        }),
        { channel: 'connection' },
      ),
    )
    expect(strategy.assessment.intent).toBe('HIGH')
    expect(strategy.uiRationale).not.toMatch(/UNKNOWN intent/i)
  })
})

describe('detectExplanationContradictions', () => {
  const base: ExplanationContext = {
    verifiedBuyerRequest: true,
    buyerIntentLevel: 'HIGH',
    terminal: false,
    hasThread: false,
    accessLevel: null,
    fit: 'HIGH',
    hasCurrentTiming: true,
  }

  it('a verified request cannot coexist with "No clear need signal"', () => {
    const found = detectExplanationContradictions(base, 'watchOut', 'No clear need signal from evidence.')
    expect(found.map((c) => c.code)).toContain('VERIFIED_BUYER_BUT_DENIED_REQUEST')
    expect(found[0].severity).toBe('blocker')
  })

  it('a verified request cannot coexist with "they have not asked for help"', () => {
    const found = detectExplanationContradictions(base, 'rationale', 'A relevant change exists, but they have not asked for help.')
    expect(found.map((c) => c.code)).toContain('VERIFIED_BUYER_BUT_DENIED_REQUEST')
  })

  it('a terminal lead cannot be offered contact', () => {
    const found = detectExplanationContradictions({ ...base, terminal: true, verifiedBuyerRequest: false }, 'nextStep', 'Send a short connection note')
    expect(found.map((c) => c.code)).toContain('TERMINAL_BUT_CONTACTABLE')
  })

  it('a lead with no thread cannot claim a reply', () => {
    const found = detectExplanationContradictions({ ...base, hasThread: false, verifiedBuyerRequest: false }, 'rationale', 'They replied and are waiting.')
    expect(found.map((c) => c.code)).toContain('NO_THREAD_BUT_CLAIMS_REPLY')
  })

  it('a DIRECT access lead cannot deny a contact route', () => {
    const found = detectExplanationContradictions({ ...base, accessLevel: 'DIRECT', verifiedBuyerRequest: false }, 'missingEvidence', 'No clear route to contact this person.')
    expect(found.map((c) => c.code)).toContain('ACCESS_BUT_DENIES_ROUTE')
  })

  it('a LOW fit lead cannot claim strong fit', () => {
    const found = detectExplanationContradictions({ ...base, fit: 'LOW', verifiedBuyerRequest: false }, 'rationale', 'Strong fit on the available evidence.')
    expect(found.map((c) => c.code)).toContain('LOW_FIT_BUT_CLAIMS_STRONG_FIT')
  })

  it('consistent lines produce no contradiction', () => {
    expect(detectExplanationContradictions(base, 'watchOut', 'Remote eligibility unclear.')).toEqual([])
    expect(detectExplanationContradictions({ ...base, verifiedBuyerRequest: false, buyerIntentLevel: 'UNKNOWN' }, 'watchOut', 'No clear need signal from evidence.')).toEqual([])
  })
})

describe('filterContradictoryExplanation', () => {
  it('removes only the lines that contradict the decision', () => {
    const ctx: ExplanationContext = {
      verifiedBuyerRequest: true,
      buyerIntentLevel: 'HIGH',
      terminal: false,
      hasThread: false,
      accessLevel: null,
      fit: 'HIGH',
      hasCurrentTiming: true,
    }
    const items = [
      'Remote eligibility unclear: No workplace information.',
      'No clear need signal from evidence.',
      'No clear route to contact this person.',
    ]
    const { kept, removed } = filterContradictoryExplanation(items, ctx, 'missingEvidence')
    expect(kept).toEqual([
      'Remote eligibility unclear: No workplace information.',
      'No clear route to contact this person.',
    ])
    expect(removed.map((c) => c.code)).toContain('VERIFIED_BUYER_BUT_DENIED_REQUEST')
  })
})
