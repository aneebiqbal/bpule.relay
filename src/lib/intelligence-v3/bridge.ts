/**
 * V3 Intelligence Bridge — Production Entry Point
 *
 * Wraps the V3 Decision Intelligence pipeline into the same interface
 * that the existing API routes expect. When V3_CANONICAL=true, this
 * replaces V2 as the authoritative lead decision system.
 *
 * Flow (V3_CANONICAL=true):
 *   Raw Input → Lightweight deterministic parse → V3 Graph → V3 Episodes
 *   → GPT-4o-mini decisions → GPT-4.1 escalation → V3 DecisionPacket
 *   → Score V3 → Action Policy → HUMAN_REVIEW gate → Output
 *
 * Flow (V3_CANONICAL=false):
 *   Raw Input → Full V2 Extraction (AI) → Score V2 → Action V2 → Output
 *
 * AI Savings:
 *   V3 mode skips the full V2 extraction (2-3 AI calls). V3's event extractor
 *   works directly from raw text, so no AI-heavy normalization is needed.
 *
 * Organization scoping:
 *   The V2 evidence ledger contains per-entry organizationName. The V3 bridge
 *   uses this to separate events by organization, preventing the bug where
 *   a Tayo360 hiring post gets incorrectly scoped to AgentAce (the headline
 *   company). Each evidence entry's organizationName determines which episode
 *   it belongs to.
 */

import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'
import { runV3Decision, type V2BridgeInput } from '@/lib/intelligence-v3/orchestrator'
import type { CanonicalProspectIntelligence } from '@/lib/intelligence-v2/types'
import type { V3LeadDecisionPacket } from '@/lib/intelligence-v3/types'
import { V3_CANONICAL } from '@/lib/intelligence-v3/config'
import { initializeV3 } from '@/lib/intelligence-v3/index'
import { extractEventsFromSource } from './event-extractor'
import { buildV3ReuseKey, buildV3ReuseCacheKey } from './decision-reuse'

// ── V2-to-V3 bridge input builder ────────────────────────────────────────────

function buildV3BridgeInput(
  canonical: CanonicalProspectIntelligence,
  rawText: string,
  extractedEvents: Awaited<ReturnType<typeof extractEventsFromSource>>,
): V2BridgeInput {
  const intel = canonical.intelligence
  return {
    person: {
      fullName: intel.person.fullName,
      firstName: intel.person.firstName,
      title: intel.person.title,
      location: intel.person.location,
      linkedinUrl: intel.person.linkedinUrl,
      affiliations: intel.person.affiliations?.map((a) => ({
        organizationName: a.organizationName,
        role: a.role ?? undefined,
        relationship: a.relationship,
        isCurrent: a.isCurrent,
      })),
    },
    company: {
      name: intel.company.name,
      domain: intel.company.domain,
      industry: intel.company.industry,
      size: intel.company.size,
    },
    opportunity: {
      signals: intel.opportunity.signals as string[],
      description: intel.opportunity.description,
      organizationName: intel.opportunity.organizationName ?? intel.company.name ?? undefined,
      temporalScope: intel.opportunity.temporalScope as string | undefined,
      polarity: intel.opportunity.polarity as string | undefined,
    },
    job: intel.job ? {
      title: intel.job.title,
      skills: intel.job.skills,
      workplaceType: intel.job.workplaceType,
      employmentType: intel.job.employmentType,
    } : null,
    content: {
      recentPosts: intel.content.recentPosts.map((p) => ({
        paraphrase: p.paraphrase,
        verbatimQuote: p.verbatimQuote,
        signals: p.signals as string[],
      })),
      hiringSignals: intel.content.hiringSignals,
      technicalSignals: intel.content.technicalSignals,
    },
    businessModel: intel.businessModel as string,
    relationship: intel.relationship as string,
    commercialReading: canonical.intelligence.commercialReading ? {
      serviceBuyerIntent: (canonical.intelligence.commercialReading as { serviceBuyerIntent: string }).serviceBuyerIntent,
      externalEngineeringNeed: (canonical.intelligence.commercialReading as { externalEngineeringNeed: string }).externalEngineeringNeed,
      buyerEvidenceKinds: (canonical.intelligence.commercialReading as { buyerEvidenceKinds?: string[] }).buyerEvidenceKinds ?? [],
    } : undefined,
    evidenceLedger: canonical.evidenceLedger.map((e) => ({
      signal: e.signal,
      source: e.source,
      evidenceType: e.evidenceType,
      ownership: e.ownership as string,
      confidence: e.confidence,
      verbatimQuote: e.verbatimQuote,
      needOwnership: e.needOwnership ?? undefined,
      temporalScope: e.temporalScope ?? undefined,
      polarity: e.polarity ?? undefined,
      organizationName: e.organizationName ?? undefined,
    })),
    rawInput: rawText,
    sourceEvents: extractedEvents.map((e) => ({
      organizationName: e.organizationName,
      eventType: e.eventType,
      description: e.evidenceQuote,
      explicitRequest: e.explicitness === 'EXPLICIT',
      requestedCapabilities: e.requestedCapabilities,
      requestedAssets: e.requestedAssets,
      applicationChannels: e.applicationChannels,
      applyInstructions: e.applyInstructions,
      contactRoute: null,
      occurredAt: e.ageDays ? new Date(Date.now() - e.ageDays * 86400000).toISOString() : null,
      ageDays: e.ageDays,
      evidenceType: e.confidence > 0.7 ? 'FACT' as const : e.confidence > 0.4 ? 'STRONG_INFERENCE' as const : 'WEAK_INFERENCE' as const,
    })),
  }
}

// ── Map V3 packet to canonical output shape ──────────────────────────────────

function v3PacketToCanonical(
  packet: V3LeadDecisionPacket,
  v2Canonical: CanonicalProspectIntelligence,
): CanonicalProspectIntelligence {
  // Map V3 qualification to V2 qualification
  const v2Qualification: CanonicalProspectIntelligence['qualification'] = (() => {
    switch (packet.qualification) {
      case 'STRONG': return 'strong'
      case 'WORTH_PURSUING': return 'worth_pursuing'
      case 'MAYBE': return 'maybe'
      case 'SKIP': return 'skip'
      case 'INELIGIBLE': return 'skip'
      default: return 'maybe'
    }
  })()

  // Build a score breakdown that reflects V3 dimensions
  const scoreBreakdown = {
    dimensions: packet.dimensions ?? [],
    hardNegatives: [],
    missingInfo: [],
    total: packet.score,
    label: packet.label,
    reasons: packet.reasons,
    watchOut: packet.watchOut,
  }

  // Merge V3 data into V2 canonical shape for downstream consumers
  return {
    ...v2Canonical,
    intelligenceRunId: packet.decisionRunId,
    intelligenceVersion: 'relay_decision_v3.0.0',
    computedAt: new Date().toISOString(),
    canonicalScore: packet.score,
    scoreVersion: packet.scoreVersion,
    scoredAt: new Date().toISOString(),
    qualification: v2Qualification,
    scoreBreakdown: scoreBreakdown as unknown as CanonicalProspectIntelligence['scoreBreakdown'],
    // Preserve V3 packet in the intelligence blob for downstream access
    v3DecisionPacket: packet as unknown as Record<string, unknown>,
    // Keep V2 data intact for rollback/comparison
    v2CanonicalScore: v2Canonical.canonicalScore,
    v2Qualification: v2Canonical.qualification,
  } as CanonicalProspectIntelligence
}

// ── Main entry point ─────────────────────────────────────────────────────────

export interface V3BridgeResult {
  intelligence: CanonicalProspectIntelligence
  v3Packet: V3LeadDecisionPacket | null
  v3Canonical: boolean
  v2Fallback: boolean
}

export interface V3IntelligenceOptions {
  senderCapabilities?: string[]
  onStatus?: (msg: string) => void
  /** Selected profile ID for sender context */
  profileId?: string | null
  /** Profile intelligence version for cache key */
  profileIntelligenceVersion?: string | null
  /** Reuse callback — looks up cached DecisionPacket by reuse key */
  reuseIfUnchanged?: (reuseKey: string) => Promise<V3LeadDecisionPacket | null>
  /** Force reanalysis even if cache match exists */
  forceReanalyze?: boolean
}

/**
 * Build a minimal V2 canonical structure WITHOUT AI calls.
 * Used only when V3 is canonical — V3's event extractor works from raw text,
 * so we only need basic normalization (not full AI extraction).
 * Saves 2-3 AI calls per extraction.
 */
function buildMinimalV2Canonical(rawText: string): CanonicalProspectIntelligence {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean)
  const firstLine = lines[0] || ''
  const hasTitleAtCompany = firstLine.includes(' at ') || firstLine.includes(' · ')
  const name = hasTitleAtCompany ? firstLine.split(/\s+at\s+/)[0].trim() : firstLine.split(' ')[0] || null
  const title = hasTitleAtCompany
    ? firstLine.split(/\s+at\s+/)[1]?.replace(/^[·\s]+/, '').trim() || null
    : null

  return {
    version: 'relay_qualification_v2',
    intelligenceRunId: `v3light_${Date.now().toString(36)}`,
    intelligenceInputHash: rawText.slice(0, 100),
    intelligenceVersion: 'relay_decision_v3_light',
    computedAt: new Date().toISOString(),
    canonicalScore: 50,
    scoreVersion: 'relay_decision_v3_light',
    scoredAt: new Date().toISOString(),
    scoreBreakdown: { dimensions: [], hardNegatives: [], missingInfo: [], total: 50, label: 'Unknown — V3 will assess', reasons: [], watchOut: [] },
    confidence: 50,
    qualification: 'maybe',
    intelligence: {
      person: { fullName: name || null, firstName: name?.split(' ')[0] || null, title, seniority: null, location: null, linkedinUrl: null, otherUrls: [] },
      company: { name: title?.split(' at ')[1]?.trim() || null, domain: null, linkedinUrl: null, industry: null, size: null, sizeEvidence: null, product: null, stage: null, stageEvidence: null },
      opportunity: { signals: [], primarySignal: null, description: rawText.slice(0, 200), urgency: 'unknown' },
      job: { title: null, employmentType: 'unknown', workplaceType: 'UNKNOWN', allowedGeography: null, timezone: null, compensation: null, skills: [], seniority: 'unknown', source: null, postedDate: null },
      content: { recentPosts: [], topics: [], explicitProblems: [], initiatives: [], launches: [], technicalSignals: [], hiringSignals: [] },
      probableNeed: null,
      opportunityTrigger: null,
      timingSignal: null,
      risks: [],
      unknowns: [],
      resolvedContradictions: [],
      businessModel: 'PRODUCT',
      relationship: 'UNKNOWN',
      commercialReading: { serviceBuyerIntent: 'MEDIUM', externalEngineeringNeed: 'NONE_DETECTED', immediateBuyerNeed: false, buyerTiming: 'UNKNOWN', productMomentum: 'MEDIUM', customerDiscovery: 'NONE', preLaunchActivity: 'NONE', technicalRelevance: 'MEDIUM', buyerEvidenceKinds: [] },
      remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'UNKNOWN', eligibility: 'ELIGIBLE', reason: 'No restrictions stated', evidence: [] },
      needOwnershipSummary: { dominant: 'UNKNOWN', counts: { SELF_NEED: 0, CUSTOMER_NEED: 0, MARKET_PROBLEM: 0, SERVICE_OFFERING: 0, PRODUCT_PROBLEM: 0, EMPLOYER_NEED: 0, UNKNOWN: 0 } },
    },
    rawSource: { rawInput: rawText, sourceType: 'mixed' as const, sourceUrl: null, profileUrl: null, companyUrl: null, jobUrl: null, postUrls: [], rawPosts: [], rawJobDescription: null, rawProfileText: rawText.slice(0, 500), rawCompanyText: null, capturedAt: new Date().toISOString() },
    evidenceLedger: [],
    remoteEligibility: { workplaceType: 'REMOTE', remoteScope: 'UNKNOWN', eligibility: 'ELIGIBLE', reason: 'No restrictions stated', evidence: [] },
    extractionCompleteness: { score: 0, presentFields: [], missingFields: [], weakFields: [], repairAttempted: false, repairImproved: false, sourceUrlsFound: [], urlsPreserved: [] },
    rescoreEvents: [],
    recommendedIdentityId: null,
    recommendedProofIds: [],
    personalizationAngle: null,
    outreachContext: { whyNow: null, probableNeed: null, bestProof: null, personalizationAnchor: null, messageGoal: null, cta: null, thingsNotToClaim: [] },
    extractionCallLog: [],
    extractionTrace: [{ stage: 'v3_light_extraction', ms: 0, provider: 'deterministic' }],
  }
}

/**
 * Produce intelligence using V3 as canonical when enabled.
 * Falls back to V2 if V3 fails or is disabled.
 * Reuses cached DecisionPacket when inputs + versions are unchanged.
 */
export async function produceV3Intelligence(
  rawText: string,
  options: V3IntelligenceOptions = {},
): Promise<V3BridgeResult> {
  const {
    senderCapabilities = [],
    onStatus,
    profileId = null,
    profileIntelligenceVersion = null,
    reuseIfUnchanged,
    forceReanalyze = false,
  } = options

  // Step 1: Run V2 extraction (V3 mode uses it for normalization + fallback)
  onStatus?.('Analyzing prospect...')

  let v2Canonical: CanonicalProspectIntelligence

  if (!V3_CANONICAL) {
    const v2Result = await produceCanonicalIntelligence(rawText, {
      onStatus: (msg) => emitV3Status(msg, onStatus),
    })
    v2Canonical = v2Result.intelligence
    return {
      intelligence: v2Canonical,
      v3Packet: null,
      v3Canonical: false,
      v2Fallback: false,
    }
  }

  // V3 canonical mode: Build minimal V2 structure deterministically (no AI calls).
  // V3's extractEventsFromSource re-extracts events from raw text independently,
  // so we only need the basic normalization here — not a full AI extraction.
  // This saves 2-3 AI calls per extraction.
  v2Canonical = buildMinimalV2Canonical(rawText)

  // Step 3: Check for reusable DecisionPacket
  const reuseKey = buildV3ReuseKey({
    rawText,
    profileId,
    profileIntelligenceVersion,
    senderCapabilities,
  })

  if (reuseIfUnchanged && !forceReanalyze) {
    onStatus?.('Checking for existing decision...')
    const cached = await reuseIfUnchanged(reuseKey)
    if (cached) {
      onStatus?.('Reusing existing decision — inputs unchanged.')
      const canonical = v3PacketToCanonical(cached, v2Canonical)
      return {
        intelligence: canonical,
        v3Packet: cached,
        v3Canonical: true,
        v2Fallback: false,
      }
    }
  }

  // Step 4: Run V3 decision on top of V2 extraction
  onStatus?.('Running V3 opportunity analysis...')

  try {
    // Initialize providers (registers OpenAI, LongCat, etc.)
    initializeV3()

    // Extract events using structured LLM (avoids V2 evidence ledger degradation)
    const extractedEvents = await extractEventsFromSource(rawText, v2Canonical)

    const bridgeInput = buildV3BridgeInput(v2Canonical, rawText, extractedEvents)

    const v3Result = await runV3Decision(bridgeInput, {
      senderCapabilities,
      productionScore: v2Canonical.canonicalScore ?? undefined,
      productionAction: v2Canonical.qualification,
      onStatus: (msg) => emitV3Status(msg, onStatus),
      v2Canonical,
    })

    const packet = v3Result.packet

    // Step 5: Map V3 packet to canonical output
    const canonical = v3PacketToCanonical(packet, v2Canonical)

    return {
      intelligence: canonical,
      v3Packet: packet,
      v3Canonical: true,
      v2Fallback: false,
    }
  } catch (err) {
    // V3 failed — fall back to V2
    console.warn('[V3 Bridge] V3 decision failed, falling back to V2:', err instanceof Error ? err.message : err)
    return {
      intelligence: v2Canonical,
      v3Packet: null,
      v3Canonical: false,
      v2Fallback: true,
    }
  }
}

function emitV3Status(v2Msg: string, onStatus?: (msg: string) => void) {
  // Map V2 status messages to V3 equivalents for cleaner UX
  const mapped = v2Msg
    .replace('Extracting prospect intelligence', 'Analyzing opportunity')
    .replace('Scoring prospect', 'Scoring opportunity episode')
  onStatus?.(mapped)
}
