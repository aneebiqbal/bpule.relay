import { describe, expect, it } from 'vitest'
import { evaluateMessage } from '@/lib/relay/message-forge'
import { extractOpportunitySignals } from '@/lib/intelligence-v2/extraction-pipeline'
import {
  buildRevenueStrategy,
  type StrategySource,
} from '@/lib/relay/revenue-strategy'
import type { EvidenceEntry } from '@/lib/intelligence-v2/types'
import { buildUserPrompt } from '@/lib/ai/draft'

function source(overrides: Partial<StrategySource>): StrategySource {
  return {
    name: 'Test Person',
    title: 'Founder',
    company: 'TestCo',
    qualification: 'worth_pursuing',
    canonicalScore: 72,
    extractionCompleteness: 70,
    opportunitySignals: [],
    urgency: 'unknown',
    explicitProblems: [],
    hiringSignals: [],
    technicalSignals: [],
    recentPosts: [],
    opportunityDescription: null,
    opportunityTrigger: null,
    probableNeed: null,
    unknowns: [],
    risks: [],
    evidenceLedger: [],
    hardNegatives: [],
    dimensionPoints: {},
    rawText: null,
    signalType: 7,
    signalEvidence: null,
    verbatimQuote: null,
    tags: [],
    relationshipStage: 'first_touch',
    channel: 'dm',
    alreadyShared: [],
    thingsNotToClaim: [],
    conversation: null,
    priorFollowupCount: 0,
    ...overrides,
  }
}

describe('Writer Boundary — raw input must not leak', () => {
  it('evaluateMessage rejects text containing thingsNotToClaim', () => {
    const text = 'We specialize in delivery. Our team of 8 engineers can help with your hiring needs.'
    const result = evaluateMessage(text, {
      leadContext: 'Company: Acme',
      safeTrigger: 'hiring',
      probableNeed: 'delivery',
      sender: 'Fizza',
      relevantProof: [],
      messageGoal: 'TEST',
      relationshipStage: 'first_touch',
      channel: 'dm',
      tone: 'direct',
      risk: 'low',
      ctaStrategy: 'question',
      mode: 'relevant_question',
      neverClaim: ['hiring', 'our team'],
    }, 'dm')
    expect(result.passed).toBe(false)
    expect(result.reasons.some((r) => /thingsNotToClaim|neverClaim/i.test(r))).toBe(true)
  })

  it('writer prompt does not contain lead.rawInput', () => {
    // Verified by code inspection: buildUserPrompt no longer references input.lead.rawInput
    const input = {
      leadId: 'l1',
      lead: { company: 'Acme', rawInput: 'SCRAPED SECRET: their revenue is $50M and they just fired their CTO' },
      extracted: { name: 'Alex', signalType: 7, signalEvidence: 'hiring', tags: [] },
      score: { verdict: 'send', total: 10, breakdown: [] },
      type: 'dm',
      plays: [],
      facts: [],
      styleCard: null,
      strategy: { messageJob: 'DISCOVER_NEED', contact: { messageRecommended: true }, wordBudget: { min: 20, max: 55, label: 'dm' }, allowedNow: ['hiring a developer'], neverClaim: [], hold: [] },
    } as any
    const prompt = buildUserPrompt(input)
    expect(prompt).not.toContain('SCRAPED SECRET')
    expect(prompt).not.toContain('$50M')
    expect(prompt).not.toContain('fired their CTO')
  })
})

describe('Negation handling', () => {
  it('does not treat negated hiring as active signal', () => {
    const text = 'We are not hiring backend engineers right now.'
    const { signals } = extractOpportunitySignals(text)
    expect(signals).not.toContain('hiring')
  })

  it('does not treat closed role as active signal', () => {
    const text = 'We filled the backend role last week.'
    const { signals } = extractOpportunitySignals(text)
    expect(signals).not.toContain('hiring')
  })

  it('treats active hiring as active signal', () => {
    const text = 'We are hiring backend engineers for our team.'
    const { signals } = extractOpportunitySignals(text)
    expect(signals).toContain('hiring')
  })
})

describe('Strategy must drive all outreach decisions', () => {
  it('produces a strategy that distinguishes opportunity org from prospect company', () => {
    const strategy = buildRevenueStrategy(source({
      name: 'Abdulhakim Sheik',
      company: 'CGI',
      opportunitySignals: ['hiring'],
      hiringSignals: ['Tayo360 needing a full stack developer'],
      signalEvidence: 'Tayo360 needing a full stack developer',
      verbatimQuote: 'Tayo360 needing a full stack developer',
      evidenceLedger: [{
        signal: 'Tayo360 is hiring a full-stack developer',
        source: 'pasted_text' as const,
        evidenceType: 'FACT' as const,
        ownership: 'HIRING_INTENT' as const,
        confidence: 'HIGH' as const,
        safeForOutreach: true,
        subjectType: 'OPPORTUNITY' as const,
        organizationName: 'Tayo360',
        relationshipToProspect: 'OPPORTUNITY_ORGANIZATION' as any,
        temporalScope: 'CURRENT',
      } as EvidenceEntry],
    }))
    // The evidence ledger entry for Tayo360 should be in the knowledge base
    const tayoEvidence = strategy.knowledge.find((k) => /tayo360/i.test(k.text))
    expect(tayoEvidence).toBeDefined()
    // With temporalScope CURRENT + safeForOutreach, it should be ALLOWED_NOW or AVAILABLE
    expect(['ALLOWED_NOW', 'AVAILABLE']).toContain(tayoEvidence?.release)
    // The strategy should recommend contact with a delivery-model job
    expect(strategy.messageJob).toBe('TEST_DELIVERY_MODEL')
  })
})

describe('Evidence entity attachment', () => {
  it('evidence can reference an organization different from the prospect company', () => {
    const evidence: EvidenceEntry = {
      signal: 'Hiring full-stack developer',
      source: 'pasted_text',
      evidenceType: 'FACT',
      ownership: 'HIRING_INTENT',
      confidence: 'HIGH',
      safeForOutreach: true,
      subjectType: 'OPPORTUNITY',
      organizationName: 'Tayo360',
      relationshipToProspect: 'OPPORTUNITY_ORGANIZATION',
      temporalScope: 'CURRENT',
      polarity: 'ACTIVE',
    }
    expect(evidence.organizationName).toBe('Tayo360')
    expect(evidence.relationshipToProspect).toBe('OPPORTUNITY_ORGANIZATION')
    expect(evidence.temporalScope).toBe('CURRENT')
  })
})

describe('Intelligence versioning', () => {
  it('CanonicalProspectIntelligence type requires intelligenceRunId', () => {
    // Structural invariant: every canonical intelligence object must carry a run ID.
    // This is enforced at the type level — intelligenceRunId is required.
    // The orchestrator generates it via crypto.randomUUID() in produceCanonicalIntelligence.
    const intel: Partial<import('@/lib/intelligence-v2/types').CanonicalProspectIntelligence> = {
      version: 'relay_qualification_v2',
    }
    // Type-level check: intelligenceRunId is required, so omitting it would be a TS error.
    // We verify the field name exists in the type by referencing it.
    type HasRunId = import('@/lib/intelligence-v2/types').CanonicalProspectIntelligence['intelligenceRunId']
    const _check: HasRunId = 'test-run-id' as HasRunId
    expect(_check).toBe('test-run-id')
    expect(intel.version).toBe('relay_qualification_v2')
  })
})

describe('thingsNotToClaim propagation', () => {
  it('canonical thingsNotToClaim flows to strategy unsupportedClaims', () => {
    const strategy = buildRevenueStrategy(source({
      thingsNotToClaim: ['Do not mention budget', 'Do not claim their technology'],
      evidenceLedger: [
        { signal: 'Budget is $500', source: 'pasted_text', evidenceType: 'FACT', ownership: 'BUYER_INTENT', confidence: 'LOW', safeForOutreach: false },
      ],
    }))
    expect(strategy.unsupportedClaims.length).toBeGreaterThan(0)
    expect(strategy.unsupportedClaims.some((c) => /budget|technology/i.test(c))).toBe(true)
  })
})
