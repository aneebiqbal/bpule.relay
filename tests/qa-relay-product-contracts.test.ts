/**
 * Relay product contracts — automated guards.
 *
 * These assert the decisions in docs/RELAY_PRODUCT_CONTRACTS.md. They exist so
 * a future change cannot silently reverse a contract. If a test here conflicts
 * with the contract document, the document wins: investigate the test first.
 */
import { describe, expect, it, vi } from 'vitest'
import { separateRoleFromEmployer } from '@/lib/intelligence-v2/extraction-pipeline'
import { formatRoleLine, stripEmployerFromTitle } from '@/lib/leads/role-line'
import { buildRevenueStrategy, sourceFromCanonical } from '@/lib/relay/revenue-strategy'
import { buildLeadParityReport } from '@/lib/relay/lead-parity'
import { resolveBuyerIntentFromSource } from '@/lib/intelligence-v3/buyer-intent'
import { deriveNextLeadAction } from '@/lib/relay/lead-state-machine'
import { imageFailureReason, imageRegenerationOutcome } from '@/lib/content/image-failure'
import { isTerminalOutcome, isTerminalStoredStage } from '@/lib/conversation/terminal'
import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'
import type { LeadDetail } from '@/lib/store/types'
import type { Message } from '@/lib/domain/types'

// The Upwork extractor's provider call is mocked so Contract 6 runs
// deterministically in CI with no provider key.
vi.mock('@/lib/ai/runtime', () => ({
  generate: vi.fn(async () => ({
    data: {
      title: 'Senior React Native Engineer',
      description: 'Maintain our mobile app.',
      skills: [],
      budget: null,
      budgetType: null,
      hourlyRateMin: null,
      hourlyRateMax: null,
      connectsCost: null,
    },
  })),
}))

describe('Contract 1 — title and employer are separate canonical fields', () => {
  it('splits "Role at Company" into a role-only title and the employer', () => {
    const identity = separateRoleFromEmployer('CEO at Hartford AI Partners', 'CEO at Hartford AI Partners', null)
    expect(identity.title).toBe('CEO')
    expect(identity.company).toBe('Hartford AI Partners')
  })

  it('the role-only title and the company compose one subtitle', () => {
    expect(formatRoleLine('CEO', 'Hartford AI Partners')).toBe('CEO · Hartford AI Partners')
  })

  it('a title that already carries the employer is deduplicated, not repeated', () => {
    expect(formatRoleLine('CEO at Hartford AI Partners', 'Hartford AI Partners')).toBe('CEO · Hartford AI Partners')
    expect(stripEmployerFromTitle('CEO at Hartford AI Partners', 'Hartford AI Partners')).toBe('CEO')
  })

  it('the employer is never left inside the role', () => {
    expect(stripEmployerFromTitle('Technical Recruiter at Northstar Technologies', 'Northstar Technologies')).toBe('Technical Recruiter')
  })
})

describe('Contract 2 — a high-potential builder needs product/technical evidence', () => {
  function makeCanonical(overrides: Partial<CanonicalProspectIntelligence['intelligence']> = {}): CanonicalProspectIntelligence {
    return {
      version: 'relay_qualification_v2',
      intelligenceRunId: 'test',
      intelligenceInputHash: 'test',
      intelligenceVersion: 'test',
      computedAt: new Date().toISOString(),
      canonicalScore: 24,
      scoreVersion: 'test',
      scoredAt: new Date().toISOString(),
      scoreBreakdown: { dimensions: [], hardNegatives: [], missingInfo: [], total: 24, label: 'Weak fit', reasons: [], watchOut: [] },
      confidence: 50,
      qualification: 'skip',
      intelligence: {
        person: { fullName: 'Jane CEO', firstName: 'Jane', title: 'CEO', seniority: null, location: null, linkedinUrl: null, otherUrls: [] },
        company: { name: 'Acme', domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
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
        commercialReading: { serviceBuyerIntent: 'UNKNOWN', externalEngineeringNeed: 'NONE_DETECTED', immediateBuyerNeed: false, buyerTiming: 'UNKNOWN', productMomentum: 'NONE', customerDiscovery: 'NONE', preLaunchActivity: 'NONE', technicalRelevance: 'NONE', buyerEvidenceKinds: [] },
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

  it('a product builder with a CEO title gets a connection note', () => {
    const strategy = buildRevenueStrategy(sourceFromCanonical(makeCanonical(), { channel: 'connection' }))
    expect(strategy.contact.messageRecommended).toBe(true)
  })

  it('a non-product CEO with no technical signal does not', () => {
    const strategy = buildRevenueStrategy(
      sourceFromCanonical(makeCanonical({ businessModel: 'UNKNOWN' }), { channel: 'connection' }),
    )
    expect(strategy.contact.messageRecommended).toBe(false)
  })

  it('technical signals alone qualify even without a product business model', () => {
    const strategy = buildRevenueStrategy(
      sourceFromCanonical(
        makeCanonical({ businessModel: 'UNKNOWN', content: { recentPosts: [], topics: [], explicitProblems: [], initiatives: [], launches: [], technicalSignals: ['react'], hiringSignals: [] } }),
        { channel: 'connection' },
      ),
    )
    expect(strategy.contact.messageRecommended).toBe(true)
  })
})

describe('Contract 3 — one lead has one canonical action/state across every surface', () => {
  const NOW = new Date('2026-10-27T12:00:00Z').getTime()

  function makeLead(overrides: Partial<LeadDetail> = {}): LeadDetail {
    return {
      id: 'lead-1',
      organizationId: 'org-1',
      ownerRepId: 'rep-1',
      company: 'Acme',
      companyKey: 'acme',
      contactName: 'Sarah',
      contactTitle: 'VP Engineering',
      url: 'https://linkedin.com/in/sarah',
      rawInput: null,
      signalType: 1,
      signalEvidence: 'Hiring engineers',
      verbatimQuote: null,
      score: 8,
      verdict: 'send',
      status: 'new',
      playId: null,
      tags: [],
      direction: 'outbound',
      source: 'linkedin',
      connectionAcceptedAt: null,
      lockedUntil: null,
      lockedReason: null,
      archived: false,
      archivedAt: null,
      createdAt: '2026-10-20T10:00:00Z',
      canonicalScore: 80,
      messages: [],
      outcomes: [],
      followupCount: 0,
      ...overrides,
    }
  }

  function msg(overrides: Partial<Message>): Message {
    return {
      id: crypto.randomUUID(),
      organizationId: 'org-1',
      leadId: 'lead-1',
      repId: 'rep-1',
      type: 'dm',
      draftText: null,
      sentText: 'Hello!',
      sentAt: '2026-10-21T10:00:00Z',
      modelUsed: null,
      direction: 'outbound',
      createdAt: '2026-10-21T10:00:00Z',
      ...overrides,
    }
  }

  it('an inbound-first lead is needs-reply on the board and the lead detail', () => {
    const report = buildLeadParityReport(
      makeLead({ direction: 'inbound', inboundMessage: 'We need an external team to rebuild our platform.', messages: [] }),
      NOW,
    )
    expect(report.consistent).toBe(true)
    expect(report.pipelineStage).toBe('needs_reply')
    expect(report.relationshipDisplay).toBe('NEEDS_REPLY')
    expect(report.conversationPresence).not.toBe('NO_MESSAGES')
  })

  it('a lead the rep owes a reply to reads the same on every surface', () => {
    const report = buildLeadParityReport(
      makeLead({
        status: 'replied',
        connectionAcceptedAt: '2026-10-20T12:00:00Z',
        messages: [
          msg({ type: 'connection', sentText: 'Hi!', sentAt: '2026-10-20T10:00:00Z' }),
          msg({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-10-20T14:00:00Z' }),
          msg({ type: 'dm', direction: 'inbound', sentText: 'Tell me more', sentAt: '2026-10-26T09:00:00Z' }),
        ],
      }),
      NOW,
    )
    expect(report.consistent).toBe(true)
    expect(report.relationshipDisplay).toBe('NEEDS_REPLY')
    expect(report.relationshipLabel).toBe('Needs reply')
    expect(report.pipelineStage).toBe('needs_reply')
  })

  it('a quiet lead past the follow-up window is a follow-up on every surface', () => {
    const report = buildLeadParityReport(
      makeLead({
        status: 'contacted',
        connectionAcceptedAt: '2026-10-01T12:00:00Z',
        messages: [
          msg({ type: 'connection', sentText: 'Hi!', sentAt: '2026-10-01T10:00:00Z' }),
          msg({ type: 'dm', sentText: 'Hey Sarah...', sentAt: '2026-10-01T14:00:00Z' }),
        ],
      }),
      NOW,
    )
    expect(report.consistent).toBe(true)
    expect(report.relationshipDisplay).toBe('FOLLOW_UP_DUE')
    expect(report.pipelineStage).toBe('follow_up_due')
  })

  it('the score is one canonical /10 value with its band, not a raw number', () => {
    const report = buildLeadParityReport(makeLead({ canonicalScore: 80 }), NOW)
    expect(report.displayText).toBe('8/10')
    expect(report.qualification).toBe('STRONG')
    expect(report.consistent).toBe(true)
  })
})

describe('Contract 4 — verified source truth outranks model disagreement', () => {
  const GENUINE_BUYER = `Priya Raman
CTO at Ledgerline
About
Ledgerline is a payments startup.
We are looking for an external software development agency to rebuild our merchant dashboard in React.
Budget approved: $40,000. Start within 3 weeks.`

  it('a source-verified request is HIGH even when the model scores it low', () => {
    const r = resolveBuyerIntentFromSource(GENUINE_BUYER, { modelBuyerProbability: 0.1 })
    expect(r.verifiedBuyerRequest).toBe(true)
    expect(r.buyerIntentLevel).toBe('HIGH')
    expect(r.relationshipRole).toBe('BUYER')
    // The disagreement is recorded for audit, never allowed to erase the request.
    expect(r.contradictions.join(' ')).toMatch(/opportunity model scored buyer request 0\.10/)
    expect(r.effectiveBuyerProbability).toBeGreaterThanOrEqual(0.7)
  })

  it('seller-side promotion is still SELLER with UNKNOWN intent when every scorer claims buyer', () => {
    const r = resolveBuyerIntentFromSource(
      'Jordan Vale\nFounder & CEO at Arbiter Governance\nWe built Arbiter so enterprises can prove their AI is safe.\nBring us the workflow — we will evaluate it against regulatory frameworks.',
      { modelBuyerProbability: 0.95, signalCheck: { explicitAsk: true, seekingVendor: true } },
    )
    expect(r.verifiedBuyerRequest).toBe(false)
    expect(r.buyerIntentLevel).toBe('UNKNOWN')
    expect(['SELLER', 'BUILDER']).toContain(r.relationshipRole)
  })
})

describe('Contract 5 — terminal state overrides historical intent', () => {
  const NOW = new Date('2026-10-27T12:00:00Z').getTime()

  function makeLead(overrides: Partial<LeadDetail> = {}): LeadDetail {
    return {
      id: 'lead-1',
      organizationId: 'org-1',
      ownerRepId: 'rep-1',
      company: 'Acme',
      companyKey: 'acme',
      contactName: 'Sarah',
      contactTitle: 'VP Engineering',
      url: null,
      rawInput: null,
      signalType: 1,
      signalEvidence: 'Hiring engineers',
      verbatimQuote: 'We need an agency to build our platform.',
      score: 9,
      verdict: 'send',
      status: 'new',
      playId: null,
      tags: [],
      direction: 'outbound',
      source: 'linkedin',
      connectionAcceptedAt: null,
      lockedUntil: null,
      lockedReason: null,
      archived: false,
      archivedAt: null,
      createdAt: '2026-10-20T10:00:00Z',
      canonicalScore: 95,
      messages: [],
      outcomes: [],
      followupCount: 0,
      ...overrides,
    }
  }

  it.each(['won', 'lost', 'dead', 'no'] as const)('a %s lead offers no outreach, however strong the old signals', (status) => {
    const result = deriveNextLeadAction(
      makeLead({ status, score: 9, canonicalScore: 95, verbatimQuote: 'We need an agency.' }),
      NOW,
    )
    expect(result.requiresAction).toBe(false)
    expect(result.followupDue).toBe(false)
    expect(result.followupsRemaining).toBe(0)
  })

  it('a skipped lead is never contacted', () => {
    const result = deriveNextLeadAction(makeLead({ verdict: 'skip' }), NOW)
    expect(result.requiresAction).toBe(false)
    expect(result.followupDue).toBe(false)
  })

  it('the terminal authorities agree on DO_NOT_CONTACT', () => {
    expect(isTerminalOutcome('DO_NOT_CONTACT')).toBe(true)
    expect(isTerminalStoredStage('do_not_contact')).toBe(true)
    expect(isTerminalOutcome('WON')).toBe(true)
    expect(isTerminalOutcome('DEFERRED')).toBe(false)
  })
})

describe('Contract 6 — unknown is not zero', () => {
  const HOURLY_ONLY_JOB = `Senior React Native Engineer
Posted 25 minutes ago
Worldwide
Hourly
$5.00 - $15.00
Hourly
Expert
More than 6 months
We need an experienced React Native engineer to maintain our mobile app.
Compensation: Negotiable based on scope.`

  it('a job with no Connects and no fixed budget yields null, not 0', async () => {
    // The provider is mocked to return no Connects and no fixed budget, so the
    // deterministic backfill is what runs. A release contract test must never
    // depend on a live provider key.
    const { extractUpworkJob } = await import('@/lib/upwork-v2')
    const result = await extractUpworkJob({ rawText: HOURLY_ONLY_JOB })
    expect(result.job).toBeTruthy()
    expect(result.job?.connectsCost).toBeNull()
    expect(result.job?.budget).toBeNull()
    expect(result.job?.budgetType).toBe('hourly')
  })

  it('a failure reason is never an empty or silent success', () => {
    for (const status of [401, 503, 429, 504, 502, 500, null]) {
      const reason = imageFailureReason(status)
      expect(reason.length).toBeGreaterThan(0)
      expect(reason).toMatch(/retry/i)
    }
  })
})

describe('Contract 7 — persistence and UI state reflect actual lifecycle state', () => {
  it('a failed regeneration keeps the existing image and reports a reason', () => {
    // REL-QA-007 S1: the old code cleared the image on failure. The decision is
    // a pure function, so it is tested as behavior, not by reading source text.
    for (const status of [401, 403, 429, 500, 502, 503, 504, null]) {
      const outcome = imageRegenerationOutcome(status)
      expect(outcome.keepExisting, `status ${status}`).toBe(true)
      expect(outcome.reason).toBeTruthy()
      expect(outcome.reason).toMatch(/retry/i)
    }
    // A 200 with no URL is still a failure: nothing to show, keep the asset.
    expect(imageRegenerationOutcome(200, null).keepExisting).toBe(true)
  })

  it('only a successful response carrying a URL replaces the image', () => {
    const outcome = imageRegenerationOutcome(200, 'https://cdn.example.com/new.png')
    expect(outcome.keepExisting).toBe(false)
    expect(outcome.reason).toBeNull()
  })

  it('every failure category carries a real reason with a retry hint', () => {
    expect(imageFailureReason(401)).toMatch(/not signed in/i)
    expect(imageFailureReason(503)).toMatch(/not configured/i)
    expect(imageFailureReason(429)).toMatch(/rate limit/i)
    expect(imageFailureReason(null, 'Failed to fetch')).toMatch(/timed out/i)
  })
})

describe('Contract 8 — all external text enters through the normalization boundary', () => {
  it('strips a label from the value and never invents a missing field', async () => {
    const { normalizeExternalInput } = await import('@/lib/intelligence-v3/normalize-external-input')
    const out = normalizeExternalInput('Full Name: Emily Carter\nJob Title: Operations Director')
    expect(out.structuredFields.name).toBe('Emily Carter')
    expect(out.structuredFields.title).toBe('Operations Director')
    expect(out.structuredFields.company).toBeNull()
  })

  it('no surface compiles its own label list', async () => {
    const { isLabeledFieldLine } = await import('@/lib/intelligence-v3/normalize-external-input')
    expect(isLabeledFieldLine('Name: Emily Carter')).toBe(true)
    expect(isLabeledFieldLine('Just a normal sentence.')).toBe(false)
  })
})

describe('Contract 9 — RAW input is not ANALYZED input', () => {
  it('a policy skip is resolved before any generation outcome', async () => {
    const { resolveDraftGenerationState, canGenerateDraft, draftStateMessage } = await import('@/lib/relay/draft-generation-state')
    const state = resolveDraftGenerationState({
      verdict: 'skip', generating: true, draftText: '', needsRescoring: false, failed: true,
    })
    expect(state).toBe('SKIPPED_BY_POLICY')
    expect(canGenerateDraft(state)).toBe(false)
    expect(draftStateMessage(state)).toBeTruthy()
  })
})

describe('Contract 10 — the reviewed decision is the persisted decision', () => {
  it('every surface reads one canonical score from the stored packet', async () => {
    const { buildLeadParityReport } = await import('@/lib/relay/lead-parity')
    const lead = {
      id: 'lead_c10',
      organizationId: 'org-1',
      ownerRepId: 'rep-1',
      company: 'Northstar Logistics',
      companyKey: 'northstarlogistics',
      contactName: 'Michael Anderson',
      contactTitle: 'CTO',
      url: null,
      rawInput: 'We are looking for an external software team to rebuild our dispatch platform.',
      signalType: 1,
      signalEvidence: 'We are looking for an external software team to rebuild our dispatch platform.',
      verbatimQuote: null,
      score: null,
      verdict: null,
      status: 'new',
      playId: null,
      tags: [],
      direction: 'outbound',
      source: 'linkedin',
      connectionAcceptedAt: null,
      lockedUntil: null,
      lockedReason: null,
      archived: false,
      archivedAt: null,
      createdAt: '2026-10-20T10:00:00Z',
      canonicalScore: 72,
      canonicalIntelligence: { score: 72, scoreVersion: 'relay_decision_v3.3.0', qualification: 'STRONG' },
      messages: [],
      outcomes: [],
      followupCount: 0,
    } as unknown as LeadDetail

    const report = buildLeadParityReport(lead)
    expect(report.canonicalScore).toBe(72)
    expect(report.displayText).toBe('7/10')
    expect(report.divergences).toEqual([])
  })
})

describe('Contract 11 — canonical message rows own the conversation timeline', () => {
  it('the lead-level opening renders only when no canonical row exists', async () => {
    const { buildThread } = await import('@/lib/conversation/thread')
    const { inboundFirstMessageKey } = await import('@/lib/conversation/canonical-message')
    const opening = 'We need an external team to rebuild our booking platform.'

    const fallback = buildThread({
      id: 'lead_c11', direction: 'inbound', inboundMessage: opening,
      createdAt: '2026-10-20T10:00:00Z', messages: [],
    } as LeadDetail)
    expect(fallback).toHaveLength(1)

    const canonical = buildThread({
      id: 'lead_c11', direction: 'inbound', inboundMessage: opening,
      createdAt: '2026-10-20T10:00:00Z',
      messages: [{
        id: 'msg_1', organizationId: 'org-1', leadId: 'lead_c11', repId: null, type: 'reply',
        draftText: null, sentText: opening, sentAt: '2026-10-20T10:00:00Z', modelUsed: null,
        idempotencyKey: inboundFirstMessageKey('lead_c11'), direction: 'inbound',
        createdAt: '2026-10-20T10:00:00Z',
      }] as Message[],
    } as LeadDetail)
    expect(canonical).toHaveLength(1)
    expect(canonical.filter((t) => t.text === opening)).toHaveLength(1)
  })
})

describe('Contract 12 — UI cannot advertise an unavailable auth capability', () => {
  it('Google is advertised only when configured', async () => {
    const { getAuthCapabilities } = await import('@/lib/auth/capabilities')
    const base = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' }
    expect(getAuthCapabilities(base).googleEnabled).toBe(false)
    expect(getAuthCapabilities({ ...base, RELAY_GOOGLE_AUTH_ENABLED: 'true' }).googleEnabled).toBe(true)
  })

  it('public and invite-only signup are mutually exclusive', async () => {
    const { getAuthCapabilities } = await import('@/lib/auth/capabilities')
    const base = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' }
    const inviteOnly = getAuthCapabilities({ ...base, SIGNUP_INVITE_CODE: 'relay-2026' })
    expect(inviteOnly.inviteOnlySignupEnabled).toBe(true)
    expect(inviteOnly.publicSignupEnabled).toBe(false)
    const pub = getAuthCapabilities({ ...base, SIGNUP_PUBLIC: 'true', SIGNUP_INVITE_CODE: 'relay-2026' })
    expect(pub.publicSignupEnabled).toBe(true)
    expect(pub.inviteOnlySignupEnabled).toBe(false)
  })
})

describe('Contract 13 — a recruiter is a relationship, not a buying signal', () => {
  it('a recruiter with no external request has UNKNOWN intent', async () => {
    const { resolveBuyerIntentFromSource } = await import('@/lib/intelligence-v3/buyer-intent')
    const intent = resolveBuyerIntentFromSource(
      "Sofia Marchetti\nTechnical Recruiter at Northstar Talent\nWe're hiring a Full Stack Engineer for a fintech client. Submit your CV.",
    )
    expect(intent.relationshipRole).toBe('RECRUITER')
    expect(intent.buyerIntentLevel).toBe('UNKNOWN')
  })

  it('a recruiter title does not block a verified external request', async () => {
    const { resolveBuyerIntentFromSource } = await import('@/lib/intelligence-v3/buyer-intent')
    const intent = resolveBuyerIntentFromSource(
      'Alex Morgan\nTechnical Recruiter at Northstar Technologies\nCompany: Northstar Technologies\nWe are looking for an external software development agency to help us build a customer portal in React.\nApproved project budget: $20,000',
    )
    expect(intent.verifiedBuyerRequest).toBe(true)
    expect(intent.buyerIntentLevel).toBe('HIGH')
    expect(intent.relationshipRole).toBe('BUYER')
  })
})
