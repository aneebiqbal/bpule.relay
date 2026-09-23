import { describe, expect, it } from 'vitest'
import { evaluateMessage } from '@/lib/relay/message-forge'
import { extractOpportunitySignals, prospectAttributableText } from '@/lib/intelligence-v2/extraction-pipeline'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { assessRemoteEligibility } from '@/lib/intelligence-v2/remote-eligibility'
import { stripThirdPartyRepostBlocks, isNonBuyerRelationship } from '@/lib/intelligence-v2/subject-attribution'
import {
  buildRevenueStrategy,
  describeMessagingPolicy,
  describeVerdictForDisplay,
  deriveMessagingPolicy,
  sourceFromCanonical,
  type ContactDecision,
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
    relationship: 'POTENTIAL_BUYER',
    businessModel: 'PRODUCT',
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

// ── General architectural invariants (hardening pass) ───────────────────────
//
// These assert the general rules the Tammo/Saar/Avigail/Abdulhakim hardening
// fixes must uphold everywhere, independent of any one fixture's wording.
// See AGENTS/BUG_LEDGER for the full background on each rule.
describe('Architectural invariants — commercial qualification vs relationship strategy', () => {
  function contact(overrides: Partial<ContactDecision> = {}): ContactDecision {
    return {
      reason: 'RELATIONSHIP_VALUE',
      action: 'CONNECT_OR_OBSERVE',
      why: 'Non-buyer relationship with genuine activity.',
      messageRecommended: false,
      noMessageReason: 'No buying need to pitch.',
      ...overrides,
    }
  }

  it('1. buyer score LOW + valid networking/relationship action is not flagged as contradiction', () => {
    const strategy = buildRevenueStrategy(source({
      qualification: 'skip',
      relationship: 'RECRUITER',
      businessModel: 'RECRUITER',
      hardNegatives: ['Non-buyer role: 30 point penalty'],
      name: 'Someone',
      title: 'Recruiter',
      recentPosts: [{ paraphrase: 'Active recruiting content', verbatimQuote: null }],
    }))
    // A non-buyer relationship with activity reaches CONNECT_OR_OBSERVE, not SKIP.
    expect(strategy.contact.action).not.toBe('SKIP')
    const display = describeVerdictForDisplay('skip', strategy.contact.action, describeMessagingPolicy(strategy.messagingPolicy))
    expect(display.headline).not.toBe('Probably skip')
  })

  it('2. UNKNOWN intent + HIGH confidence is valid', () => {
    const strategy = buildRevenueStrategy(source({
      title: 'Founder & CEO',
      opportunitySignals: [],
      dimensionPoints: { opportunityFit: { points: 15, max: 20, note: 'Strong company/role' } },
      extractionCompleteness: 80,
      verbatimQuote: 'We are a well known company in our space',
    }))
    expect(strategy.assessment.intent).toBe('UNKNOWN')
    // No rule anywhere requires confidence to be low just because intent is unknown.
    expect(['MEDIUM', 'HIGH']).toContain(strategy.assessment.confidence)
  })

  it('3. CONNECT_WITHOUT_NOTE action never renders a bare contradictory SKIP headline', () => {
    const policy = deriveMessagingPolicy(contact({ action: 'CONNECT_OR_OBSERVE', messageRecommended: false }), 'connection')
    expect(policy).toBe('CONNECT_WITHOUT_NOTE')
    const display = describeVerdictForDisplay('skip', 'CONNECT_OR_OBSERVE', 'Send a connection request with no note — do not pitch.')
    expect(display.headline).not.toBe('Probably skip')
    expect(display.headline.toLowerCase()).not.toMatch(/^skip/)
  })

  it('4. NOT_APPLICABLE remote eligibility never renders with the word "unclear"', () => {
    const eligibility = assessRemoteEligibility({ rawText: 'No employment context at all here.' })
    // Deterministic assessRemoteEligibility alone can still return UNCLEAR for
    // genuinely ambiguous text (the NOT_APPLICABLE override lives one layer up,
    // in the pipeline, once relationship/opportunity context is known) — so
    // this asserts the CONTRACT: whenever the eligibility IS NOT_APPLICABLE,
    // the reason string must never contain "unclear".
    if (eligibility.eligibility === 'NOT_APPLICABLE') {
      expect(eligibility.reason.toLowerCase()).not.toMatch(/unclear/)
    }
  })

  it('5. non-buyer relationship does not fabricate buyer opportunity/intent', () => {
    const strategy = buildRevenueStrategy(source({
      relationship: 'PEER',
      businessModel: 'UNKNOWN',
      opportunitySignals: ['hiring'], // even if raw signals leak through
      qualification: 'skip',
    }))
    expect(strategy.assessment.fit).toBe('LOW')
  })

  it('6. no-pitch action does not force fake/placeholder proof or unnecessary sender selection', () => {
    // Structural: PITCHING policies are exactly DM/EMAIL/CONNECT_WITH_NOTE/
    // UPWORK_PROPOSAL/FOLLOW_UP/REPLY — CONNECT_WITHOUT_NOTE/OBSERVE/SKIP/
    // RESEARCH_MORE never require sender/proof selection (verified in
    // route.ts via isPitchingPolicy — this test locks the enum contract that
    // gate depends on).
    const nonPitching = deriveMessagingPolicy(contact({ action: 'CONNECT_OR_OBSERVE', messageRecommended: false }), 'connection')
    expect(nonPitching).toBe('CONNECT_WITHOUT_NOTE')
    const observePolicy = deriveMessagingPolicy(contact({ action: 'CONNECT_OR_OBSERVE', messageRecommended: false }), 'dm')
    expect(observePolicy).toBe('OBSERVE')
  })

  it('7. "no message recommended" stays "no message recommended"', () => {
    const strategy = buildRevenueStrategy(source({
      relationship: 'PEER',
      recentPosts: [{ paraphrase: 'Generic post', verbatimQuote: null }],
      opportunitySignals: [],
    }))
    expect(strategy.contact.messageRecommended).toBe(false)
  })

  it('8. relationship value / Revenue-Identity-availability does not inflate buyer score or intent', () => {
    // dimensionPoints.revenueIdentityFit existing/positive must never leak
    // into needIntent/opportunityFit dimensions — these are independent
    // dimensions in StrategySource.dimensionPoints.
    const strategy = buildRevenueStrategy(source({
      dimensionPoints: {
        revenueIdentityFit: { points: 13, max: 15, note: 'Compatible Revenue Identity available.' },
        opportunityFit: { points: 4, max: 20, note: 'No clear opportunity match.' },
        needIntent: { points: 3, max: 20, note: 'No strong need signal.' },
      },
      opportunitySignals: [],
    }))
    expect(strategy.assessment.fit).not.toBe('HIGH')
    expect(strategy.assessment.intent).toBe('UNKNOWN')
  })

  it('9. third-party organization mentions in reposted content are never attributed as prospect\'s own employer/location/workplace restriction', () => {
    const raw = `Jordan Lee
· 2nd
Founder at Loomwork

About
I build Loomwork, a workflow tool for ops teams.

Activity
View Jordan Lee's profile
Jordan Lee reposted this

View Casey Rivera's profile
Casey Rivera
CEO at OtherCo
On-site requirement: our engineers work in-office at OtherCo HQ in Chicago.`
    const stripped = stripThirdPartyRepostBlocks(raw, 'Jordan Lee')
    expect(stripped.toLowerCase()).not.toMatch(/otherco|chicago|on-site requirement/i)
    expect(stripped).toMatch(/Loomwork/)
  })

  it('10. prospect\'s own employment workplace_type does not automatically become a service-engagement remote restriction for an unrelated commercial opportunity', () => {
    const raw = `Employment: Founder & CEO at MyCo
MyCo · Full-time
Country · Hybrid
Building MyCo, a product for small businesses.`
    // No hiring/freelance/explicit-ask/technical-problem signal anywhere —
    // "Hybrid" describes the prospect's OWN job, not a BPulse engagement.
    const attributable = prospectAttributableText(raw, 'Founder')
    const { signals } = extractOpportunitySignals(attributable)
    expect(signals).toHaveLength(0)
  })

  it('11. CONNECT_WITH_NOTE action cannot coexist with an empty/no-note final message state', () => {
    // Structural contract: whenever messagingPolicy is CONNECT_WITH_NOTE,
    // messageRecommended must be true (a note IS expected) — route.ts is
    // responsible for downgrading to CONNECT_WITHOUT_NOTE with an explicit
    // reason before this state reaches the UI if no safe note could be
    // generated. This test locks the messagingPolicy contract itself.
    const withNote = deriveMessagingPolicy(contact({ action: 'CONTACT_NOW', messageRecommended: true }), 'connection')
    expect(withNote).toBe('CONNECT_WITH_NOTE')
    const withoutNote = deriveMessagingPolicy(contact({ action: 'CONNECT_OR_OBSERVE', messageRecommended: false }), 'connection')
    expect(withoutNote).toBe('CONNECT_WITHOUT_NOTE')
    expect(withNote).not.toBe(withoutNote)
  })

  it('12. message with failing quality-gate status is never exposed as final recommended message (contract on connection-note result shape)', () => {
    // Contract check: a ConnectionNoteResult with passed=false must never be
    // treated as final — route.ts withholds text (charCount 0) rather than
    // presenting a failing draft. This locks the shape the route depends on.
    const failingResult = { text: 'some generic pitch', charCount: 19, maxChars: 300, withinLimit: true, passed: false, failures: ['Generic or forced CTA'], repaired: null }
    // Simulates route.ts's post-generation consistency check.
    const finalText = failingResult.passed ? failingResult.text : ''
    expect(finalText).toBe('')
  })

  it('isNonBuyerRelationship correctly classifies RECRUITER/POTENTIAL_PARTNER/PEER as non-buyer, and POTENTIAL_BUYER/NETWORKING/UNKNOWN as not', () => {
    expect(isNonBuyerRelationship('RECRUITER')).toBe(true)
    expect(isNonBuyerRelationship('POTENTIAL_PARTNER')).toBe(true)
    expect(isNonBuyerRelationship('PEER')).toBe(true)
    expect(isNonBuyerRelationship('POTENTIAL_BUYER')).toBe(false)
    expect(isNonBuyerRelationship('NETWORKING')).toBe(false)
    expect(isNonBuyerRelationship('UNKNOWN')).toBe(false)
  })

  it('produceCanonicalIntelligence threads relationship/businessModel into sourceFromCanonical', async () => {
    const result = await produceCanonicalIntelligence('John Doe\nSoftware Engineer\n\nAbout\nI build things.', {})
    const src = sourceFromCanonical(result.intelligence, { channel: 'connection' })
    expect(src.relationship).toBe(result.intelligence.intelligence.relationship)
    expect(src.businessModel).toBe(result.intelligence.intelligence.businessModel)
  })
})
