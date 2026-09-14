import { describe, it, expect } from 'vitest'
import { runEval, type GoldenCase } from '@/lib/ai/eval'
import { sanitizeDraft, requestsCall } from '@/lib/facts/sanitize'
import type { DraftInput } from '@/lib/ai/draft'
import type { ExtractedLead, Fact, Lead, Play, StyleCard } from '@/lib/domain/types'

/**
 * Draft quality assertions, run against a small fixed golden set through the
 * real eval harness (runEval). All checks are programmatic against the
 * actual generated output, not manually read. Runs entirely against
 * generateDraft's deterministic demo path (no AI provider configured in
 * this environment), so this is a real CI-safe gate, not a one-off.
 */

const FACTS: Fact[] = [
  { id: 'fact-price', organizationId: 'org-test', label: 'Price', value: '1500', factType: 'price', addedBy: null, createdAt: new Date().toISOString() },
  { id: 'fact-site', organizationId: 'org-test', label: 'Site live', value: 'false', factType: 'config', addedBy: null, createdAt: new Date().toISOString() },
]

const PLAYS: Play[] = []

const STYLE_CARD: StyleCard = {
  contractions: 'mostly_yes',
  formality: 2,
  sentence_length: 'short',
  punctuation: 'standard',
  openers: 'statement',
  emoji_use: 'none',
  greeting: 'Hey',
  sign_off: 'Best',
  never_words: [],
  preferred_words: [],
  summary: 'Casual, direct, short sentences.',
}

function makeLead(id: string, company: string): Lead {
  return {
    id,
    organizationId: 'org-test',
    ownerRepId: 'rep-1',
    company,
    companyKey: company.toLowerCase().replace(/\s+/g, '-'),
    contactName: 'Alex Rivera',
    contactTitle: 'Founder',
    titleRaw: 'Founder',
    locationRaw: 'Austin, Texas',
    url: `https://example.com/${id}`,
    rawInput: null,
    roleCategory: 'founder_cofounder',
    marketRegion: 'US',
    extractionConfidence: 88,
    extractionProfile: null,
    signalType: 1,
    signalEvidence: `${company} is hiring for 2 senior roles this quarter.`,
    verbatimQuote: 'We are hiring aggressively.',
    score: 11,
    verdict: 'send',
    status: 'new',
    playId: null,
    tags: [],
    createdAt: new Date().toISOString(),
  }
}

function makeExtracted(company: string): ExtractedLead {
  return {
    name: 'Alex Rivera',
    title: 'Founder',
    company,
    url: `https://example.com/${company.toLowerCase()}`,
    locationRaw: 'Austin, Texas',
    signalType: 1,
    signalEvidence: `${company} is hiring for 2 senior roles this quarter.`,
    verbatimQuote: 'We are hiring aggressively.',
    tags: ['hiring'],
    extractionConfidence: 88,
  }
}

function goldenCase(id: string, company: string, sentText: string, knownReplied: boolean): GoldenCase {
  const lead = makeLead(id, company)
  const extracted = makeExtracted(company)
  const input: DraftInput = {
    leadId: id,
    lead,
    extracted,
    score: { total: 11, verdict: 'send', baseVerdict: 'send', breakdown: [], gates: [] },
    type: 'dm',
    styleCard: STYLE_CARD,
    facts: FACTS,
    plays: PLAYS,
  }
  return {
    id,
    leadId: id,
    knownReplied,
    sentText,
    leadCompany: company,
    leadEvidence: extracted.signalEvidence,
    input,
  }
}

const GOLDEN_SET: GoldenCase[] = [
  goldenCase('case-acme', 'Acme Robotics', 'Hey Alex, noticed Acme Robotics is hiring for 2 senior roles. Happy to send a free Read on what I am seeing.', true),
  goldenCase('case-beacon', 'Beacon Hotel Booking', 'Hey Alex, Beacon Hotel Booking hiring for 2 senior roles caught my eye. Free Read if useful.', true),
  goldenCase('case-delta', 'Delta Freight Co', 'Hey Alex, saw the hiring push at Delta Freight Co. Open to a free Read.', false),
]

describe('draft quality gate: golden set through the real eval harness', () => {
  it('runs the golden set end to end and returns real per-case results', async () => {
    const result = await runEval(GOLDEN_SET, 'test-run')

    expect(result.goldenSetSize).toBe(GOLDEN_SET.length)
    expect(result.caseResults).toHaveLength(GOLDEN_SET.length)
    for (const c of result.caseResults) {
      expect(c.draftText.length).toBeGreaterThan(0)
    }
  })

  it('every generated draft mentions the actual lead company', async () => {
    const result = await runEval(GOLDEN_SET, 'test-run')
    for (const c of result.caseResults) {
      expect(c.companyMentioned).toBe(true)
    }
    expect(result.companyMentionRate).toBe(100)
  })

  it('no generated draft contains an exclamation mark', async () => {
    const result = await runEval(GOLDEN_SET, 'test-run')
    for (const c of result.caseResults) {
      expect(c.draftText).not.toMatch(/!/)
    }
  })

  it('no generated draft contains an em dash or en dash', async () => {
    const result = await runEval(GOLDEN_SET, 'test-run')
    for (const c of result.caseResults) {
      expect(c.draftText).not.toMatch(/[—–]/)
    }
  })

  it('no generated draft asks for a call, meeting, or chat — only the free Read', async () => {
    const result = await runEval(GOLDEN_SET, 'test-run')
    for (const c of result.caseResults) {
      expect(requestsCall(c.draftText)).toBe(false)
    }
  })

  it('no unauthorized number appears in any draft that is not sourced from the facts table', async () => {
    for (const goldenC of GOLDEN_SET) {
      const draft = await import('@/lib/ai/draft').then((m) => m.generateDraft(goldenC.input))
      const sanitized = sanitizeDraft(draft.draftText, FACTS)
      // sanitizeDraft has already stripped anything unapproved; re-running
      // it against its own output must be a no-op if the guard worked.
      expect(sanitized.strippedNumbers).toEqual([])
    }
  })
})

describe('draft quality gate: banned phrases (fixed BD-pipeline set)', () => {
  const BANNED_PHRASES = [
    "let's hop on a call",
    'circle back',
    'synergy',
    'touch base',
    'per my last email',
  ]

  it('no generated draft contains any banned phrase', async () => {
    const result = await runEval(GOLDEN_SET, 'test-run')
    for (const c of result.caseResults) {
      const lower = c.draftText.toLowerCase()
      for (const phrase of BANNED_PHRASES) {
        expect(lower).not.toContain(phrase)
      }
    }
  })
})

describe('draft quality gate: a real failing case is scored honestly, not silently passed', () => {
  it('a case with a signal-evidence mismatch fails cleanly and scores as zero, not a false pass', async () => {
    const mismatchedLead = makeLead('case-mismatch', 'Gamma Textiles')
    const mismatchedExtracted: ExtractedLead = {
      ...makeExtracted('Gamma Textiles'),
      signalType: 1, // claims hiring
      signalEvidence: 'Gamma Textiles migrated their database last month.', // not a hiring signal
    }
    const badCase = goldenCase('case-mismatch', 'Gamma Textiles', 'irrelevant', true)
    badCase.input.extracted = mismatchedExtracted
    badCase.leadEvidence = mismatchedExtracted.signalEvidence
    badCase.input.lead = mismatchedLead

    const result = await runEval([badCase], 'test-run')
    const caseResult = result.caseResults[0]

    // generateDraft throws on a signal-evidence mismatch; runEval's catch
    // path scores that as a hard failure, not a silent pass.
    expect(caseResult.passed).toBe(false)
    expect(caseResult.draftText).toBe('')
    expect(result.selfCheckPassRate).toBe(0)
  })
})
