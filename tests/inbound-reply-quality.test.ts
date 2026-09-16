import { describe, it, expect } from 'vitest'
import {
  buildInboundReplyUserPrompt,
  validateInboundReply,
  type InboundReplyInput,
} from '@/lib/inbound/reply'
import type { InboundIntelligence, Lead, Message, Profile, ProofItem } from '@/lib/domain/types'

function makeLead(overrides?: Partial<Lead>): Lead {
  return {
    id: 'lead-1',
    organizationId: 'org-1',
    ownerRepId: 'rep-1',
    company: 'Acme Labs',
    companyKey: 'acme-labs',
    contactName: 'Sam Lee',
    contactTitle: 'CTO',
    url: 'https://acme.example',
    rawInput: null,
    signalType: 7,
    signalEvidence: 'asked for implementation help',
    verbatimQuote: null,
    score: 12,
    verdict: 'send',
    status: 'new',
    playId: null,
    tags: ['rails', 'node', 'platform'],
    direction: 'inbound',
    source: 'linkedin',
    inboundMessage: 'Can you share your approach for reducing checkout latency?',
    inboundRaw: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeProfile(overrides?: Partial<Profile>): Profile {
  return {
    id: 'profile-1',
    repId: 'rep-1',
    organizationId: 'org-1',
    platform: 'linkedin',
    label: 'Backend Specialist',
    profileUrl: 'https://linkedin.com/in/backend-specialist',
    headline: 'Rails and Node systems engineer',
    cvPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeProof(overrides?: Partial<ProofItem>): ProofItem {
  return {
    id: 'proof-1',
    organizationId: 'org-1',
    profileId: 'profile-1',
    clientNamed: false,
    clientName: null,
    permissionOnFile: false,
    projectSummary: 'Built a Rails checkout service for a healthcare SaaS product',
    reviewQuote: 'Delivered a stable release and cut checkout failures.',
    tags: ['rails', 'checkout', 'stability'],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeMessage(text: string): Message {
  return {
    id: 'msg-1',
    organizationId: 'org-1',
    leadId: 'lead-1',
    repId: 'rep-1',
    type: 'dm',
    draftText: text,
    sentText: text,
    sentAt: '2026-01-01T10:00:00.000Z',
    modelUsed: null,
    createdAt: '2026-01-01T10:00:00.000Z',
  }
}

function makeIntelligence(overrides?: Partial<InboundIntelligence>): InboundIntelligence {
  return {
    wants: 'reduce checkout latency',
    intent: 'question',
    fitScore: 81,
    fitRelevance: 'Strong backend fit',
    opportunityQuality: 'high',
    recommendedIdentity: makeProfile(),
    identityFitReason: 'Experience matches backend scaling request',
    matchingSkills: ['rails', 'node', 'performance'],
    strongestProof: [makeProof()],
    missingInfo: [],
    recommendedAction: 'Answer directly and suggest one next diagnostic step',
    canGenerateResume: false,
    ...overrides,
  }
}

function makeInput(overrides?: Partial<InboundReplyInput>): InboundReplyInput {
  return {
    lead: makeLead(),
    intelligence: makeIntelligence(),
    profile: makeProfile(),
    proofItems: [makeProof()],
    history: [],
    styleCard: 'Direct and concise.',
    ...overrides,
  }
}

describe('inbound reply quality gate', () => {
  it('rejects repeated bio facts when they were already shared', () => {
    const input = makeInput({
      history: [makeMessage('I have 10 years of fintech experience and built three payment platforms.')],
    })
    const draft = 'On checkout latency, I would start with p95 traces around payment and cart queries. I have 10 years of fintech experience and built three payment platforms.'

    const check = validateInboundReply(draft, input)
    expect(check.valid).toBe(false)
    expect(check.note).toContain('repeats bio/proof facts')
  })

  it('rejects replies that dodge a direct question', () => {
    const input = makeInput({
      lead: makeLead({ inboundMessage: 'What is your typical timeline to migrate a Rails API to Node?' }),
    })
    const draft = 'Thanks for reaching out. Happy to discuss details whenever works for you.'

    const check = validateInboundReply(draft, input)
    expect(check.valid).toBe(false)
    expect(check.note).toContain('direct question')
  })

  it('rejects identity claims that are not grounded in selected profile/proof', () => {
    const input = makeInput({
      lead: makeLead({ inboundMessage: 'We need someone for backend stabilization.' }),
    })
    const draft = 'I spent 8 years at Google leading high-frequency trading systems for hedge funds.'

    const check = validateInboundReply(draft, input)
    expect(check.valid).toBe(false)
    expect(check.note).toMatch(/Google|not grounded|identity\/proof/i)
  })

  it('rejects generic fluff with no context anchor', () => {
    const input = makeInput({
      lead: makeLead({ inboundMessage: 'We need help untangling flaky Playwright CI runs.' }),
      intelligence: makeIntelligence({ intent: 'interested', wants: 'help with flaky Playwright CI runs' }),
    })
    const draft = 'Thanks for reaching out. Happy to help. Let me know your thoughts.'

    const check = validateInboundReply(draft, input)
    expect(check.valid).toBe(false)
    expect(check.note).toContain('generic fluff')
  })

  it('includes deterministic conversation summary in the prompt', () => {
    const input = makeInput({
      history: [makeMessage('I have worked on Rails checkout performance for a healthcare SaaS product.')],
    })

    const prompt = buildInboundReplyUserPrompt(input)
    expect(prompt).toContain('Deterministic conversation summary (pre-generation)')
    expect(prompt).toContain('Intent pre-classification')
    expect(prompt).toContain('Already established facts')
    expect(prompt).toContain('Channel behavior')
  })
})
