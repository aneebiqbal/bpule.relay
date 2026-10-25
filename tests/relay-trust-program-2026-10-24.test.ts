/**
 * Relay — trust + learning program (5-6 day pass) regression guards.
 *
 * Covers: deterministic sales-thesis derivation (Day 2), AI cost accounting
 * (Day 5.5), and the analytics correctness fixes.
 */
import { describe, expect, it } from 'vitest'
import { deriveSalesThesis } from '@/lib/conversation/derive-sales-thesis'
import type { SourceFacts } from '@/lib/intelligence-v3/source-facts-model'
import { estimateCostUsd } from '@/lib/ai/cost'
import { validateQuickLabel, validatePairwiseLabel } from '@/lib/admin/training-data'
import { createFakeSupabase } from './helpers/fake-supabase'
import { SupabaseStore } from '@/lib/store/supabase-store'
import type { Rep, Organization } from '@/lib/domain/types'

const ORG_ID = 'org-a'
const REP_ID = 'rep-1'

function makeRep(): Rep {
  return { id: REP_ID, name: 'Rep', role: 'rep', organizationId: ORG_ID, createdAt: '2026-01-01T00:00:00.000Z', timezone: 'UTC' }
}
function makeOrg(): Organization {
  return { id: ORG_ID, name: 'Org', plan: 'active', billingCustomerId: null, timezone: 'UTC', workingDays: [1, 2, 3, 4, 5], holidays: [], createdAt: '2026-01-01T00:00:00.000Z' }
}

function facts(partial: Partial<SourceFacts> = {}): SourceFacts {
  return {
    version: 'source_facts_v1',
    sourceLanguage: 'en',
    person: { name: null, title: null },
    currentRole: null,
    currentCompany: null,
    currentOrganizations: [],
    currentIndustry: null,
    currentIndustryLine: null,
    historicalIndustries: [],
    targetCustomerSegment: null,
    companySizeEvidence: null,
    companySizeCategory: null,
    access: { connectionDegree: null, contactRoute: null, invitationToReachOut: false } as SourceFacts['access'],
    location: null,
    recentPostAgeDays: null,
    activityRecency: 'UNKNOWN',
    currentProductActivity: false,
    historicalProductActivity: false,
    currentHiringActivity: null,
    hiringUrgent: false,
    hiringCount: 0,
    candidateSeeking: false,
    serviceOffering: [],
    sellerActivity: false,
    recruiterProfile: false,
    buyerRequest: null,
    buyerRequestAgeDays: null,
    helpRequest: null,
    externalNeed: false,
    budgetEvidence: null,
    timelineEvidence: null,
    explicitDates: { dates: [], kind: 'NONE' } as SourceFacts['explicitDates'],
    terminalState: null,
    authorityEvidence: { level: 'UNKNOWN', line: null } as SourceFacts['authorityEvidence'],
    technologyContext: { terms: [], stack: [] } as SourceFacts['technologyContext'],
    capabilityNeeds: [],
    proofCandidates: [],
    fundingEvidence: null,
    founderOrBuilder: false,
    sourceCompleteness: {} as SourceFacts['sourceCompleteness'],
    rejectedSignals: [],
    buyer: {} as SourceFacts['buyer'],
    signals: {} as SourceFacts['signals'],
    pastRoleLines: [],
    ...partial,
  }
}

describe('Day 2 — deriveSalesThesis', () => {
  it('an explicit buyer request is FACT and direct', () => {
    const thesis = deriveSalesThesis({
      sourceFacts: facts({ currentCompany: 'Fenwick Pay', currentRole: 'CTO', buyerRequest: 'We need help with our checkout migration.' }),
      buyerIntent: { level: 'HIGH', verifiedBuyerRequest: true, requestAgeDays: 2 },
      archetype: 'explicit_buyer',
      fit: { level: 'HIGH', capabilityOverlap: ['nextjs', 'payments'] },
    })
    expect(thesis.basis.likelyOpportunity).toBe('FACT')
    expect(thesis.likelyOpportunity).toContain('Direct request')
    expect(thesis.confidence).toBe('Potential')
    expect(thesis.bestEntryPoint).toMatch(/Answer the stated need directly/)
  })

  it('a capability-need signal without a request is a labelled hypothesis', () => {
    const thesis = deriveSalesThesis({
      sourceFacts: facts({ currentCompany: 'Acme', currentRole: 'Founder', externalNeed: true, capabilityNeeds: ['integration'] }),
      archetype: 'technical_founder',
    })
    expect(thesis.basis.likelyOpportunity).toBe('HYPOTHESIS')
    expect(thesis.likelyOpportunity).toMatch(/Potential .* capacity pressure/)
    expect(thesis.confidence).toBe('Possible')
  })

  it('high-value unknown intent is a hypothesis, not fake buyer intent', () => {
    const thesis = deriveSalesThesis({
      sourceFacts: facts({ currentCompany: 'Acme', currentRole: 'CTO' }),
      archetype: 'unknown_intent',
    })
    expect(thesis.basis.likelyOpportunity).toBe('UNKNOWN')
    expect(thesis.likelyOpportunity).toBe('Unverified')
    expect(thesis.confidence).toBe('Unverified')
    expect(thesis.missingEvidence).toContain('a verified commercial need')
  })

  it('a service provider gets no fake sales thesis', () => {
    const thesis = deriveSalesThesis({
      sourceFacts: facts({ currentCompany: 'Acme', currentRole: 'Developer', sellerActivity: true, serviceOffering: ['web development'] }),
      archetype: 'service_provider',
    })
    expect(thesis.risks.join(' ')).toMatch(/service provider \/ seller/)
    expect(thesis.bestEntryPoint).toMatch(/partnership/)
  })

  it('a candidate gets no sales outreach', () => {
    const thesis = deriveSalesThesis({
      sourceFacts: facts({ currentRole: 'Engineer', candidateSeeking: true }),
      archetype: 'candidate',
    })
    expect(thesis.bestEntryPoint).toBe('No sales outreach.')
    expect(thesis.risks.join(' ')).toMatch(/candidate-seeking/)
  })

  it('whyUs never claims capability the sender does not have', () => {
    const thesis = deriveSalesThesis({
      sourceFacts: facts({ currentCompany: 'Acme', currentRole: 'CTO' }),
      fit: { level: 'MEDIUM', capabilityOverlap: ['nextjs'] },
      senderProfile: { displayName: 'Aneeb', capabilities: ['python', 'aws'], industries: [] },
    })
    expect(thesis.whyUs).toContain('nextjs')
    expect(thesis.whyThisSender).toMatch(/no direct capability overlap/)
  })
})

describe('Day 5.5 — AI cost accounting', () => {
  it('estimates a nonzero cost from tokens', () => {
    const cost = estimateCostUsd('tier1', 1_000_000, 1_000_000)
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeCloseTo(0.6, 5)
  })
  it('is zero when there are no tokens', () => {
    expect(estimateCostUsd('tier4', 0, 0)).toBe(0)
  })
})

describe('Day 5 — quick + pairwise labels', () => {
  const key = 'a'.repeat(64)
  it('accepts a quick label in one call', () => {
    const r = validateQuickLabel({ opportunityKey: key, prospectQuality: 'GOOD', quickAction: 'CONTACT_NOW', decisionCorrect: 'YES' })
    expect(r.ok).toBe(true)
  })
  it('accepts a pairwise preference', () => {
    const r = validatePairwiseLabel({ opportunityKeyA: key, opportunityKeyB: 'b'.repeat(64), winner: 'A' })
    expect(r.ok).toBe(true)
  })
  it('rejects identical pairwise keys', () => {
    expect(validatePairwiseLabel({ opportunityKeyA: key, opportunityKeyB: key, winner: 'A' }).ok).toBe(false)
  })
  it('rejects an unknown quick action', () => {
    expect(validateQuickLabel({ opportunityKey: key, quickAction: 'WHATEVER' }).ok).toBe(false)
  })
})

describe('Day 6 — thread status marker', () => {
  it('defaults to UNVERIFIED when no identity is supplied', async () => {
    const LEAD_ID = 'lead-thread-default'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', verdict: 'send' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.recordProspectReply(LEAD_ID, 'Thanks, we handled it internally.')
    const msg = fake.tables.messages.find((m) => m.lead_id === LEAD_ID)
    expect(msg?.thread_status).toBe('UNVERIFIED')
  })
  it('marks VERIFIED when identity is checked', async () => {
    const LEAD_ID = 'lead-thread-verified'
    const fake = createFakeSupabase({
      leads: [{ id: LEAD_ID, organization_id: ORG_ID, owner_rep_id: REP_ID, company: 'Acme', status: 'contacted', verdict: 'send' }],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    await store.recordProspectReply(LEAD_ID, 'Interested, let\'s talk.', { threadStatus: 'VERIFIED' })
    const msg = fake.tables.messages.find((m) => m.lead_id === LEAD_ID)
    expect(msg?.thread_status).toBe('VERIFIED')
  })
})

describe('Day 4.5 — canonical proof is proof_cards', () => {
  it('falls back to verified proof_cards when proof_items is empty', async () => {
    const PROFILE_ID = 'profile-p'
    const fake = createFakeSupabase({
      profiles: [{ id: PROFILE_ID, organization_id: ORG_ID }],
      proof_cards: [
        { id: 'card-1', organization_id: ORG_ID, profile_id: PROFILE_ID, capability: 'nextjs', safe_claim: 'Shipped a checkout migration', tags: ['nextjs'], verified: true, forbidden_claims: [], created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'card-2', organization_id: ORG_ID, profile_id: PROFILE_ID, capability: 'ai', safe_claim: 'Rejected claim', tags: [], verified: false, forbidden_claims: ['client name'], created_at: '2026-01-01T00:00:00.000Z' },
      ],
    })
    const store = new SupabaseStore(makeRep(), fake.client as never, makeOrg())
    const items = await store.listProofItems(PROFILE_ID)
    // Only the verified, non-forbidden card is APPROVED_REAL.
    expect(items).toHaveLength(1)
    expect(items[0].projectSummary).toContain('nextjs')
    expect(items[0].permissionOnFile).toBe(true)
  })
})
