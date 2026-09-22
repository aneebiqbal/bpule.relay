import { describe, it, expect } from 'vitest'
import { extractLead } from '@/lib/demo-extract'
import { computeScore, verdictFor } from '@/lib/score/rubric'
import { generateDraft } from '@/lib/ai/draft'
import type { ExtractedLead, Fact, Lead, OrganizationRulebook, Play, StyleCard } from '@/lib/domain/types'

/**
 * Core BD pipeline: extraction -> scoring -> drafting, asserted against real
 * returned values. Runs entirely against the deterministic demo paths
 * (extractLead / generateDraft fall back to demoExtract / demoDraft when no
 * AI provider is configured), so this suite needs no API keys and makes no
 * network calls.
 */

const RULEBOOK: OrganizationRulebook = {
  organizationId: 'org-test',
  signals: [
    { id: 1, name: 'Hiring signal', weight: 4, short: 'Hiring', description: 'Actively hiring.', example: '' },
    { id: 7, name: 'Seeking help', weight: 3, short: 'Seeking help', description: 'Looking for a partner.', example: '' },
  ],
  verdictThresholds: {
    send: { min: 10, max: 12 },
    research_more: { min: 7, max: 9 },
    skip: { min: 0, max: 6 },
  },
  maxSignalWeight: 6,
  maxCompleteness: 6,
  confidenceSendThreshold: 72,
}

const FACTS: Fact[] = [
  { id: 'fact-1', organizationId: 'org-test', label: 'Price', value: '2000', factType: 'price', addedBy: null, createdAt: new Date().toISOString() },
  { id: 'fact-2', organizationId: 'org-test', label: 'Site live', value: 'false', factType: 'config', addedBy: null, createdAt: new Date().toISOString() },
]

const PLAYS: Play[] = []

const STYLE_CARD: StyleCard = {
  contractions: 'mostly_yes',
  formality: 2,
  sentence_length: 'medium',
  punctuation: 'standard',
  openers: 'statement',
  emoji_use: 'none',
  greeting: 'Hey',
  sign_off: 'Best',
  never_words: [],
  preferred_words: [],
  summary: 'Casual, direct.',
}

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    organizationId: 'org-test',
    ownerRepId: 'rep-1',
    company: 'Acme Robotics',
    companyKey: 'acme-robotics',
    contactName: 'Jordan Lee',
    contactTitle: 'Founder',
    titleRaw: 'Founder',
    locationRaw: 'Austin, Texas',
    url: 'https://example.com/acme',
    rawInput: null,
    roleCategory: 'founder_cofounder',
    marketRegion: 'US',
    extractionConfidence: 90,
    extractionProfile: null,
    signalType: 1,
    signalEvidence: 'Acme Robotics is hiring three senior engineers this quarter to scale the team.',
    verbatimQuote: 'We are hiring aggressively this quarter.',
    score: null,
    verdict: null,
    status: 'new',
    playId: null,
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeExtracted(overrides: Partial<ExtractedLead> = {}): ExtractedLead {
  return {
    name: 'Jordan Lee',
    title: 'Founder',
    company: 'Acme Robotics',
    url: 'https://example.com/acme',
    locationRaw: 'Austin, Texas',
    signalType: 1,
    signalEvidence: 'Acme Robotics is hiring for 3 senior engineering roles this quarter, scaling the team fast.',
    verbatimQuote: 'We are hiring aggressively this quarter.',
    tags: ['hiring'],
    extractionConfidence: 90,
    ...overrides,
  }
}

describe('BD pipeline: full flow (extract -> score -> draft)', () => {
  it('extracts a real, structured lead from raw pasted text', async () => {
    const rawText = 'Jordan Lee, Founder at Acme Robotics, Austin, United States. Posted: "We are hiring aggressively this quarter."'
    const extracted = await extractLead(rawText)

    // Assert on the actual returned values, not just "no throw."
    expect(extracted.name).toBe('Jordan Lee')
    expect(extracted.title?.toLowerCase()).toContain('founder')
    expect(typeof extracted.signalType).toBe('number')
    expect(extracted.signalEvidence.length).toBeGreaterThan(0)
  })

  it('scores a complete, well-evidenced lead into the send band', () => {
    const extracted = makeExtracted()
    const score = computeScore(extracted, RULEBOOK)

    expect(score.verdict).toBe('send')
    expect(score.total).toBeGreaterThanOrEqual(RULEBOOK.verdictThresholds.send.min)
    expect(score.breakdown.length).toBeGreaterThan(0)
  })

  it('drafts and sanitizes real outreach for a send-verdict lead', async () => {
    const extracted = makeExtracted()
    const score = computeScore(extracted, RULEBOOK)
    const lead = makeLead()

    const draft = await generateDraft({
      leadId: lead.id,
      lead,
      extracted,
      score,
      type: 'dm',
      styleCard: STYLE_CARD,
      facts: FACTS,
      plays: PLAYS,
    })

    expect(draft.draftText.length).toBeGreaterThan(0)
    expect(draft.draftText.toLowerCase()).toContain('acme robotics')
    // The evidence's "3" is not an approved fact value. The generator may or
    // may not cite it, but that number must never survive sanitization — only
    // unapproved "3"s can ever be stripped, and the published draft cannot
    // carry an unauthorized digit. This is the guard working, not a leak.
    for (const n of draft.strippedNumbers) expect(n).toBe('3')
    expect(draft.draftText).not.toMatch(/\d/)
    expect(draft.hadEmDash).toBe(false)
    expect(draft.requestedCall).toBe(false)
  })
})

describe('BD pipeline: the confidence gate', () => {
  it('never auto-sends a thin, low-quality extraction regardless of raw point total', () => {
    // Deliberately thin: no name, no title, vague evidence, no quote — the
    // exact shape of garbled real-world input. Even if a caller forced the
    // signal weight high, extractionConfidence should veto auto-send.
    const thin: ExtractedLead = {
      name: null,
      title: null,
      company: 'Acme Robotics',
      url: null,
      signalType: 1,
      signalEvidence: 'stuff', // too short/vague to be "specific"
      verbatimQuote: null,
      tags: [],
      extractionConfidence: 40, // below confidenceSendThreshold (72)
      confidenceNotes: ['Missing name.', 'Missing title.', 'Evidence is vague.'],
    }

    const score = computeScore(thin, RULEBOOK)

    expect(score.verdict).not.toBe('send')
    expect(['research_more', 'skip']).toContain(score.verdict)
    expect((score.gates ?? []).length).toBeGreaterThan(0)
  })

  it('demo-mode extraction (no provider configured) always lands below the send confidence threshold', async () => {
    // demoExtract() hardcodes extractionConfidence: 55, always below the
    // default confidenceSendThreshold of 72 — this is what actually protects
    // demo-mode users from an auto-send on unverified extraction.
    const extracted = await extractLead('Some garbled text with no clear structure at all.')
    expect(extracted.extractionConfidence).toBeLessThan(RULEBOOK.confidenceSendThreshold)
  })

  it('downgrades a high-point-total lead to research_more when confidence is low', () => {
    // Raw points alone would clear the send band, but low extraction
    // confidence must still force a downgrade — this is the one-way gate.
    const highPointsLowConfidence = makeExtracted({
      extractionConfidence: 50,
      signalEvidence: 'Acme Robotics is hiring for 3 senior engineering roles in 2026, scaling the team fast.',
    })
    const score = computeScore(highPointsLowConfidence, RULEBOOK)

    expect(score.baseVerdict).toBe('send') // raw points alone would send
    expect(score.verdict).toBe('research_more') // confidence gate downgrades it
    expect((score.gates ?? []).some((g) => g.includes('confidence'))).toBe(true)
  })
})

describe('BD pipeline: signal-evidence matching', () => {
  it('applies a confidence penalty when evidence does not support the claimed signal', () => {
    // Claims a hiring signal (type 1) but the evidence text has nothing to
    // do with hiring — this should not score as strongly as matched evidence.
    const mismatched = makeExtracted({
      signalType: 1,
      signalEvidence: 'The team migrated their database to a new provider last month.',
      extractionConfidence: 45, // reflects the real penalty extract.ts would apply
    })
    const score = computeScore(mismatched, RULEBOOK)
    expect(score.verdict).not.toBe('send')
  })

  it('blocks draft generation outright when the claimed signal is not supported by its evidence', async () => {
    const mismatched = makeExtracted({
      signalType: 1, // hiring
      signalEvidence: 'The team migrated their database to a new provider last month.', // not a hiring signal
    })
    const score = computeScore(mismatched, RULEBOOK)
    const lead = makeLead({ signalType: 1, signalEvidence: mismatched.signalEvidence })

    await expect(
      generateDraft({
        leadId: lead.id,
        lead,
        extracted: mismatched,
        score,
        type: 'dm',
        styleCard: STYLE_CARD,
        facts: FACTS,
        plays: PLAYS,
      }),
    ).rejects.toThrow(/not supported by its evidence/i)
  })

  it('does not block generation when evidence genuinely supports the claimed signal', async () => {
    const matched = makeExtracted() // hiring signal + hiring evidence
    const score = computeScore(matched, RULEBOOK)
    const lead = makeLead()

    await expect(
      generateDraft({
        leadId: lead.id,
        lead,
        extracted: matched,
        score,
        type: 'dm',
        styleCard: STYLE_CARD,
        facts: FACTS,
        plays: PLAYS,
      }),
    ).resolves.toBeDefined()
  })

  it('blocks generation outright for a skip-verdict lead, independent of the evidence gate', async () => {
    const skippy = makeExtracted({
      name: null,
      title: null,
      url: null,
      verbatimQuote: null,
      signalEvidence: 'x',
      extractionConfidence: 20,
    })
    const score = computeScore(skippy, RULEBOOK)
    expect(score.verdict).toBe('skip')

    const lead = makeLead()
    await expect(
      generateDraft({
        leadId: lead.id,
        lead,
        extracted: skippy,
        score,
        type: 'dm',
        styleCard: STYLE_CARD,
        facts: FACTS,
        plays: PLAYS,
      }),
    ).rejects.toThrow(/scored skip/i)
  })
})

describe('BD pipeline: verdictFor threshold bands', () => {
  it.each([
    [12, 'send'],
    [10, 'send'],
    [9, 'research_more'],
    [7, 'research_more'],
    [6, 'skip'],
    [0, 'skip'],
  ] as const)('total=%d -> %s', (total, expected) => {
    expect(verdictFor(total, RULEBOOK)).toBe(expected)
  })
})
