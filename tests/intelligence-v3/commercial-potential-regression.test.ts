/**
 * Commercial Potential Regression Tests
 *
 * Verifies that the scoring system separates buyer intent from commercial
 * potential. A founder building a product with no explicit buyer request
 * should have meaningful commercial potential (not score 0-5).
 *
 * Test classes:
 * 1. Founder + active product + no explicit request → meaningful score
 * 2. Founder + no product activity → low score
 * 3. Founder + service offering only → low score
 * 4. CTO + product launch → meaningful score
 * 5. CTO job seeker → low score
 * 6. Service provider + explicit buyer request → high score
 * 7. Service provider + no buyer request → low score
 * 8. Recruiter → low score
 * 9. Competitor → low score
 * 10. Explicit freelancer request → high score
 * 11. Multi-company founder → meaningful score
 * 12. Current strong buyer → high score
 */

import { describe, it, expect } from 'vitest'
import { scoreEpisode, type V3ScoreInput } from '@/lib/intelligence-v3/scoring/score-v3'
import { assessCommercialPotential } from '@/lib/intelligence-v3/latent-opportunity'
import type { V3OpportunityEpisode, V3BoundedDecision, V3Event, CommercialPotentialAssessment } from '@/lib/intelligence-v3/types'
import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<V3Event> = {}): V3Event {
  return {
    id: 'evt_test',
    eventType: 'HIRING',
    personId: 'person_1',
    organizationId: 'org_1',
    organizationName: 'TestCo',
    occurredAt: new Date().toISOString(),
    channel: 'linkedin',
    requestedCapability: ['react', 'node.js', 'typescript'],
    targetAudience: 'PUBLIC',
    explicitness: 'EXPLICIT',
    applyInstructions: ['email careers@testco.com'],
    evidenceRefs: [],
    polarity: 'ACTIVE',
    ...overrides,
  }
}

function makeEpisode(overrides: Partial<V3OpportunityEpisode> = {}): V3OpportunityEpisode {
  return {
    id: 'ep_test',
    anchorEvent: makeEvent(),
    organizationId: 'org_1',
    organizationName: 'TestCo',
    needOwnerPersonId: 'person_1',
    needOwnerType: 'HIRING_NEED',
    explicitRequest: true,
    requestedCapabilities: ['react', 'node.js', 'typescript'],
    applicationChannels: ['email'],
    evidenceRefs: ['ev_1', 'ev_2'],
    eventRefs: ['evt_test'],
    status: 'CURRENT',
    detectedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ageDays: 2,
    ...overrides,
  }
}

function makeDecision(overrides: Partial<V3BoundedDecision> = {}): V3BoundedDecision {
  return {
    relationship: 'BUYER',
    buyerRequestProbability: 0.8,
    externalNeedProbability: 0.7,
    needOwnerType: 'HIRING_NEED',
    fit: 'STRONG',
    timing: 'CURRENT',
    access: 'DIRECT',
    messageEligible: 0.7,
    providerConfidence: 0.8,
    ...overrides,
  }
}

function makeCommercialPotential(overrides: Partial<CommercialPotentialAssessment> = {}): CommercialPotentialAssessment {
  return {
    decisionAuthority: 0.5,
    buildIntensity: 'NONE',
    technicalRelevance: 0.3,
    capacityNeedLikelihood: 0.2,
    reachability: 0.5,
    companyMaturity: 0.2,
    commercialActivity: 0.1,
    overallPotential: 'LOW',
    confidence: 0.3,
    signals: [],
    ...overrides,
  }
}

function makeV2Canonical(overrides: Partial<CanonicalProspectIntelligence['intelligence']> = {}): CanonicalProspectIntelligence {
  return {
    version: 'relay_qualification_v2',
    intelligenceRunId: 'test',
    intelligenceInputHash: 'test',
    intelligenceVersion: 'test',
    computedAt: new Date().toISOString(),
    canonicalScore: 50,
    scoreVersion: 'test',
    scoredAt: new Date().toISOString(),
    scoreBreakdown: { dimensions: [], hardNegatives: [], missingInfo: [], total: 50, label: '', reasons: [], watchOut: [] },
    confidence: 50,
    qualification: 'maybe',
    intelligence: {
      person: { fullName: 'Test Person', firstName: 'Test', title: 'Developer', seniority: null, location: null, linkedinUrl: null, otherUrls: [] },
      company: { name: 'TestCo', domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
      opportunity: { signals: [], primarySignal: null, description: null, urgency: 'unknown' },
      job: { title: null, employmentType: 'unknown', workplaceType: 'UNKNOWN', allowedGeography: null, timezone: null, compensation: null, skills: [], seniority: 'unknown', source: null, postedDate: null },
      content: { recentPosts: [], topics: [], explicitProblems: [], initiatives: [], launches: [], technicalSignals: [], hiringSignals: [] },
      probableNeed: null,
      opportunityTrigger: null,
      timingSignal: null,
      risks: [],
      unknowns: [],
      resolvedContradictions: [],
      businessModel: 'PRODUCT',
      relationship: 'UNKNOWN',
      commercialReading: { serviceBuyerIntent: 'MEDIUM', externalEngineeringNeed: 'NONE_DETECTED', immediateBuyerNeed: false, buyerTiming: 'UNKNOWN', productMomentum: 'MEDIUM', customerDiscovery: 'NONE', preLaunchActivity: 'NONE', technicalRelevance: 'MEDIUM', buyerEvidenceKinds: [] },
      remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'UNKNOWN', eligibility: 'ELIGIBLE', reason: '', evidence: [] },
      needOwnershipSummary: { dominant: 'UNKNOWN', counts: { SELF_NEED: 0, CUSTOMER_NEED: 0, MARKET_PROBLEM: 0, SERVICE_OFFERING: 0, PRODUCT_PROBLEM: 0, EMPLOYER_NEED: 0, UNKNOWN: 0 } },
      ...overrides,
    },
    rawSource: { rawInput: '', sourceType: 'mixed', sourceUrl: null, profileUrl: null, companyUrl: null, jobUrl: null, postUrls: [], rawPosts: [], rawJobDescription: null, rawProfileText: null, rawCompanyText: null, capturedAt: new Date().toISOString() },
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Commercial Potential Regression', () => {
  describe('MULTI_FOUNDER_ACTIVE_PRODUCT_BUILDER_NO_EXPLICIT_REQUEST', () => {
    it('founder + active product + no explicit request → meaningful score (not 0-5)', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.9,
        buildIntensity: 'HIGH',
        technicalRelevance: 0.7,
        capacityNeedLikelihood: 0.6,
        reachability: 0.8,
        companyMaturity: 0.5,
        commercialActivity: 0.6,
        overallPotential: 'HIGH',
        confidence: 0.7,
        signals: ['Decision-maker role', 'Active building (HIGH)', 'Technical stack overlap', 'Likely needs external help', 'Reachable'],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: false,
          anchorEvent: makeEvent({ explicitness: 'IMPLIED', eventType: 'PRODUCT_LAUNCH' }),
        }),
        decision: makeDecision({
          relationship: 'SERVICE_PROVIDER',
          buyerRequestProbability: 0.1,
          externalNeedProbability: 0.2,
        }),
        commercialPotential: cp,
      })

      // Must NOT collapse to near-zero
      expect(result.score).toBeGreaterThan(25)
      // Should have commercial potential as a contributing dimension
      const cpDim = result.dimensions.find(d => d.key === 'commercialPotential')
      expect(cpDim).toBeDefined()
      expect(cpDim!.contribution).toBeGreaterThan(5)
    })

    it('founder + multiple companies + recent launch → score reflects commercial potential', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.9,
        buildIntensity: 'VERY_HIGH',
        technicalRelevance: 0.8,
        capacityNeedLikelihood: 0.7,
        reachability: 0.9,
        companyMaturity: 0.6,
        commercialActivity: 0.8,
        overallPotential: 'HIGH',
        confidence: 0.8,
        signals: ['Decision-maker role', 'Active building (VERY_HIGH)', 'Technical stack overlap', 'Likely needs external help', 'Reachable', 'Company growth signals', 'Active commercial activity'],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: false,
          anchorEvent: makeEvent({ explicitness: 'IMPLIED', eventType: 'TECHNICAL_BUILD' }),
        }),
        decision: makeDecision({
          relationship: 'MIXED',
          buyerRequestProbability: 0.15,
          externalNeedProbability: 0.2,
        }),
        commercialPotential: cp,
      })

      // Should be meaningful — at least in the "Maybe" range
      expect(result.score).toBeGreaterThan(35)
    })
  })

  describe('founder + no product activity → low score', () => {
    it('founder title but no building signals → low commercial potential', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.9,
        buildIntensity: 'NONE',
        technicalRelevance: 0.1,
        capacityNeedLikelihood: 0.1,
        reachability: 0.3,
        companyMaturity: 0.1,
        commercialActivity: 0.0,
        overallPotential: 'LOW',
        confidence: 0.2,
        signals: ['Decision-maker role'],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: false,
          anchorEvent: makeEvent({ explicitness: 'INFERRED', eventType: 'OTHER' }),
        }),
        decision: makeDecision({
          relationship: 'UNKNOWN',
          buyerRequestProbability: 0.05,
          externalNeedProbability: 0.05,
          fit: 'WEAK',
          access: 'INDIRECT',
        }),
        commercialPotential: cp,
      })

      // No commercial potential + weak fit + indirect access → low score
      expect(result.score).toBeLessThan(30)
    })
  })

  describe('CTO + product launch → meaningful score', () => {
    it('CTO launching product → commercial potential recognized', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.85,
        buildIntensity: 'HIGH',
        technicalRelevance: 0.7,
        capacityNeedLikelihood: 0.5,
        reachability: 0.7,
        companyMaturity: 0.4,
        commercialActivity: 0.5,
        overallPotential: 'HIGH',
        confidence: 0.6,
        signals: ['Decision-maker role', 'Active building (HIGH)', 'Technical stack overlap', 'Reachable'],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: false,
          anchorEvent: makeEvent({ explicitness: 'IMPLIED', eventType: 'PRODUCT_LAUNCH' }),
        }),
        decision: makeDecision({
          relationship: 'BUYER',
          buyerRequestProbability: 0.2,
          externalNeedProbability: 0.3,
        }),
        commercialPotential: cp,
      })

      expect(result.score).toBeGreaterThan(30)
    })
  })

  describe('service provider + explicit buyer request → high score', () => {
    it('agency hiring for own team → high buyer score', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.7,
        buildIntensity: 'MEDIUM',
        technicalRelevance: 0.8,
        capacityNeedLikelihood: 0.6,
        reachability: 0.8,
        companyMaturity: 0.4,
        commercialActivity: 0.4,
        overallPotential: 'MEDIUM',
        confidence: 0.6,
        signals: ['Decision-maker role', 'Active building (MEDIUM)', 'Technical stack overlap'],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: true,
          anchorEvent: makeEvent({ explicitness: 'EXPLICIT', eventType: 'HIRING' }),
        }),
        decision: makeDecision({
          relationship: 'SERVICE_PROVIDER',
          buyerRequestProbability: 0.85,
          externalNeedProbability: 0.8,
        }),
        commercialPotential: cp,
      })

      // Explicit buyer request should still score high
      expect(result.score).toBeGreaterThan(50)
    })
  })

  describe('service provider + no buyer request → low score', () => {
    it('agency just selling services → low score', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.3,
        buildIntensity: 'NONE',
        technicalRelevance: 0.1,
        capacityNeedLikelihood: 0.1,
        reachability: 0.2,
        companyMaturity: 0.1,
        commercialActivity: 0.0,
        overallPotential: 'LOW',
        confidence: 0.1,
        signals: [],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: false,
          anchorEvent: makeEvent({ explicitness: 'IMPLIED', eventType: 'SERVICE_OFFERING' }),
        }),
        decision: makeDecision({
          relationship: 'SERVICE_PROVIDER',
          buyerRequestProbability: 0.05,
          externalNeedProbability: 0.05,
          fit: 'POOR',
          access: 'NONE',
          timing: 'STALE',
        }),
        commercialPotential: cp,
      })

      expect(result.score).toBeLessThan(20)
    })
  })

  describe('recruiter → low score', () => {
    it('recruiter sourcing candidates → low score', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.2,
        buildIntensity: 'NONE',
        technicalRelevance: 0.05,
        capacityNeedLikelihood: 0.05,
        reachability: 0.2,
        companyMaturity: 0.1,
        commercialActivity: 0.0,
        overallPotential: 'LOW',
        confidence: 0.1,
        signals: [],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: false,
          anchorEvent: makeEvent({ explicitness: 'IMPLIED', eventType: 'HIRING' }),
        }),
        decision: makeDecision({
          relationship: 'SERVICE_PROVIDER',
          buyerRequestProbability: 0.05,
          externalNeedProbability: 0.05,
          needOwnerType: 'SERVICE_OFFERING',
          fit: 'POOR',
          access: 'NONE',
        }),
        commercialPotential: cp,
      })

      expect(result.score).toBeLessThan(15)
    })
  })

  describe('explicit freelancer request → high score', () => {
    it('explicit freelance project need → high buyer score', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.6,
        buildIntensity: 'LOW',
        technicalRelevance: 0.7,
        capacityNeedLikelihood: 0.8,
        reachability: 0.9,
        companyMaturity: 0.2,
        commercialActivity: 0.3,
        overallPotential: 'MEDIUM',
        confidence: 0.5,
        signals: ['Technical stack overlap', 'Likely needs external help', 'Reachable'],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: true,
          anchorEvent: makeEvent({ explicitness: 'EXPLICIT', eventType: 'FREELANCE_REQUEST' }),
        }),
        decision: makeDecision({
          relationship: 'BUYER',
          buyerRequestProbability: 0.9,
          externalNeedProbability: 0.85,
        }),
        commercialPotential: cp,
      })

      expect(result.score).toBeGreaterThan(60)
    })
  })

  describe('current strong buyer → high score', () => {
    it('explicit hiring post with strong fit → top score', () => {
      const cp = makeCommercialPotential({
        decisionAuthority: 0.7,
        buildIntensity: 'MEDIUM',
        technicalRelevance: 0.8,
        capacityNeedLikelihood: 0.7,
        reachability: 0.9,
        companyMaturity: 0.4,
        commercialActivity: 0.5,
        overallPotential: 'HIGH',
        confidence: 0.7,
        signals: ['Decision-maker role', 'Active building (MEDIUM)', 'Technical stack overlap', 'Likely needs external help', 'Reachable'],
      })

      const result = scoreEpisode({
        episode: makeEpisode({
          explicitRequest: true,
          anchorEvent: makeEvent({ explicitness: 'EXPLICIT', eventType: 'HIRING' }),
        }),
        decision: makeDecision({
          relationship: 'BUYER',
          buyerRequestProbability: 0.85,
          externalNeedProbability: 0.8,
        }),
        commercialPotential: cp,
      })

      expect(result.score).toBeGreaterThan(60)
    })
  })

  describe('commercial potential assessment', () => {
    it('assesses founder building SaaS as HIGH potential', async () => {
      const v2 = makeV2Canonical({
        person: {
          fullName: 'Jane Founder',
          firstName: 'Jane',
          title: 'Founder & CEO',
          seniority: 'executive',
          location: 'San Francisco',
          linkedinUrl: 'https://linkedin.com/in/jane',
          otherUrls: [],
          affiliations: [
            { organizationName: 'ProductCo', role: 'Founder', relationship: 'founded_company', isCurrent: true },
          ],
        },
        company: {
          name: 'ProductCo',
          domain: 'productco.com',
          linkedinUrl: null,
          industry: 'SaaS',
          size: '1-10',
          sizeEvidence: 'small team',
          product: 'AI-powered workflow platform',
          stage: 'seed',
          stageEvidence: 'raised seed round',
        },
        content: {
          recentPosts: [{ paraphrase: 'Launched our MVP', verbatimQuote: null, signals: ['launch'] }],
          topics: ['saas', 'ai'],
          explicitProblems: [],
          initiatives: ['building v2 platform'],
          launches: ['MVP launch'],
          technicalSignals: ['react', 'typescript', 'node'],
          hiringSignals: [],
        },
      })

      const rawText = `Jane Founder
Founder & CEO at ProductCo

Building an AI-powered workflow platform. Just launched our MVP.
React, TypeScript, Node.js.`

      const cp = await assessCommercialPotential(v2, rawText)

      expect(cp.overallPotential).toBe('HIGH')
      expect(cp.decisionAuthority).toBeGreaterThan(0.7)
      expect(['HIGH', 'VERY_HIGH']).toContain(cp.buildIntensity)
      expect(cp.technicalRelevance).toBeGreaterThan(0.3)
    })

    it('assesses recruiter as LOW potential', async () => {
      const v2 = makeV2Canonical({
        person: {
          fullName: 'Bob Recruiter',
          firstName: 'Bob',
          title: 'Technical Recruiter',
          seniority: 'mid',
          location: 'New York',
          linkedinUrl: null,
          otherUrls: [],
          affiliations: [{ organizationName: 'TalentAgency', role: 'Recruiter', relationship: 'current_employer', isCurrent: true }],
        },
        company: {
          name: 'TalentAgency',
          domain: null,
          linkedinUrl: null,
          industry: 'Staffing',
          size: '50-200',
          sizeEvidence: null,
          product: null,
          stage: null,
          stageEvidence: null,
        },
        content: {
          recentPosts: [],
          topics: ['hiring', 'talent'],
          explicitProblems: [],
          initiatives: [],
          launches: [],
          technicalSignals: [],
          hiringSignals: ['hiring for clients'],
        },
      })

      const rawText = `Bob Recruiter
Technical Recruiter at TalentAgency

Helping companies find top talent. We're hiring for our clients.
Contact us if you have candidates to place.`

      const cp = await assessCommercialPotential(v2, rawText)

      expect(cp.overallPotential).toBe('LOW')
      expect(cp.decisionAuthority).toBeLessThan(0.4)
    })

    it('assesses service provider building product as MEDIUM/HIGH', async () => {
      const v2 = makeV2Canonical({
        person: {
          fullName: 'Alex Builder',
          firstName: 'Alex',
          title: 'Founder at DevAgency',
          seniority: 'executive',
          location: 'Remote',
          linkedinUrl: null,
          otherUrls: [],
          affiliations: [
            { organizationName: 'DevAgency', role: 'Founder', relationship: 'founded_company', isCurrent: true },
            { organizationName: 'NewProduct', role: 'Creator', relationship: 'founded_company', isCurrent: true },
          ],
        },
        company: {
          name: 'DevAgency',
          domain: null,
          linkedinUrl: null,
          industry: 'Software Development',
          size: '1-10',
          sizeEvidence: null,
          product: null,
          stage: null,
          stageEvidence: null,
        },
        content: {
          recentPosts: [],
          topics: ['react', 'node', 'saas'],
          explicitProblems: [],
          initiatives: ['building new SaaS product'],
          launches: ['beta launch'],
          technicalSignals: ['react', 'typescript', 'node'],
          hiringSignals: [],
        },
      })

      const rawText = `Alex Builder
Founder at DevAgency

I run a dev agency helping companies build products.
Also building a new SaaS product — just launched beta.
React, TypeScript, Node.js.`

      const cp = await assessCommercialPotential(v2, rawText)

      // Should be at least MEDIUM — they're building something
      expect(['MEDIUM', 'HIGH']).toContain(cp.overallPotential)
      expect(cp.buildIntensity).not.toBe('NONE')
    })
  })

  describe('score distribution sanity', () => {
    it('explicit buyer scores higher than latent potential alone', () => {
      const cpHigh = makeCommercialPotential({
        decisionAuthority: 0.9,
        buildIntensity: 'HIGH',
        technicalRelevance: 0.8,
        capacityNeedLikelihood: 0.7,
        reachability: 0.9,
        companyMaturity: 0.6,
        commercialActivity: 0.7,
        overallPotential: 'HIGH',
        confidence: 0.8,
        signals: ['Decision-maker role', 'Active building (HIGH)', 'Technical stack overlap', 'Likely needs external help', 'Reachable'],
      })

      const explicitBuyer = scoreEpisode({
        episode: makeEpisode({ explicitRequest: true }),
        decision: makeDecision({ buyerRequestProbability: 0.85 }),
        commercialPotential: cpHigh,
      })

      const latentOnly = scoreEpisode({
        episode: makeEpisode({ explicitRequest: false }),
        decision: makeDecision({ buyerRequestProbability: 0.1, relationship: 'SERVICE_PROVIDER' }),
        commercialPotential: cpHigh,
      })

      // Explicit buyer should score higher than latent-only
      expect(explicitBuyer.score).toBeGreaterThan(latentOnly.score)
      // But latent-only should still be meaningful
      expect(latentOnly.score).toBeGreaterThan(20)
    })

    it('no commercial potential + poor fit + no access → score stays low', () => {
      const cpLow = makeCommercialPotential({
        decisionAuthority: 0.2,
        buildIntensity: 'NONE',
        technicalRelevance: 0.1,
        capacityNeedLikelihood: 0.1,
        reachability: 0.1,
        companyMaturity: 0.1,
        commercialActivity: 0.0,
        overallPotential: 'LOW',
        confidence: 0.1,
        signals: [],
      })

      const result = scoreEpisode({
        episode: makeEpisode({ explicitRequest: false }),
        decision: makeDecision({
          buyerRequestProbability: 0.05,
          fit: 'POOR',
          access: 'NONE',
          timing: 'STALE',
        }),
        commercialPotential: cpLow,
      })

      expect(result.score).toBeLessThan(25)
    })

    it('commercial potential makes meaningful difference in score', () => {
      const cpLow = makeCommercialPotential({
        decisionAuthority: 0.2,
        buildIntensity: 'NONE',
        technicalRelevance: 0.1,
        capacityNeedLikelihood: 0.1,
        reachability: 0.3,
        companyMaturity: 0.1,
        commercialActivity: 0.0,
        overallPotential: 'LOW',
        confidence: 0.1,
        signals: [],
      })

      const cpHigh = makeCommercialPotential({
        decisionAuthority: 0.9,
        buildIntensity: 'HIGH',
        technicalRelevance: 0.7,
        capacityNeedLikelihood: 0.6,
        reachability: 0.8,
        companyMaturity: 0.5,
        commercialActivity: 0.6,
        overallPotential: 'HIGH',
        confidence: 0.7,
        signals: ['Decision-maker role', 'Active building (HIGH)', 'Technical stack overlap'],
      })

      const baseDecision = makeDecision({
        buyerRequestProbability: 0.1,
        externalNeedProbability: 0.1,
        fit: 'MEDIUM',
        timing: 'CURRENT',
        access: 'INDIRECT',
      })

      const lowResult = scoreEpisode({
        episode: makeEpisode({ explicitRequest: false }),
        decision: baseDecision,
        commercialPotential: cpLow,
      })

      const highResult = scoreEpisode({
        episode: makeEpisode({ explicitRequest: false }),
        decision: baseDecision,
        commercialPotential: cpHigh,
      })

      // Commercial potential should make a meaningful difference
      expect(highResult.score).toBeGreaterThan(lowResult.score + 10)
    })
  })
})
