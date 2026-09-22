import { describe, expect, it } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { deriveSignalEvidenceFallback } from '@/lib/intelligence-v2/orchestrator'
import { DARIA_REDKINA_SOLSONIC_RAW } from './fixtures/hardening-regressions/daria-redkina-solsonic'

/**
 * Hardening regression fixture — Daria Redkina / Solsonic.
 *
 * Real user-supplied LinkedIn source. Captures root-caused bugs found while
 * tracing this fixture through the pipeline. See the fixture file for the
 * full list of originally-reported symptoms. DO NOT special-case "Daria" or
 * "Solsonic" anywhere in application code — these tests assert on the
 * general mechanisms the fixes touch, using this fixture only as one
 * concrete input that was broken before the fix.
 */
describe('Hardening regression — Daria Redkina / Solsonic', () => {
  it('extracts the company name from a "Founder of X" headline (was: null "Unknown company" despite repeated explicit company evidence)', async () => {
    const result = await produceCanonicalIntelligence(DARIA_REDKINA_SOLSONIC_RAW, {})
    expect(result.intelligence.intelligence.company.name).toBe('Solsonic')
  })

  it('does not overstate a growth signal as an established software-services need', async () => {
    const result = await produceCanonicalIntelligence(DARIA_REDKINA_SOLSONIC_RAW, {})
    const reasons = result.intelligence.scoreBreakdown.reasons.join(' ')
    // The old wording ("Company growth indicates potential need.") stated an
    // inference as if it were a fact. The evidence is that the company is
    // growing/scaling — NOT that they need software services.
    expect(reasons).not.toContain('Company growth indicates potential need.')
    if (result.intelligence.intelligence.opportunity.signals.includes('growth_signal')) {
      const growthReason = result.intelligence.scoreBreakdown.reasons.find((r) => /growth/i.test(r))
      if (growthReason) {
        expect(growthReason).toMatch(/possible|unconfirmed|not.*verified|may|could/i)
      }
    }
  })

  it('deriveSignalEvidenceFallback never returns raw LinkedIn navigation chrome when structured evidence is absent', () => {
    const chromeHeavyText = `Some Person
· 3rd
Title Here
Berlin, Germany
·
Contact info
svg
Freelance
image
Some University
30
connections
svgMessage
svg
Follow
More`
    const fakeCanonical = {
      intelligence: {
        opportunity: { description: null },
        opportunityTrigger: null,
        content: { hiringSignals: [], explicitProblems: [], recentPosts: [] },
      },
    } as unknown as Parameters<typeof deriveSignalEvidenceFallback>[0]
    const evidence = deriveSignalEvidenceFallback(fakeCanonical, chromeHeavyText)
    // Must not be the raw "· 3rd\nTitle Here\nBerlin, Germany\n·\nContact info..." blob
    expect(evidence).not.toContain('svg')
    expect(evidence).not.toContain('Contact info')
  })

  it('generateDraft-equivalent path (via streamDraft) produces a non-empty connection note when CONNECT_OR_OBSERVE recommends one, even when structured signal evidence is thin (was: empty draft, "No note generated")', async () => {
    const result = await produceCanonicalIntelligence(DARIA_REDKINA_SOLSONIC_RAW, {})
    const canonical = result.intelligence

    const { buildRevenueStrategy, sourceFromCanonical, shouldWriteMessage, mapSignalsToLegacyType } = await import('@/lib/relay/revenue-strategy')
    const { classifyLeadFact } = await import('@/lib/relay/profile-intelligence')
    const { classifyRoleFromTitle } = await import('@/lib/leads/targeting-pure')
    const { streamDraft } = await import('@/lib/ai/draft-stream')
    const { getDisplayScore } = await import('@/lib/intelligence-v2/orchestrator')

    const revenue = buildRevenueStrategy(sourceFromCanonical(canonical, { channel: 'connection' }))
    expect(shouldWriteMessage(revenue)).toBe(true) // strategy DOES recommend a message

    const extracted = {
      name: canonical.intelligence.person.fullName,
      title: canonical.intelligence.person.title,
      titleRaw: canonical.intelligence.person.title,
      company: canonical.intelligence.company.name ?? 'Unknown company',
      url: null,
      locationRaw: canonical.intelligence.person.location,
      aboutSummary: null,
      experienceSummary: null,
      recentPosts: [],
      roleCategory: classifyRoleFromTitle(canonical.intelligence.person.title) ?? 'other',
      marketRegion: 'unknown' as const,
      signalType: mapSignalsToLegacyType(canonical.intelligence.opportunity.signals),
      signalEvidence: deriveSignalEvidenceFallback(canonical, DARIA_REDKINA_SOLSONIC_RAW),
      extractionConfidence: canonical.extractionCompleteness.score,
      confidenceNotes: canonical.scoreBreakdown.missingInfo,
      verbatimQuote: null,
      tags: [],
    }

    const safeFact = classifyLeadFact(extracted.signalEvidence ?? '', extracted.signalEvidence ?? '', extracted.signalType ?? null)

    const leadForDraft = {
      id: 'test-daria', organizationId: '', ownerRepId: null,
      company: extracted.company, companyKey: 'solsonic',
      contactName: extracted.name, contactTitle: extracted.title, url: null, rawInput: null,
      signalType: extracted.signalType, signalEvidence: extracted.signalEvidence, verbatimQuote: null,
      score: getDisplayScore(canonical) ?? 5,
      verdict: 'research_more' as const,
      status: 'new' as const, playId: null, tags: [], createdAt: new Date().toISOString(),
    }

    const draftResult = await streamDraft(
      {
        leadId: 'test-daria',
        lead: leadForDraft,
        extracted,
        score: { total: canonical.canonicalScore, verdict: 'research_more' as const, breakdown: canonical.scoreBreakdown.dimensions as unknown as { category: string; label: string; points: number; max: number; note: string }[] },
        canonicalScore: canonical.canonicalScore,
        type: 'connection',
        styleCard: null, facts: [], plays: [], history: [], profile: null, matchedProof: null,
        fewShotExamples: [], strategy: null, safeFacts: [safeFact], matchedProofCards: [],
      },
      () => undefined,
      null, null,
    )

    expect(draftResult.draftText).toBeTruthy()
    expect(draftResult.draftText.length).toBeGreaterThan(0)
  })
})
