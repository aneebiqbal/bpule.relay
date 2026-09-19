import { describe, expect, it } from 'vitest'
import { generateDraft, type DraftInput } from '@/lib/ai/draft'
import { evaluateMessage } from '@/lib/relay/message-forge'
import { classifySendDisposition } from '@/lib/relay/edit-learning'
import { applyRevenueStrategyToOutreach, buildRevenueStrategy, sourceFromLead } from '@/lib/relay/revenue-strategy'
import { createOutreachStrategy } from '@/lib/relay/outreach-strategy'
import type { ExtractedLead, Lead, Profile } from '@/lib/domain/types'

/**
 * Dogfood 20 representative messages through the deterministic demo writer
 * and classify them the way a human would: send / light edit / heavy / reject.
 *
 * Asserts systemic behavior, not exact wording.
 */

const PROFILE: Profile = {
  id: 'p1',
  repId: 'r1',
  organizationId: 'org1',
  platform: 'linkedin',
  label: 'Fizza',
  profileUrl: null,
  headline: 'Full-stack engineer',
  cvPath: null,
  createdAt: '2024-01-01',
}

function lead(company: string, extra?: Partial<Lead>): Lead {
  return {
    id: `lead-${company}`,
    organizationId: 'org1',
    ownerRepId: 'r1',
    company,
    companyKey: company.toLowerCase(),
    contactName: extra?.contactName ?? 'Alex',
    contactTitle: extra?.contactTitle ?? 'Founder',
    url: null,
    rawInput: extra?.rawInput ?? null,
    signalType: extra?.signalType ?? 1,
    signalEvidence: extra?.signalEvidence ?? `${company} is hiring a full-stack engineer`,
    verbatimQuote: extra?.verbatimQuote ?? null,
    score: 9,
    verdict: 'send',
    status: 'new',
    playId: null,
    tags: extra?.tags ?? ['hiring'],
    createdAt: '2024-01-01',
    ...extra,
  }
}

function extracted(l: Lead): ExtractedLead {
  return {
    name: l.contactName,
    title: l.contactTitle,
    company: l.company,
    url: l.url,
    signalType: l.signalType ?? 1,
    signalEvidence: l.signalEvidence ?? '',
    verbatimQuote: l.verbatimQuote,
    tags: l.tags,
    extractionConfidence: 80,
  }
}

function inputFor(l: Lead, type: DraftInput['type'] = 'dm'): DraftInput {
  const ex = extracted(l)
  const revenue = buildRevenueStrategy(sourceFromLead(l, ex, {
    channel: type === 'followup' ? 'followup' : type === 'connection' ? 'connection' : type === 'reply' ? 'reply' : 'dm',
    relationshipStage: type === 'followup' ? 'followup' : type === 'reply' ? 'reply' : 'first_touch',
  }))
  const outreach = applyRevenueStrategyToOutreach(
    createOutreachStrategy({
      leadCompany: l.company,
      contactName: l.contactName,
      contactTitle: l.contactTitle,
      signalType: l.signalType ?? null,
      signalEvidence: l.signalEvidence ?? '',
      verbatimQuote: l.verbatimQuote,
      tags: l.tags,
      safeFacts: [],
      senderProfile: PROFILE,
      matchedProof: [],
      channel: type === 'connection' ? 'connection' : type === 'upwork' ? 'upwork' : 'dm',
      relationshipStage: type === 'followup' ? 'followup' : type === 'reply' ? 'reply' : 'first_touch',
    }),
    revenue,
  )
  return {
    leadId: l.id,
    lead: l,
    extracted: ex,
    score: { total: 11, verdict: 'send', baseVerdict: 'send', breakdown: [], gates: [] },
    type,
    styleCard: null,
    facts: [],
    plays: [],
    strategy: outreach,
    conversationContext: type === 'reply' ? l.rawInput : null,
  }
}

const CASES: Array<{ id: string; lead: Lead; type: DraftInput['type'] }> = [
  { id: 'hiring-fullstack', lead: lead('Northstar', { contactName: 'Abdulhakim', signalEvidence: 'Hiring a full-stack engineer', verbatimQuote: 'We are hiring a full-stack engineer' }), type: 'dm' },
  { id: 'hiring-connection', lead: lead('Northstar', { contactName: 'Abdulhakim', signalEvidence: 'Hiring a full-stack engineer' }), type: 'connection' },
  { id: 'founder-no-intent', lead: lead('Quiet Labs', { signalType: 7, signalEvidence: 'Founder at Quiet Labs building quietly', tags: [] }), type: 'dm' },
  { id: 'thin-founder', lead: lead('Tiny', { signalType: 7, signalEvidence: 'Founder', extractionConfidence: 15 } as Partial<Lead>), type: 'dm' },
  { id: 'problem-latency', lead: lead('Shoply', { signalType: 6, signalEvidence: 'Checkout latency is killing conversion', verbatimQuote: 'Checkout latency is killing conversion' }), type: 'dm' },
  { id: 'generic-posts', lead: lead('Essay Co', { signalType: 7, signalEvidence: 'Posted about remote work culture', tags: ['culture'] }), type: 'dm' },
  { id: 'historical-onsite', lead: lead('OldCo', { signalType: 1, signalEvidence: 'Previously required on-site in London when they were at Stripe in 2019' }), type: 'dm' },
  { id: 'freelance-need', lead: lead('Buildit', { signalType: 2, signalEvidence: 'Looking for a freelance engineer to own the rebuild' }), type: 'dm' },
  { id: 'followup-allowed', lead: lead('Northstar', { status: 'contacted', signalEvidence: 'Hiring a full-stack engineer' }), type: 'followup' },
  { id: 'reply-examples-rate', lead: lead('Northstar', { rawInput: 'Sounds interesting. Can you share examples and your rate?' }), type: 'reply' },
  { id: 'reply-hired', lead: lead('Northstar', { rawInput: 'Thanks, we already hired someone.' }), type: 'reply' },
  { id: 'reply-next-quarter', lead: lead('Northstar', { rawInput: 'Maybe next quarter.' }), type: 'reply' },
  { id: 'reply-negative', lead: lead('Northstar', { rawInput: 'Not interested.' }), type: 'reply' },
  { id: 'reply-interested', lead: lead('Northstar', { rawInput: 'This sounds interesting. Tell me more about how you work.' }), type: 'reply' },
  { id: 'hiring-backend', lead: lead('Ledger', { contactName: 'Priya', signalEvidence: 'Hiring a senior backend engineer' }), type: 'dm' },
  { id: 'migration', lead: lead('MoveCo', { signalType: 6, signalEvidence: 'Migrating the monolith to services this quarter' }), type: 'dm' },
  { id: 'explicit-ask', lead: lead('HelpCo', { signalType: 7, signalEvidence: 'Need help finding someone to take ownership of the build' }), type: 'dm' },
  { id: 'connection-problem', lead: lead('Shoply', { signalType: 6, signalEvidence: 'Checkout latency is killing conversion' }), type: 'connection' },
  { id: 'dm-growth', lead: lead('ScaleUp', { signalType: 3, signalEvidence: 'Just launched the v2 platform and hiring pressure is up' }), type: 'dm' },
  { id: 'reply-call', lead: lead('Northstar', { rawInput: 'Sounds good. Can we schedule a call next week?' }), type: 'reply' },
]

describe('Dogfood — 20 representative messages', () => {
  it('classifies each case and rejects systemic junk', async () => {
    const rows: Array<{ id: string; disposition: string; words: number; empty: boolean; reasons: string[] }> = []

    for (const c of CASES) {
      const input = inputFor(c.lead, c.type)
      const noMessage = input.strategy?.contact?.messageRecommended === false && c.type !== 'reply'
      let text = ''
      try {
        const draft = await generateDraft(input)
        text = draft.draftText.trim()
      } catch {
        text = ''
      }
      const words = text ? text.split(/\s+/).length : 0
      const gate = text ? evaluateMessage(text, input.strategy ?? null, c.type === 'connection' ? 'connection' : c.type === 'followup' ? 'followup' : c.type === 'reply' ? 'reply' : 'dm') : { passed: noMessage, score: 100, reasons: [] }
      if (!noMessage && c.type !== 'reply') {
        expect(text.length, `${c.id} recommended a message but wrote nothing`).toBeGreaterThan(0)
      }

      const disposition = noMessage
        ? 'NO_MESSAGE'
        : !text
          ? 'REJECT'
          : !gate.passed && gate.score < 50
            ? 'REJECT'
            : classifySendDisposition(text, text)

      rows.push({
        id: c.id,
        disposition: noMessage ? 'NO_MESSAGE' : disposition,
        words,
        empty: !text,
        reasons: gate.reasons,
      })

      expect(text.includes('saw your post')).toBe(false)
      expect(text.includes('we specialize in')).toBe(false)
      expect(text.includes('just following up')).toBe(false)
      expect(/\bwe(?:'re| are) hiring\b/i.test(text)).toBe(false)
      if (text) expect(words).toBeLessThanOrEqual(80)
    }

    const noMessageIds = rows.filter((r) => r.disposition === 'NO_MESSAGE').map((r) => r.id)
    expect(noMessageIds).toEqual(expect.arrayContaining(['founder-no-intent', 'thin-founder', 'generic-posts', 'historical-onsite']))

    const hiring = rows.find((r) => r.id === 'hiring-fullstack')
    expect(hiring?.empty).toBe(false)
    expect(hiring?.words).toBeLessThanOrEqual(55)

    const reply = rows.find((r) => r.id === 'reply-examples-rate')
    expect(reply?.empty).toBe(false)
  })
})
