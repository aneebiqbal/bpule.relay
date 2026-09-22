import { describe, expect, it } from 'vitest'
import { isClientCanonicalStillValid } from '@/lib/intelligence-v2/orchestrator'
import { buildIntelligenceInputHash, INTELLIGENCE_PIPELINE_VERSION } from '@/lib/intelligence-v2/input-hash'
import { SCORE_VERSION } from '@/lib/intelligence-v2/scoring-engine'
import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'

/**
 * Regression coverage for Relay team bug bash — TEAM-005 (score changes on
 * reanalysis, "60 → 25 → 20 for the same prospect", "Try Another Angle
 * changes score again").
 *
 * Root cause: BEFORE a lead is saved, the ephemeral /prospect flow has
 * nothing persisted for the normal reuseIfUnchanged (hash lookup against
 * saved leads) to match against. "Try Another Angle" called the exact same
 * /api/prospect/analyze endpoint as the initial Analyze with the same
 * rawText, so every click re-ran the FULL pipeline (fresh extraction +
 * fresh scoring) with zero reuse protection — fully exposed to live-LLM
 * sampling/provider variance on every click, even though the user never
 * touched the source text and only wanted a different message angle.
 *
 * Fix: the client sends back its already-held canonical result, and
 * isClientCanonicalStillValid() is the server-side proof (never a blind
 * trust of the client) that it's still valid for this exact input under
 * the current pipeline/score versions — if so, the route skips extraction
 * and scoring entirely and only reruns sender-matching + drafting, so
 * canonical evidence/score/qualification/action can never change from
 * "Try Another Angle," only the generated message.
 */

const RAW_TEXT = 'Sarah Chen, Senior Fullstack Engineer at Acme Corp. Hiring for the platform team.'

function makeClientCanonical(overrides: Partial<CanonicalProspectIntelligence> = {}): CanonicalProspectIntelligence {
  return {
    version: 'relay_qualification_v2',
    intelligenceRunId: 'run-1',
    intelligenceInputHash: buildIntelligenceInputHash({ rawText: RAW_TEXT }),
    intelligenceVersion: INTELLIGENCE_PIPELINE_VERSION,
    computedAt: '2026-01-01T00:00:00.000Z',
    canonicalScore: 60,
    scoreVersion: SCORE_VERSION,
    scoredAt: '2026-01-01T00:00:00.000Z',
    scoreBreakdown: { dimensions: [], hardNegatives: [], missingInfo: [], total: 60, label: 'Worth pursuing', reasons: [], watchOut: [] },
    confidence: 80,
    qualification: 'worth_pursuing',
    intelligence: {} as CanonicalProspectIntelligence['intelligence'],
    rawSource: {} as CanonicalProspectIntelligence['rawSource'],
    evidenceLedger: [],
    remoteEligibility: { workplaceType: 'UNKNOWN', remoteScope: 'UNKNOWN', eligibility: 'UNCLEAR', reason: 'x' },
    extractionCompleteness: { score: 80, presentFields: [], missingFields: [], weakFields: [], repairAttempted: false, repairImproved: false, sourceUrlsFound: [], urlsPreserved: [] },
    rescoreEvents: [],
    recommendedIdentityId: null,
    recommendedProofIds: [],
    personalizationAngle: null,
    outreachContext: null,
    extractionCallLog: [],
    extractionTrace: [],
    ...overrides,
  }
}

describe('isClientCanonicalStillValid — Try Another Angle reuse gate', () => {
  it('accepts a client-held canonical result that matches the SAME rawText and current versions (the core TEAM-005 fix)', () => {
    const canonical = makeClientCanonical()
    expect(isClientCanonicalStillValid(canonical, RAW_TEXT, false)).toBe(true)
  })

  it('rejects when rawText has meaningfully changed (a real edit, not a Try Another Angle click)', () => {
    const canonical = makeClientCanonical() // hashed against RAW_TEXT
    const differentText = 'A completely different prospect: John Doe, plumber, not looking for software help.'
    expect(isClientCanonicalStillValid(canonical, differentText, false)).toBe(false)
  })

  it('rejects when the pipeline version has changed (protects against silently serving pre-upgrade canonical truth)', () => {
    const canonical = makeClientCanonical({ intelligenceVersion: 'intelligence_pipeline_v0_old' })
    expect(isClientCanonicalStillValid(canonical, RAW_TEXT, false)).toBe(false)
  })

  it('rejects when the score version has changed', () => {
    const canonical = makeClientCanonical({ scoreVersion: 'relay_qualification_v1_old' })
    expect(isClientCanonicalStillValid(canonical, RAW_TEXT, false)).toBe(false)
  })

  it('rejects a tampered/mismatched hash (defends against a client sending back a canonical result for different text than what it claims)', () => {
    const canonical = makeClientCanonical({ intelligenceInputHash: 'not-the-real-hash-abc123' })
    expect(isClientCanonicalStillValid(canonical, RAW_TEXT, false)).toBe(false)
  })

  it('Force Reanalyze bypasses reuse even for an otherwise-valid client canonical', () => {
    const canonical = makeClientCanonical()
    expect(isClientCanonicalStillValid(canonical, RAW_TEXT, true)).toBe(false)
  })

  it('rejects when no client canonical is provided (normal fresh-Analyze path, not Try Another Angle)', () => {
    expect(isClientCanonicalStillValid(null, RAW_TEXT, false)).toBe(false)
    expect(isClientCanonicalStillValid(undefined, RAW_TEXT, false)).toBe(false)
  })

  it('is a pure function: repeated calls with the same inputs always agree (metamorphic stability of the gate itself)', () => {
    const canonical = makeClientCanonical()
    const results = Array.from({ length: 20 }, () => isClientCanonicalStillValid(canonical, RAW_TEXT, false))
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe(true)
  })
})
