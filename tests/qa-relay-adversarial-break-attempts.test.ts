/**
 * Adversarial break attempts against the 12 bug fixes.
 *
 * Not a coverage suite. Each case is an input chosen to make a specific fix
 * produce the wrong answer — label collisions, cross-lead identity spoofing,
 * phrasing that looks like a different field, lifecycle edges.
 *
 * A case that passes proves nothing by itself; a case that FAILS is the point.
 */

import { describe, expect, it } from 'vitest'
import {
  normalizeExternalInput,
  isLabeledFieldLine,
} from '@/lib/intelligence-v3/normalize-external-input'
import {
  inboundFirstMessageKey,
  hasCanonicalOpeningMessage,
  findDuplicateOpeningTurns,
} from '@/lib/conversation/canonical-message'
import { buildThread } from '@/lib/conversation/thread'
import { stripOneShotIntent } from '@/lib/relay/lead-bootstrap-state'
import {
  resolveDraftGenerationState,
  canGenerateDraft,
} from '@/lib/relay/draft-generation-state'
import { getAuthCapabilities, signupAvailable } from '@/lib/auth/capabilities'
import { extractExplicitDates } from '@/lib/intelligence-v3/source-facts'
import { resolveBuyerIntentFromSource } from '@/lib/intelligence-v3/buyer-intent'
import { readUpworkJobFacts } from '@/lib/upwork/facts'
import { transitionLeadBootstrap, canStartBootstrap } from '@/lib/relay/lead-bootstrap-state'
import { cleanExtractedTitle } from '@/lib/upwork-v2'
import type { LeadDetail } from '@/lib/store/types'

// ── BUG-005/006/010 — normalization ──────────────────────────────────────────

describe('BUG-005/010 — label vs value collisions', () => {
  it('does not truncate a value that begins with a label word ("Company: Company XYZ")', () => {
    const out = normalizeExternalInput('Company: Company XYZ')
    // The label is stripped once; "Company XYZ" is the name, not "XYZ".
    expect(out.structuredFields.company).toBe('Company XYZ')
  })

  it('does not truncate a person named after a label ("Name: Name")', () => {
    const out = normalizeExternalInput('Name: Name')
    // A value that IS the label word is a value, not a repeated label.
    expect(out.structuredFields.name).toBe('Name')
  })

  it('keeps a value whose first word matches a DIFFERENT label ("Title: Rate Strategy")', () => {
    const out = normalizeExternalInput('Title: Rate Strategy')
    expect(out.structuredFields.title).toBe('Rate Strategy')
  })

  it('strips a genuinely repeated label ("Name: Name: Michael Anderson")', () => {
    const out = normalizeExternalInput('Name: Name: Michael Anderson')
    expect(out.structuredFields.name).toBe('Michael Anderson')
  })

  it('does not treat a value that merely starts with a separator as unlabeled', () => {
    const out = normalizeExternalInput('Company: - Acme Industries')
    expect(out.structuredFields.company).toBe('Acme Industries')
  })

  it('keeps a hyphenated value intact ("Company: Full-Stack.io")', () => {
    expect(normalizeExternalInput('Company: Full-Stack.io').structuredFields.company).toBe('Full-Stack.io')
  })

  it('maps "Rate:" to budget, not to a title', () => {
    const out = normalizeExternalInput('Rate: $50/hour')
    expect(out.structuredFields.budget).toBe('$50/hour')
    expect(out.structuredFields.title).toBeNull()
  })

  it('maps "Job Title:" to a title and never returns the label', () => {
    const out = normalizeExternalInput('Job Title: Operations Director')
    expect(out.structuredFields.jobTitle).toBe('Operations Director')
    expect(out.structuredFields.jobTitle).not.toMatch(/job title/i)
  })

  it('does not invent a field from a prose line that happens to contain a label word', () => {
    const out = normalizeExternalInput('We are hiring a Company Analyst role.')
    expect(out.structuredFields.company).toBeNull()
  })

  it('handles a label line whose value is only punctuation', () => {
    const out = normalizeExternalInput('Company: ...')
    expect(out.structuredFields.company).toBeNull()
  })

  it('isLabeledFieldLine rejects a sentence that merely contains a label word', () => {
    expect(isLabeledFieldLine('Our Company values matter')).toBe(false)
    expect(isLabeledFieldLine('Company: Acme')).toBe(true)
  })
})

describe('BUG-006 — country and location', () => {
  it('does not claim a country from a city that shares a name with one', () => {
    // "Georgia" is both a US state and a country; the location must not be
    // read as a country claim on the strength of the word alone.
    const out = normalizeExternalInput('Location: Georgia')
    expect(out.structuredFields.location).toBe('Georgia')
  })

  it('reads a country from the last country-like token', () => {
    const out = normalizeExternalInput('Location: Austin, Texas, United States')
    expect(out.structuredFields.country).toBe('United States')
    expect(out.structuredFields.location).toBe('Austin, Texas, United States')
  })

  it('leaves country null when no country is named', () => {
    const out = normalizeExternalInput('Location: Remote')
    expect(out.structuredFields.country).toBeNull()
  })
})

// ── BUG-002 — timing ─────────────────────────────────────────────────────────

describe('BUG-002 — start date vs activity date', () => {
  it('treats "Project begins April 2027" as a start date, not activity', () => {
    const d = extractExplicitDates('Project begins April 2027.')
    expect(d.buyerStartDate).toBe('April 2027')
    expect(d.activityDate).toBeNull()
  })

  it('treats "We begin in April 2027" as a start date', () => {
    const d = extractExplicitDates('We begin in April 2027.')
    expect(d.buyerStartDate).toBe('April 2027')
  })

  it('treats "Start date: April 2027" as a start date', () => {
    const d = extractExplicitDates('Start date: April 2027')
    expect(d.buyerStartDate).toBe('April 2027')
  })

  it('does not read a past narrative as a current start date', () => {
    const d = extractExplicitDates('We started looking for an agency in March 2019.')
    expect(d.buyerStartDate).toBeNull()
  })

  it('keeps a duration from becoming a start date', () => {
    const d = extractExplicitDates('Implementation should take 12 weeks.')
    expect(d.buyerStartDate).toBeNull()
    expect(d.durationDays).toBe(84)
  })
})

// ── BUG-004 — canonical opening identity ──────────────────────────────────────

function leadWith(overrides: Partial<LeadDetail>): LeadDetail {
  return {
    id: 'lead_1',
    direction: 'inbound',
    inboundMessage: 'We need an external team to rebuild our booking platform.',
    createdAt: '2026-10-20T10:00:00Z',
    messages: [],
    ...overrides,
  } as LeadDetail
}

describe('BUG-004 — cross-lead identity spoofing', () => {
  it('does not suppress the fallback for a key belonging to another lead', () => {
    // A message row carrying ANOTHER lead's canonical key must not make this
    // lead's opening disappear.
    const messages = [{
      id: 'msg_spoof',
      organizationId: 'org_1',
      leadId: 'lead_1',
      repId: null,
      type: 'reply',
      draftText: null,
      sentText: 'We need an external team to rebuild our booking platform.',
      sentAt: '2026-10-20T10:00:00Z',
      modelUsed: null,
      idempotencyKey: inboundFirstMessageKey('lead_OTHER'),
      direction: 'inbound',
      createdAt: '2026-10-20T10:00:00Z',
    }]
    expect(hasCanonicalOpeningMessage(messages, 'lead_1')).toBe(false)
    expect(buildThread(leadWith({ messages })).filter((t) => t.kind === 'inbound_first')).toHaveLength(1)
  })

  it('does not let a row with the right key but different text swallow the opening', () => {
    // The key alone must not certify the row. If the row does not carry the
    // opening text, the opening must still render — otherwise it disappears
    // silently from the conversation view.
    const opening = 'We need an external team to rebuild our booking platform.'
    const messages = [{
      id: 'msg_other',
      organizationId: 'org_1',
      leadId: 'lead_1',
      repId: null,
      type: 'reply',
      draftText: null,
      sentText: 'Thanks — sending the brief now.',
      sentAt: '2026-10-20T10:00:00Z',
      modelUsed: null,
      idempotencyKey: inboundFirstMessageKey('lead_1'),
      direction: 'inbound',
      createdAt: '2026-10-20T10:00:00Z',
    }]
    expect(hasCanonicalOpeningMessage(messages, 'lead_1', opening)).toBe(false)
    const thread = buildThread(leadWith({ messages, inboundMessage: opening }))
    // The fallback renders, and the opening appears exactly once.
    expect(thread.filter((t) => t.kind === 'inbound_first')).toHaveLength(1)
    expect(thread.filter((t) => t.text === opening)).toHaveLength(1)
  })

  it('suppresses the fallback only when the canonical row carries the opening', () => {
    const opening = 'We need an external team to rebuild our booking platform.'
    const messages = [{
      id: 'msg_ok',
      organizationId: 'org_1',
      leadId: 'lead_1',
      repId: null,
      type: 'reply',
      draftText: null,
      sentText: opening,
      sentAt: '2026-10-20T10:00:00Z',
      modelUsed: null,
      idempotencyKey: inboundFirstMessageKey('lead_1'),
      direction: 'inbound',
      createdAt: '2026-10-20T10:00:00Z',
    }]
    const thread = buildThread(leadWith({ messages, inboundMessage: opening }))
    expect(thread.filter((t) => t.text === opening)).toHaveLength(1)
  })

  it('keeps two genuinely repeated messages', () => {
    const text = 'Can you share a similar case study?'
    const thread = buildThread(leadWith({
      inboundMessage: null,
      messages: [text, text].map((t, i) => ({
        id: `msg_${i}`,
        organizationId: 'org_1',
        leadId: 'lead_1',
        repId: null,
        type: 'reply',
        draftText: null,
        sentText: t,
        sentAt: `2026-10-0${i + 1}T09:00:00Z`,
        modelUsed: null,
        direction: 'inbound',
        createdAt: `2026-10-0${i + 1}T09:00:00Z`,
      })),
    }))
    expect(thread).toHaveLength(2)
  })

  it('detects a duplicate opening when both the fallback and a row render', () => {
    const opening = 'We need an external team to rebuild our booking platform.'
    const dupes = findDuplicateOpeningTurns([
      { id: `inbound_first:lead_1`, role: 'client', text: opening },
      { id: 'msg_a', role: 'client', text: opening },
    ])
    expect(dupes).toHaveLength(1)
    expect(dupes[0].ids).toEqual([`inbound_first:lead_1`, 'msg_a'])
  })
})

// ── BUG-003 — one-shot intent ─────────────────────────────────────────────────

describe('BUG-003 — one-shot URL intent', () => {
  it('removes only the next param and keeps unrelated ones', () => {
    expect(stripOneShotIntent('https://relay.test/leads/a?tab=conversation&next=generate-reply'))
      .toBe('https://relay.test/leads/a?tab=conversation')
  })

  it('returns null when there is no intent to consume', () => {
    expect(stripOneShotIntent('https://relay.test/leads/a')).toBeNull()
  })

  it('handles the intent as the only param', () => {
    expect(stripOneShotIntent('https://relay.test/leads/a?next=generate-connection'))
      .toBe('https://relay.test/leads/a')
  })

  it('handles a trailing intent param', () => {
    expect(stripOneShotIntent('https://relay.test/leads/a?tab=conversation&next=generate-dm'))
      .toBe('https://relay.test/leads/a?tab=conversation')
  })
})

// ── BUG-012 — draft policy ────────────────────────────────────────────────────

describe('BUG-012 — SKIP never generates', () => {
  it('reports SKIPPED_BY_POLICY even when a draft exists and generation failed', () => {
    const state = resolveDraftGenerationState({
      verdict: 'skip', generating: true, draftText: 'some draft', needsRescoring: true, failed: true,
    })
    expect(state).toBe('SKIPPED_BY_POLICY')
    expect(canGenerateDraft(state)).toBe(false)
  })

  it('never lets a skip verdict look like a generator failure', () => {
    const state = resolveDraftGenerationState({
      verdict: 'skip', generating: false, draftText: '', needsRescoring: false, failed: true,
    })
    expect(state).not.toBe('FAILED')
  })
})

// ── BUG-011 — recruiter vs candidate vs buyer ─────────────────────────────────

describe('BUG-011 — role conflict edges', () => {
  it('a recruiter hiring an employee is not a buyer', () => {
    const i = resolveBuyerIntentFromSource(
      'Sofia Marchetti\nTechnical Recruiter at Northstar Talent\nWe\'re hiring a Full Stack Engineer for a fintech client. Submit your CV.',
    )
    expect(i.relationshipRole).toBe('RECRUITER')
    expect(i.buyerIntentLevel).toBe('UNKNOWN')
  })

  it('a recruiter with a verified external request is a BUYER, not blocked by the title', () => {
    const i = resolveBuyerIntentFromSource(
      'Alex Morgan\nTechnical Recruiter at Northstar Technologies\nCompany: Northstar Technologies\nWe are looking for an external software development agency to help us build a customer portal in React.\nApproved project budget: $20,000',
    )
    expect(i.relationshipRole).toBe('BUYER')
    expect(i.buyerIntentLevel).toBe('HIGH')
  })

  it('a candidate seeking work is never a buyer, even with hiring words present', () => {
    const i = resolveBuyerIntentFromSource(
      'Daniel Reyes\nSenior React Developer\nI am open to new contract roles.\nWe are hiring across our portfolio companies.',
    )
    expect(i.relationshipRole).toBe('CANDIDATE')
    expect(i.verifiedBuyerRequest).toBe(false)
  })

  it('a seller recruiting clients is not a buyer', () => {
    const i = resolveBuyerIntentFromSource(
      'Priya Nair\nFounder at Code Graphers\nWe are a software development agency. We build and deliver projects for our clients.\nIf you are hiring a development team for your next project, our team has capacity.',
    )
    expect(i.relationshipRole).toBe('SELLER')
    expect(i.verifiedBuyerRequest).toBe(false)
  })
})

// ── BUG-007 — Upwork title label handling ─────────────────────────────────────

describe('BUG-007 — Upwork labeled title', () => {
  it('reads a next-line "Job Title:" label and never returns the label', () => {
    const facts = readUpworkJobFacts('Job Title:\nFull-Stack Developer for AI-Powered Logistics SaaS\nFixed price: $60,000')
    expect(facts.title).toBe('Full-Stack Developer for AI-Powered Logistics SaaS')
    expect(facts.title).not.toMatch(/^Job Title/i)
  })

  it('reads a same-line "Title:" label', () => {
    const facts = readUpworkJobFacts('Title: Senior React Native Engineer\nFixed price: $5,000')
    expect(facts.title).toBe('Senior React Native Engineer')
  })

  it('falls back to the first non-noise line when no label exists', () => {
    const facts = readUpworkJobFacts('Senior Backend Engineer\nFixed price: $8,000\nBuild an API in Node.')
    expect(facts.title).toBe('Senior Backend Engineer')
  })
})

describe('BUG-007 — AI-path title cleaner', () => {
  it('strips a same-line "Title:" label from an AI-returned title', () => {
    expect(cleanExtractedTitle('Title: Senior React Engineer')).toBe('Senior React Engineer')
  })

  it('strips a "Job Title:" label from an AI-returned title', () => {
    expect(cleanExtractedTitle('Job Title: Senior React Engineer')).toBe('Senior React Engineer')
  })

  it('keeps a real title that merely starts with the word Title', () => {
    // "Title Search Specialist" is a job, not a label.
    expect(cleanExtractedTitle('Title Search Specialist')).toBe('Title Search Specialist')
  })

  it('strips Upwork chrome prefixes', () => {
    expect(cleanExtractedTitle('sfSenior Engineer')).toBe('Senior Engineer')
    expect(cleanExtractedTitle('Posted 3 days agoSenior Engineer')).toBe('Senior Engineer')
  })
})

// ── BUG-002 — more timing phrasings ──────────────────────────────────────────

describe('BUG-002 — every start phrasing is a start, every deadline a deadline', () => {
  const cases: Array<[string, string | null]> = [
    ['Project starts April 2027.', 'April 2027'],
    ['Kickoff: April 2027', 'April 2027'],
    ['Go-live April 2027', 'April 2027'],
    ['Onboard April 2027', 'April 2027'],
    ['Engagement starts April 2027.', 'April 2027'],
    ['Project begins April 2027.', 'April 2027'],
  ]
  it.each(cases)('%s → buyerStartDate %s', (line, expected) => {
    expect(extractExplicitDates(line).buyerStartDate).toBe(expected)
  })

  it('does not read a recruiter deadline as a buyer start date', () => {
    const d = extractExplicitDates('The role must be filled by September.')
    expect(d.buyerStartDate).toBeNull()
  })

  it('does not read a seller delivery promise as a buyer start date', () => {
    const d = extractExplicitDates('We can deliver in 4 weeks.')
    expect(d.buyerStartDate).toBeNull()
  })

  it('does not let a third-party delivery promise steal the buyer deadline', () => {
    // The regression guard: adding "deliver" to the start context made this
    // mixed message read the buyer's deadline as a start date, because the
    // seller's "they can deliver" matched the start context.
    const d = extractExplicitDates(
      'We need this built by March 2027. The agency we spoke to said they can deliver in 2 weeks.',
    )
    expect(d.deadline).toBe('March 2027')
    expect(d.buyerStartDate).toBeNull()
  })
})

// ── BUG-003 — bootstrap state machine edges ──────────────────────────────────

describe('BUG-003 — bootstrap state is terminal until re-requested', () => {
  it('cannot restart from DONE without a new REQUEST', () => {
    expect(transitionLeadBootstrap('DONE', 'START')).toBe('DONE')
    expect(canStartBootstrap('DONE')).toBe(false)
  })

  it('cannot restart from FAILED without a new REQUEST', () => {
    expect(transitionLeadBootstrap('FAILED', 'START')).toBe('FAILED')
    expect(transitionLeadBootstrap('FAILED', 'REQUEST')).toBe('PENDING')
  })

  it('cannot start from NOT_REQUESTED or RUNNING', () => {
    expect(canStartBootstrap('NOT_REQUESTED')).toBe(false)
    expect(canStartBootstrap('RUNNING')).toBe(false)
  })
})

// ── BUG-004 — remaining edges ────────────────────────────────────────────────

describe('BUG-004 — direction and empty edges', () => {
  it('never renders an inbound fallback for an outbound lead', () => {
    const thread = buildThread(leadWith({ direction: 'outbound', inboundMessage: null, messages: [] }))
    expect(thread).toHaveLength(0)
  })

  it('ignores an empty opening', () => {
    expect(buildThread(leadWith({ inboundMessage: '   ', messages: [] }))).toHaveLength(0)
  })

  it('does not suppress the fallback when the opening text is empty', () => {
    const messages = [{
      id: 'msg_a',
      organizationId: 'org_1',
      leadId: 'lead_1',
      repId: null,
      type: 'reply',
      draftText: null,
      sentText: 'Hello there.',
      sentAt: '2026-10-20T10:00:00Z',
      modelUsed: null,
      idempotencyKey: inboundFirstMessageKey('lead_1'),
      direction: 'inbound',
      createdAt: '2026-10-20T10:00:00Z',
    }]
    // No opening to protect: the row renders, nothing is lost.
    expect(buildThread(leadWith({ inboundMessage: null, messages }))).toHaveLength(1)
  })

  it('flags a genuine repeat as a duplicate pair for the caller to judge', () => {
    // The detector is deliberately text-based: two identical client turns are a
    // pair. It is telemetry, not a gate — the caller decides whether the pair is
    // the opening plus a fallback or two genuine repeats.
    const dupes = findDuplicateOpeningTurns([
      { id: 'a', role: 'client', text: 'Can you share a similar case study?' },
      { id: 'b', role: 'client', text: 'Can you share a similar case study?' },
    ])
    expect(dupes).toHaveLength(1)
  })
})

// ── BUG-003 — URL edges ─────────────────────────────────────────────────────

describe('BUG-003 — URL edge cases', () => {
  it('handles a host-only URL', () => {
    expect(stripOneShotIntent('https://relay.test?next=generate-reply')).toBe('https://relay.test/')
  })

  it('handles an intent repeated in the query string', () => {
    const out = stripOneShotIntent('https://relay.test/leads/a?next=generate-reply&next=generate-dm')
    expect(out).not.toContain('next=')
  })

  it('does not treat a value containing the word next as the intent param', () => {
    // `nextStep` is a different parameter; only an exact `next` is the intent.
    expect(stripOneShotIntent('https://relay.test/leads/a?nextStep=1')).toBeNull()
  })
})

// ── BUG-005 — further collisions ────────────────────────────────────────────

describe('BUG-005 — further label collisions', () => {
  it('keeps "Company: Company of Engineers"', () => {
    expect(normalizeExternalInput('Company: Company of Engineers').structuredFields.company).toBe('Company of Engineers')
  })

  it('keeps "Name: Nameson"', () => {
    expect(normalizeExternalInput('Name: Nameson').structuredFields.name).toBe('Nameson')
  })

  it('leaves an ambiguous repeated label alone ("Name: Name - Michael")', () => {
    // A bare hyphen is not a recognized separator (it is ambiguous with a
    // hyphenated value), so the value is left intact rather than mangled.
    expect(normalizeExternalInput('Name: Name - Michael').structuredFields.name).toBe('Name - Michael')
  })

  it('keeps the first value when a label appears twice', () => {
    expect(normalizeExternalInput('Company: Acme\nCompany: Other').structuredFields.company).toBe('Acme')
  })

  it('does not read a label buried mid-sentence', () => {
    // A label must start the line. "Our Company:" is prose, not a field.
    expect(normalizeExternalInput('Our Company: values matter').structuredFields.company).toBeNull()
  })
})

describe('BUG-008/009 — capability edges', () => {
  const BASE = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' }

  it('treats a whitespace-only invite code as not configured', () => {
    expect(getAuthCapabilities({ ...BASE, SIGNUP_INVITE_CODE: '   ' }).inviteOnlySignupEnabled).toBe(false)
  })

  it('treats "false" as not enabled', () => {
    expect(getAuthCapabilities({ ...BASE, RELAY_GOOGLE_AUTH_ENABLED: 'false' }).googleEnabled).toBe(false)
    expect(getAuthCapabilities({ ...BASE, SIGNUP_PUBLIC: 'false' }).publicSignupEnabled).toBe(false)
  })

  it('never reports a signup path without Supabase', () => {
    const caps = getAuthCapabilities({ SIGNUP_INVITE_CODE: 'relay-2026' })
    expect(signupAvailable(caps)).toBe(false)
  })

  it('public signup wins over an invite code when both are set', () => {
    const caps = getAuthCapabilities({ ...BASE, SIGNUP_PUBLIC: 'true', SIGNUP_INVITE_CODE: 'relay-2026' })
    expect(caps.publicSignupEnabled).toBe(true)
    expect(caps.inviteOnlySignupEnabled).toBe(false)
  })
})
