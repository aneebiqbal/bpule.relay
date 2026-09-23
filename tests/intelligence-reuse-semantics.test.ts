import { describe, expect, it, vi } from 'vitest'
import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'
import { buildIntelligenceInputHash, INTELLIGENCE_PIPELINE_VERSION } from '@/lib/intelligence-v2/input-hash'
import { SCORE_VERSION } from '@/lib/intelligence-v2/scoring-engine'

/**
 * Regression coverage for Phase 6 (stable input hashing / re-extraction
 * semantics) of the Relay hardening sprint.
 *
 * Governing rule: same normalized input + same pipeline/score versions =>
 * reuse the persisted canonical intelligence instead of invoking AI
 * extraction again. Refresh/retry/re-paste must never silently produce new
 * business truth. Explicit re-analysis, a real source change, or a version
 * bump must each still produce a fresh run.
 */

const SAMPLE_TEXT = `Sarah Chen
Senior Fullstack Engineer at Acme Corp
San Francisco, CA

About
We're hiring a Senior Fullstack Engineer to help scale our platform.

Posts
"We're hiring a Senior Fullstack Engineer. Stack: React, Node.js, PostgreSQL. Remote worldwide. Apply at careers@acme.com"`

function makeCanonicalStub(overrides: Partial<CanonicalProspectIntelligence> = {}): CanonicalProspectIntelligence {
  const inputHash = buildIntelligenceInputHash({ rawText: SAMPLE_TEXT })
  return {
    version: 'relay_qualification_v2',
    intelligenceRunId: 'prior-run-id',
    intelligenceInputHash: inputHash,
    intelligenceVersion: INTELLIGENCE_PIPELINE_VERSION,
    computedAt: '2026-01-01T00:00:00.000Z',
    canonicalScore: 77,
    scoreVersion: SCORE_VERSION,
    scoredAt: '2026-01-01T00:00:00.000Z',
    scoreBreakdown: {
      dimensions: [],
      hardNegatives: [],
      missingInfo: [],
      total: 77,
      label: 'Worth pursuing',
      reasons: ['stubbed prior run'],
      watchOut: [],
    },
    confidence: 90,
    qualification: 'worth_pursuing',
    intelligence: {
      person: { fullName: 'Sarah Chen', firstName: 'Sarah', title: 'Senior Fullstack Engineer', seniority: 'senior', location: 'San Francisco, CA', linkedinUrl: null, otherUrls: [] },
      company: { name: 'Acme Corp', domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
      opportunity: { signals: ['hiring'], primarySignal: 'hiring', description: 'Hiring a Senior Fullstack Engineer', urgency: 'unknown' },
      job: null,
      content: { recentPosts: [], topics: [], explicitProblems: [], initiatives: [], launches: [], technicalSignals: ['react', 'node.js', 'postgresql'], hiringSignals: [] },
      remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'WORLDWIDE', eligibility: 'ELIGIBLE', reason: 'Remote worldwide stated' },
      probableNeed: null,
      opportunityTrigger: null,
      timingSignal: null,
      risks: [],
      unknowns: [],
      resolvedContradictions: [],
      businessModel: 'PRODUCT',
      relationship: 'POTENTIAL_BUYER',
    },
    rawSource: {
      rawInput: SAMPLE_TEXT,
      sourceType: 'pasted_text',
      sourceUrl: null,
      profileUrl: null,
      companyUrl: null,
      jobUrl: null,
      postUrls: [],
      rawPosts: [],
      rawJobDescription: null,
      rawProfileText: null,
      rawCompanyText: null,
      capturedAt: '2026-01-01T00:00:00.000Z',
    },
    evidenceLedger: [],
    remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'WORLDWIDE', eligibility: 'ELIGIBLE', reason: 'Remote worldwide stated' },
    extractionCompleteness: { score: 90, presentFields: [], missingFields: [], weakFields: [], repairAttempted: false, repairImproved: false, sourceUrlsFound: [], urlsPreserved: [] },
    rescoreEvents: [],
    recommendedIdentityId: null,
    recommendedProofIds: [],
    personalizationAngle: null,
    outreachContext: null,
    extractionCallLog: [{ provider: 'opencode', model: 'glm-5.3-flash', task: 'extract_pass_a', latencyMs: 1200, fallback: false }],
    extractionTrace: [],
    ...overrides,
  }
}

describe('produceCanonicalIntelligence — input-hash reuse semantics', () => {
  it('reuses a persisted result for exact duplicate input (no AI call is even attempted)', async () => {
    const prior = makeCanonicalStub()
    const reuseIfUnchanged = vi.fn(async () => prior)

    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, { reuseIfUnchanged })

    expect(result.reused).toBe(true)
    expect(result.intelligence.intelligenceRunId).toBe('prior-run-id') // literally the same run, not a new one
    expect(result.intelligence.canonicalScore).toBe(77)
    expect(reuseIfUnchanged).toHaveBeenCalledTimes(1)
  })

  it('reuses across whitespace/formatting noise (metamorphic — semantically identical input)', async () => {
    const prior = makeCanonicalStub() // hashed against SAMPLE_TEXT
    const reuseIfUnchanged = vi.fn(async () => prior)

    // Purely cosmetic noise: leading/trailing whitespace on the whole text,
    // extra horizontal whitespace within lines, extra blank lines between
    // existing paragraphs — none of it changes what the text says.
    const noisyText = `   ${SAMPLE_TEXT.replace(/\n\n/g, '\n\n\n\n').replace(/ /g, '  ')}   `
    const result = await produceCanonicalIntelligence(noisyText, { reuseIfUnchanged })

    expect(result.reused).toBe(true)
    expect(result.intelligence.intelligenceRunId).toBe('prior-run-id')
  })

  it('does NOT reuse when the source content meaningfully changed', async () => {
    const prior = makeCanonicalStub() // hashed against SAMPLE_TEXT
    const reuseIfUnchanged = vi.fn(async (hash: string) => {
      // Simulate a real lookup: only matches on the exact hash it was stored under.
      return hash === buildIntelligenceInputHash({ rawText: SAMPLE_TEXT }) ? prior : null
    })

    const differentText = 'Completely different profile: John Doe, Plumber, not looking for software help.'
    const result = await produceCanonicalIntelligence(differentText, { reuseIfUnchanged })

    expect(result.reused).toBe(false)
    expect(result.intelligence.intelligenceRunId).not.toBe('prior-run-id')
  })

  it('does NOT reuse when the intelligence pipeline version does not match (safety net even if the lookup is stale)', async () => {
    const stalePipelineVersion = makeCanonicalStub({ intelligenceVersion: 'intelligence_pipeline_v0_old' })
    const reuseIfUnchanged = vi.fn(async () => stalePipelineVersion)

    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, { reuseIfUnchanged })

    expect(result.reused).toBe(false)
  })

  it('does NOT reuse when the score version does not match', async () => {
    const staleScoreVersion = makeCanonicalStub({ scoreVersion: 'relay_qualification_v1_old' })
    const reuseIfUnchanged = vi.fn(async () => staleScoreVersion)

    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, { reuseIfUnchanged })

    expect(result.reused).toBe(false)
  })

  it('does NOT reuse when the returned result carries a different hash than requested (defends against a buggy or malicious lookup)', async () => {
    const wrongHashResult = makeCanonicalStub({ intelligenceInputHash: 'not-the-real-hash' })
    const reuseIfUnchanged = vi.fn(async () => wrongHashResult)

    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, { reuseIfUnchanged })

    expect(result.reused).toBe(false)
  })

  it('Force Reanalyze skips reuse entirely, even for an exact duplicate with matching versions', async () => {
    const prior = makeCanonicalStub()
    const reuseIfUnchanged = vi.fn(async () => prior)

    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, {
      reuseIfUnchanged,
      forceReanalyze: true,
    })

    expect(result.reused).toBe(false)
    expect(reuseIfUnchanged).not.toHaveBeenCalled() // must not even be consulted
    expect(result.intelligence.intelligenceRunId).not.toBe('prior-run-id')
  })

  it('no reuseIfUnchanged provided => always runs fresh extraction (ephemeral/no-store callers keep working)', async () => {
    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, {})
    expect(result.reused).toBe(false)
  })

  it('reuseIfUnchanged returning null => runs fresh extraction (no prior lead found)', async () => {
    const reuseIfUnchanged = vi.fn(async () => null)
    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, { reuseIfUnchanged })
    expect(result.reused).toBe(false)
    expect(reuseIfUnchanged).toHaveBeenCalledTimes(1)
  })

  it('every fresh (non-reused) result carries its own intelligenceInputHash and intelligenceVersion for future reuse', async () => {
    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, {})
    expect(result.intelligence.intelligenceInputHash).toBe(buildIntelligenceInputHash({ rawText: SAMPLE_TEXT }))
    expect(result.intelligence.intelligenceVersion).toBe(INTELLIGENCE_PIPELINE_VERSION)
  })

  it('cross-org isolation is the caller lookup\'s responsibility — reuseIfUnchanged is trusted to already be organization-scoped', async () => {
    // This test documents the contract: the orchestrator itself has no
    // concept of organization and cannot enforce this — it can only trust
    // whatever the caller's reuseIfUnchanged returns. The actual isolation
    // guarantee lives in findLeadByIntelligenceInputHash's `.eq('organization_id', this.orgId)`
    // filter (see src/lib/store/supabase-store.ts), which is a separate,
    // store-level responsibility to verify.
    const otherOrgOnlyLookup = vi.fn(async () => null) // simulates: no match in MY org, even though a match exists in another org
    const result = await produceCanonicalIntelligence(SAMPLE_TEXT, { reuseIfUnchanged: otherOrgOnlyLookup })
    expect(result.reused).toBe(false)
  })
})
