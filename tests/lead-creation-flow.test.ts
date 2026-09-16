import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lead, OrganizationRulebook } from '@/lib/domain/types'
import { SIGNALS } from '@/lib/score/signals'
import { POST as createLeadRoute } from '@/app/api/leads/route'
import { POST as prospectSaveRoute } from '@/app/api/prospect/save/route'

const { createScoutStoreMock } = vi.hoisted(() => ({
  createScoutStoreMock: vi.fn(),
}))

vi.mock('@/lib/store', () => ({
  createScoutStore: createScoutStoreMock,
}))

const RULEBOOK: OrganizationRulebook = {
  organizationId: 'org-test',
  signals: SIGNALS,
  verdictThresholds: {
    send: { min: 10, max: 12 },
    research_more: { min: 7, max: 9 },
    skip: { min: 0, max: 6 },
  },
  maxSignalWeight: 7,
  maxCompleteness: 5,
  confidenceSendThreshold: 72,
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    organizationId: 'org-test',
    ownerRepId: 'rep-1',
    company: 'Riverlane Health',
    companyKey: 'riverlanehealth',
    contactName: 'Sarah Chen',
    contactTitle: 'CTO',
    titleRaw: 'CTO at Riverlane Health',
    locationRaw: 'San Francisco, California, United States',
    url: 'https://linkedin.com/in/sarah-chen',
    rawInput:
      'Sarah Chen CTO at Riverlane Health. Hiring senior Rails engineers to rebuild patient messaging. Own API performance and reduce p95 latency by 40% in 60 days.',
    roleCategory: 'technical_leadership',
    marketRegion: 'US',
    extractionConfidence: 86,
    extractionProfile: null,
    signalType: 1,
    signalEvidence:
      'Hiring senior Rails engineers to rebuild patient messaging and reduce p95 latency by 40% in 60 days.',
    verbatimQuote: null,
    score: 10,
    verdict: 'send',
    status: 'new',
    playId: null,
    tags: ['rails', 'healthcare'],
    direction: 'outbound',
    source: null,
    inboundMessage: null,
    inboundRaw: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function validCreateBody(overrides: Record<string, unknown> = {}) {
  return {
    company: 'Riverlane Health',
    contactName: 'Sarah Chen',
    contactTitle: 'CTO',
    titleRaw: 'CTO at Riverlane Health',
    locationRaw: 'San Francisco, California, United States',
    aboutSummary: 'Leads engineering and product delivery for digital care experiences.',
    experienceSummary: '12 years in software leadership across healthcare SaaS.',
    signalType: 1,
    signalEvidence:
      'Hiring senior Rails engineers to rebuild patient messaging and reduce p95 latency by 40% in 60 days.',
    extractionConfidence: 86,
    url: 'https://linkedin.com/in/sarah-chen',
    tags: ['rails', 'healthcare', 'saas'],
    rawInput:
      'Sarah Chen CTO at Riverlane Health. Hiring senior Rails engineers to rebuild patient messaging. Own API performance and reduce p95 latency by 40% in 60 days.',
    ...overrides,
  }
}

beforeEach(() => {
  createScoutStoreMock.mockReset()
})

describe('Lead creation hardening flow', () => {
  it('rejects garbage raw input on /api/leads before touching the store', async () => {
    const req = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateBody({ rawInput: 'XYZ' })),
    })

    const res = await createLeadRoute(req)
    const data = await res.json()

    expect(res.status).toBe(422)
    expect(createScoutStoreMock).not.toHaveBeenCalled()
    expect(data.qualification?.inputHardFail).toBe(true)
  })

  it('rejects URL-only raw input on /api/prospect/save before touching the store', async () => {
    const req = new Request('http://localhost/api/prospect/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateBody({ rawInput: 'https://linkedin.com/in/only-url' })),
    })

    const res = await prospectSaveRoute(req)
    const data = await res.json()

    expect(res.status).toBe(422)
    expect(createScoutStoreMock).not.toHaveBeenCalled()
    expect(data.qualification?.inputHardFail).toBe(true)
  })

  it('returns explicit hard duplicate semantics from /api/leads', async () => {
    createScoutStoreMock.mockResolvedValue({
      getRulebook: vi.fn().mockResolvedValue(RULEBOOK),
      createLead: vi.fn().mockResolvedValue({
        blocked: true,
        duplicateKind: 'hard',
        reason: 'This profile URL already exists as a lead.',
        existingOwnerName: 'Hassan',
        lead: makeLead({ id: 'lead-existing', company: 'Acme Nail Polish Co' }),
      }),
    })

    const req = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateBody()),
    })

    const res = await createLeadRoute(req)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.duplicate).toBe(true)
    expect(data.duplicateKind).toBe('hard')
    expect(data.canCreateSeparate).toBe(false)
    expect(data.existingLeadId).toBe('lead-existing')
  })

  it('returns explicit potential duplicate semantics from /api/prospect/save', async () => {
    createScoutStoreMock.mockResolvedValue({
      getRulebook: vi.fn().mockResolvedValue(RULEBOOK),
      createLead: vi.fn().mockResolvedValue({
        blocked: true,
        duplicateKind: 'potential',
        reason: 'Potential duplicate: this company name is very similar to an existing lead.',
        existingOwnerName: 'Hassan',
        lead: makeLead({ id: 'lead-existing', company: 'Acme Nail Polish Co' }),
      }),
    })

    const req = new Request('http://localhost/api/prospect/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateBody()),
    })

    const res = await prospectSaveRoute(req)
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data.duplicate).toBe(true)
    expect(data.duplicateKind).toBe('potential')
    expect(data.canCreateSeparate).toBe(true)
  })

  it('passes score and verdict inside createLead payload (single write)', async () => {
    const createLeadMock = vi.fn().mockResolvedValue({
      blocked: false,
      lead: makeLead({ id: 'lead-new', score: 11, verdict: 'send' }),
    })
    const updateLeadScoreMock = vi.fn()

    createScoutStoreMock.mockResolvedValue({
      getRulebook: vi.fn().mockResolvedValue(RULEBOOK),
      createLead: createLeadMock,
      updateLeadScore: updateLeadScoreMock,
    })

    const req = new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validCreateBody()),
    })

    const res = await createLeadRoute(req)
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(createLeadMock).toHaveBeenCalledTimes(1)
    expect(createLeadMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        verdict: expect.stringMatching(/send|research_more|skip/),
      }),
    )
    expect(updateLeadScoreMock).not.toHaveBeenCalled()
    expect(data.lead.id).toBe('lead-new')
  })
})
