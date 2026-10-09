/**
 * Score Engine V3
 *
 * Scores OPPORTUNITY EPISODES, not persons.
 *
 * Principles:
 * - Score each episode independently
 * - Best active episode = lead display score
 * - No global identity penalties that zero unrelated episodes
 * - Timing and intent are SEPARATE dimensions
 * - Commercial potential is SEPARATE from buyer intent
 * - Service provider status is context, not a gate
 * - Configurable weights, one versioned config
 */

import type {
  V3OpportunityEpisode,
  V3BoundedDecision,
  V3EpisodeScore,
  V3MultiEpisodeResult,
  V3EpisodeStatus,
  CommercialPotentialAssessment,
} from '../types'
import {
  V3_SCORING_WEIGHTS,
  FIT_SCORES,
  TIMING_SCORES,
  ACCESS_SCORES,
  EPISODE_STATUS_SCORES,
  RELATIONSHIP_CONTEXT,
  NEED_OWNER_BUYER_RELEVANCE,
} from '../config'
import { extractSignals } from '@/lib/scoring/signal-extractor'
import { computeCompositeScore } from '@/lib/scoring/composite-scorer'

// ── Helper Functions (defined first to avoid hoisting issues) ────────────────

function computeTimingScore(episode: V3OpportunityEpisode, decision: V3BoundedDecision): number {
  const modelTiming = TIMING_SCORES[decision.timing] ?? 0.4
  const ageTiming = episode.ageDays === null
    ? 0.5
    : episode.ageDays <= 7 ? 1.0
    : episode.ageDays <= 14 ? 0.8
    : episode.ageDays <= 30 ? 0.6
    : episode.ageDays <= 45 ? 0.4
    : episode.ageDays <= 90 ? 0.2
    : 0.05
  return Math.round((modelTiming * 0.6 + ageTiming * 0.4) * 100) / 100
}

function timingNote(episode: V3OpportunityEpisode, score: number): string {
  if (episode.ageDays === null) return 'Timing uncertain'
  if (episode.ageDays <= 7) return `Current (${episode.ageDays}d ago)`
  if (episode.ageDays <= 30) return `Recent (${episode.ageDays}d ago)`
  if (episode.ageDays <= 60) return `Aging (${episode.ageDays}d ago)`
  return `Stale (${episode.ageDays}d ago)`
}

function computeCommercialPotentialScore(cp?: CommercialPotentialAssessment): number {
  if (!cp) return 0
  const BUILD_INTENSITY_SCORES: Record<string, number> = {
    NONE: 0, LOW: 0.2, MEDIUM: 0.5, HIGH: 0.8, VERY_HIGH: 1.0,
  }
  const buildScore = BUILD_INTENSITY_SCORES[cp.buildIntensity] ?? 0
  const raw = (
    cp.decisionAuthority * 0.25 +
    buildScore * 0.25 +
    cp.technicalRelevance * 0.15 +
    cp.capacityNeedLikelihood * 0.15 +
    cp.reachability * 0.10 +
    cp.companyMaturity * 0.10
  )
  switch (cp.overallPotential) {
    case 'HIGH': return Math.max(0.5, Math.min(1.0, raw))
    case 'MEDIUM': return Math.max(0.25, Math.min(0.7, raw))
    case 'LOW': return Math.min(0.3, raw)
    default: return 0
  }
}

function deriveAction(score: number, input: V3ScoreInput): V3EpisodeScore['action'] {
  const explicitBuyer = input.episode.explicitRequest && input.decision.buyerRequestProbability >= 0.6
  const directAccess = input.decision.access === 'DIRECT'
  if (score >= 70 && explicitBuyer && directAccess) return 'CONTACT_NOW'
  if (score >= 60 && explicitBuyer) return 'CONNECT_WITH_NOTE'
  if (score >= 50) return 'CONNECT_WITH_NOTE'
  if (score >= 35) return 'CONNECT_WITHOUT_NOTE'
  if (score >= 20) return 'OBSERVE'
  return 'SKIP'
}

function getScoreLabel(score: number): { label: string; qualification: V3ScoreOutput['qualification'] } {
  if (score >= 80) return { label: 'Strong opportunity', qualification: 'STRONG' }
  if (score >= 60) return { label: 'Worth pursuing', qualification: 'WORTH_PURSUING' }
  if (score >= 40) return { label: 'Maybe — needs more signal', qualification: 'MAYBE' }
  if (score >= 20) return { label: 'Weak fit', qualification: 'SKIP' }
  return { label: 'Not a fit', qualification: 'SKIP' }
}

// ── Single Episode Scoring ──────────────────────────────────────────────────

export interface V3ScoreInput {
  episode: V3OpportunityEpisode
  decision: V3BoundedDecision
  /** Sender proof relevance for this episode's capabilities (0-1) */
  proofRelevance?: number
  /** Overall evidence quality (0-1) */
  evidenceQuality?: number
  /** Raw source text for deterministic signal extraction (enriches score) */
  rawText?: string
  /** Sender capabilities for fit assessment */
  senderCapabilities?: string[]
  /** Commercial potential assessment (separate from buyer intent) */
  commercialPotential?: CommercialPotentialAssessment
}

export interface V3ScoreOutput {
  /** Final 0-100 score */
  score: number
  label: string
  qualification: 'STRONG' | 'WORTH_PURSUING' | 'MAYBE' | 'SKIP' | 'INELIGIBLE'
  reasons: string[]
  watchOut: string[]
  /** Per-dimension breakdown */
  dimensions: V3ScoreDimension[]
}

export interface V3ScoreDimension {
  key: string
  label: string
  contribution: number  // weighted contribution to final score
  raw: number           // raw 0-1 value
  weight: number
  note: string
}

export function scoreEpisode(input: V3ScoreInput): V3ScoreOutput {
  const { episode, decision } = input
  const proofRelevance = input.proofRelevance ?? 0.5
  const evidenceQuality = input.evidenceQuality ?? 0.5
  const reasons: string[] = []
  const watchOut: string[] = []
  const dimensions: V3ScoreDimension[] = []

  // ── Dimension 1: Buyer Request Probability ──────────────────────────────
  const buyerRaw = decision.buyerRequestProbability
  const buyerContribution = buyerRaw * V3_SCORING_WEIGHTS.buyerRequestProbability * 100
  dimensions.push({
    key: 'buyerRequest',
    label: 'Buyer Request',
    contribution: buyerContribution,
    raw: buyerRaw,
    weight: V3_SCORING_WEIGHTS.buyerRequestProbability,
    note: buyerRaw >= 0.7
      ? 'Strong buyer request signal'
      : buyerRaw >= 0.4
        ? 'Moderate buyer signal'
        : 'Weak or no buyer request',
  })
  if (buyerRaw >= 0.7) reasons.push('Explicit buyer request detected')
  if (buyerRaw < 0.3) watchOut.push('No clear buyer request signal')

  // ── Dimension 2: Commercial Potential ───────────────────────────────────
  // Separated from buyer intent. A founder building a product can have
  // buyerIntent=UNKNOWN but commercialPotential=HIGH.
  const cpRaw = computeCommercialPotentialScore(input.commercialPotential)
  const cpContribution = cpRaw * V3_SCORING_WEIGHTS.commercialPotential * 100
  dimensions.push({
    key: 'commercialPotential',
    label: 'Commercial Potential',
    contribution: cpContribution,
    raw: cpRaw,
    weight: V3_SCORING_WEIGHTS.commercialPotential,
    note: cpRaw >= 0.6
      ? 'Strong commercial potential — worth pursuing'
      : cpRaw >= 0.3
        ? 'Moderate commercial potential'
        : 'Limited commercial potential',
  })
  if (cpRaw >= 0.5 && decision.buyerRequestProbability < 0.4) {
    reasons.push('High commercial potential despite no explicit buyer request')
  }

  // ── Dimension 3: External Need Probability ───────────────────────────────
  const needOwnerRelevance = NEED_OWNER_BUYER_RELEVANCE[episode.needOwnerType] ?? 0.4
  const externalRaw = decision.externalNeedProbability * needOwnerRelevance
  const externalContribution = externalRaw * V3_SCORING_WEIGHTS.externalNeedProbability * 100
  dimensions.push({
    key: 'externalNeed',
    label: 'External Need',
    contribution: externalContribution,
    raw: externalRaw,
    weight: V3_SCORING_WEIGHTS.externalNeedProbability,
    note: externalRaw >= 0.6 ? 'Clear external need' : 'Need signal weak or internal-only',
  })

  // ── Dimension 3: Fit ────────────────────────────────────────────────────
  const fitRaw = FIT_SCORES[decision.fit] ?? 0.5
  const fitContribution = fitRaw * V3_SCORING_WEIGHTS.fit * 100
  dimensions.push({
    key: 'fit',
    label: 'Capability Fit',
    contribution: fitContribution,
    raw: fitRaw,
    weight: V3_SCORING_WEIGHTS.fit,
    note: `Fit: ${decision.fit}`,
  })
  if (fitRaw >= 0.8) reasons.push('Strong capability fit')

  // ── Dimension 4: Timing ─────────────────────────────────────────────────
  const timingRaw = computeTimingScore(episode, decision)
  const timingContribution = timingRaw * V3_SCORING_WEIGHTS.timing * 100
  dimensions.push({
    key: 'timing',
    label: 'Timing',
    contribution: timingContribution,
    raw: timingRaw,
    weight: V3_SCORING_WEIGHTS.timing,
    note: timingNote(episode, timingRaw),
  })
  if (timingRaw >= 0.8) reasons.push('Current/recent opportunity')
  if (timingRaw <= 0.3) watchOut.push('Event may be stale or expired')

  // ── Dimension 5: Access ─────────────────────────────────────────────────
  const accessRaw = ACCESS_SCORES[decision.access] ?? 0.3
  const accessContribution = accessRaw * V3_SCORING_WEIGHTS.access * 100
  dimensions.push({
    key: 'access',
    label: 'Access',
    contribution: accessContribution,
    raw: accessRaw,
    weight: V3_SCORING_WEIGHTS.access,
    note: `Access: ${decision.access}`,
  })
  if (accessRaw >= 0.7) reasons.push('Direct access available')

  // ── Dimension 6: Proof Relevance ────────────────────────────────────────
  const proofContribution = proofRelevance * V3_SCORING_WEIGHTS.proofRelevance * 100
  dimensions.push({
    key: 'proofRelevance',
    label: 'Proof Relevance',
    contribution: proofContribution,
    raw: proofRelevance,
    weight: V3_SCORING_WEIGHTS.proofRelevance,
    note: proofRelevance >= 0.6 ? 'Relevant proof available' : 'Weak proof match',
  })

  // ── Dimension 7: Evidence Quality ───────────────────────────────────────
  const evidenceContribution = evidenceQuality * V3_SCORING_WEIGHTS.evidenceQuality * 100
  dimensions.push({
    key: 'evidenceQuality',
    label: 'Evidence Quality',
    contribution: evidenceContribution,
    raw: evidenceQuality,
    weight: V3_SCORING_WEIGHTS.evidenceQuality,
    note: evidenceQuality >= 0.6 ? 'Good evidence quality' : 'Limited evidence',
  })

  // ── Episode Status Adjustment ───────────────────────────────────────────
  const statusMultiplier = EPISODE_STATUS_SCORES[episode.status] ?? 0.5
  if (statusMultiplier < 1.0) {
    watchOut.push(`Episode status: ${episode.status}`)
  }

  // ── Relationship Context (NOT a gate) ───────────────────────────────────
  const relContext = RELATIONSHIP_CONTEXT[decision.relationship] ?? RELATIONSHIP_CONTEXT.UNKNOWN
  // Relationship multiplier is dampened when commercial potential is high.
  // A service provider building a real product has commercial worth independent
  // of their service-provider identity. The multiplier blends between full
  // relationship penalty and 1.0 based on commercial potential strength.
  const cpStrength = cpRaw // 0-1
  const relationshipMultiplier = (buyerRaw >= 0.5)
    ? 1.0
    : relContext.multiplier + (1.0 - relContext.multiplier) * cpStrength * 0.7

  if (relationshipMultiplier < 1.0 && buyerRaw < 0.5) {
    watchOut.push(`Primary role: ${decision.relationship} (context, not gate)`)
  }

  // ── Compute Final Score ─────────────────────────────────────────────────
  const rawTotal = dimensions.reduce((sum, d) => sum + d.contribution, 0)
  const adjustedTotal = rawTotal * statusMultiplier * relationshipMultiplier
  let score = Math.round(Math.max(0, Math.min(100, adjustedTotal)))

  // ── Composite Score Enrichment ─────────────────────────────────────────
  // When rawText is available, blend V3's AI-based score with deterministic
  // signals from the composite scorer. This catches signals the AI missed
  // (tech stack overlap, company growth, hiring velocity, etc.)
  if (input.rawText && input.rawText.length > 50) {
    try {
      const signals = extractSignals(input.rawText)
      const composite = computeCompositeScore({
        aiBuyerProbability: decision.buyerRequestProbability,
        aiFitLevel: decision.fit,
        aiAccessLevel: decision.access,
        aiIntentLevel: decision.buyerRequestProbability >= 0.6 ? 'HIGH' : decision.buyerRequestProbability >= 0.3 ? 'MEDIUM' : 'LOW',
        signals,
        proofScore: input.proofRelevance,
        senderCapabilities: input.senderCapabilities,
      })

      // Blend: 60% V3 (AI context) + 40% composite (deterministic signals)
      // When V3 is uncertain (score 30-60 range), composite has more influence
      const v3Weight = score >= 70 || score <= 20 ? 0.7 : 0.5
      const compositeWeight = 1 - v3Weight
      score = Math.round(score * v3Weight + composite.total * compositeWeight)

      // Merge evidence from composite dimensions
      const topCompositeEvidence = composite.dimensions
        .filter((d) => d.score >= 60)
        .flatMap((d) => d.evidence)
        .filter((e) => !reasons.includes(e))
        .slice(0, 3)
      reasons.push(...topCompositeEvidence)

      // Add composite dimensions to output
      for (const dim of composite.dimensions) {
        if (!dimensions.find((d) => d.key === dim.key)) {
          dimensions.push({
            key: dim.key,
            label: dim.label,
            contribution: dim.weighted,
            raw: dim.score / 100,
            weight: dim.weight,
            note: dim.evidence[0] || '',
          })
        }
      }
    } catch {
      // Composite scoring is best-effort; V3 score stands alone
    }
  }

  // ── Label & Qualification ───────────────────────────────────────────────
  const { label, qualification } = getScoreLabel(score)

  return {
    score,
    label,
    qualification,
    reasons,
    watchOut,
    dimensions,
  }
}

// ── Multi-Episode Scoring ───────────────────────────────────────────────────

export function scoreAllEpisodes(
  inputs: V3ScoreInput[],
): V3MultiEpisodeResult {
  const episodeScores: V3EpisodeScore[] = []

  for (const input of inputs) {
    const result = scoreEpisode(input)
    episodeScores.push({
      episodeId: input.episode.id,
      score: result.score,
      label: result.label,
      qualification: result.qualification,
      action: deriveAction(result.score, input),
      messageEligible: (result.score >= 40 && result.qualification !== 'SKIP')
        || isHighPotentialBuilderEpisode(input),
      reasons: result.reasons,
    })
  }

  // Best active episode score = lead display score
  const activeEpisodes = episodeScores.filter((es) => {
    const input = inputs.find((i) => i.episode.id === es.episodeId)
    return input && input.episode.status !== 'CLOSED'
  })

  const bestActive = activeEpisodes.length > 0
    ? activeEpisodes.reduce((best, current) => current.score > best.score ? current : best)
    : episodeScores[0] ?? null

  return {
    episodes: episodeScores,
    bestActiveScore: bestActive?.score ?? 0,
    bestActiveEpisodeId: bestActive?.episodeId ?? null,
  }
}

// ── High-potential builder detection ─────────────────────────────────────────
// A founder/CEO/CTO with high commercial potential is eligible for a
// connection note even with low buyer-intent score. Connection notes earn
// access — they don't pitch. This aligns V3 eligibility with the revenue
// strategy's builder-connection path.

function isHighPotentialBuilderEpisode(input: V3ScoreInput): boolean {
  const cp = input.commercialPotential
  if (!cp) return false

  // High commercial potential: founder/CEO/CTO with active building
  const isHighAuthority = cp.decisionAuthority >= 0.7
  const isActiveBuilding = cp.buildIntensity === 'HIGH' || cp.buildIntensity === 'VERY_HIGH'
  const isReachable = cp.reachability >= 0.3

  // Check raw text for founder/CEO/CTO patterns if authority not already detected
  const rawText = input.rawText ?? ''
  const hasFounderTitle = /\b(ceo|cto|cfo|founder|co[- ]?founder|owner|president|managing director)\b/i.test(rawText)

  return (isHighAuthority || hasFounderTitle) && isActiveBuilding && isReachable
}

// ── Backward-compatible display ─────────────────────────────────────────────
// Maps V3 0-100 score to a 0-10 display value using qualification bands
// rather than blind division. V3 42 ("Maybe" / CONTACT_NOW) → 5/10 (medium),
// not 4/10 (which reads as "very weak" and contradicts the action).
export function v3ToDisplay(score: number): number {
  if (score >= 80) return 9
  if (score >= 60) return 7
  if (score >= 40) return 5
  if (score >= 20) return 3
  return 1
}
