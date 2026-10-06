/**
 * V3 Intelligence Bridge — Production Entry Point
 *
 * Wraps the V3 Decision Intelligence pipeline into the same interface
 * that the existing API routes expect. When V3_CANONICAL=true, this
 * replaces V2 as the authoritative lead decision system.
 *
 * Flow:
 *   Raw Input → V2 Extraction (unchanged) → V3 Graph → V3 Episodes
 *   → GPT-4o-mini decisions → GPT-4.1 escalation → V3 DecisionPacket
 *   → Score V3 → Action Policy → HUMAN_REVIEW gate → Output
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

  // Step 1: Always run V2 extraction first (provides normalized input + fallback)
  onStatus?.('Extracting prospect intelligence (V2)...')

  const v2Result = await produceCanonicalIntelligence(rawText, {
    onStatus: (msg) => emitV3Status(msg, onStatus),
  })

  const v2Canonical = v2Result.intelligence

  // Step 2: If V3 is not canonical, return V2 as-is
  if (!V3_CANONICAL) {
    return {
      intelligence: v2Canonical,
      v3Packet: null,
      v3Canonical: false,
      v2Fallback: false,
    }
  }

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
