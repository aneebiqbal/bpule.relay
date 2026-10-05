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
 * - Service provider status is context, not a gate
 * - Configurable weights, one versioned config
 */

import type {
  V3OpportunityEpisode,
  V3BoundedDecision,
  V3EpisodeScore,
  V3MultiEpisodeResult,
  V3EpisodeStatus,
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

// ── Single Episode Scoring ──────────────────────────────────────────────────

export interface V3ScoreInput {
  episode: V3OpportunityEpisode
  decision: V3BoundedDecision
  /** Sender proof relevance for this episode's capabilities (0-1) */
  proofRelevance?: number
  /** Overall evidence quality (0-1) */
  evidenceQuality?: number
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

  // ── Dimension 2: External Need Probability ───────────────────────────────
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
  // Only apply relationship multiplier if buyer request is low
  // (relationship is context that modulates, not a gate that zeros)
  const relationshipMultiplier = buyerRaw >= 0.5 ? 1.0 : relContext.multiplier

  if (relationshipMultiplier < 1.0 && buyerRaw < 0.5) {
    watchOut.push(`Primary role: ${decision.relationship} (context, not gate)`)
  }

  // ── Compute Final Score ─────────────────────────────────────────────────
  const rawTotal = dimensions.reduce((sum, d) => sum + d.contribution, 0)
  const adjustedTotal = rawTotal * statusMultiplier * relationshipMultiplier
  const score = Math.round(Math.max(0, Math.min(100, adjustedTotal)))

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
      messageEligible: result.score >= 40 && result.qualification !== 'SKIP',
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

// ── Timing Computation ─────────────────────────────────────────────────────

function computeTimingScore(episode: V3OpportunityEpisode, decision: V3BoundedDecision): number {
  // Use model's timing assessment as primary
  const modelTiming = TIMING_SCORES[decision.timing] ?? 0.4

  // Cross-check with episode age
  const ageTiming = episode.ageDays === null
    ? 0.5  // unknown age
    : episode.ageDays <= 7
      ? 1.0   // very recent
      : episode.ageDays <= 14
        ? 0.8   // recent
        : episode.ageDays <= 30
          ? 0.6   // aging
          : episode.ageDays <= 45
            ? 0.4   // aging
            : episode.ageDays <= 90
              ? 0.2   // stale
              : 0.05  // very stale

  // Combine: model timing weighted higher, age as verification
  return Math.round((modelTiming * 0.6 + ageTiming * 0.4) * 100) / 100
}

function timingNote(episode: V3OpportunityEpisode, score: number): string {
  if (episode.ageDays === null) return 'Timing uncertain'
  if (episode.ageDays <= 7) return `Current (${episode.ageDays}d ago)`
  if (episode.ageDays <= 30) return `Recent (${episode.ageDays}d ago)`
  if (episode.ageDays <= 60) return `Aging (${episode.ageDays}d ago)`
  return `Stale (${episode.ageDays}d ago)`
}

// ── Action Derivation ──────────────────────────────────────────────────────

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

// ── Score Label ─────────────────────────────────────────────────────────────

function getScoreLabel(score: number): { label: string; qualification: V3ScoreOutput['qualification'] } {
  if (score >= 80) return { label: 'Strong opportunity', qualification: 'STRONG' }
  if (score >= 60) return { label: 'Worth pursuing', qualification: 'WORTH_PURSUING' }
  if (score >= 40) return { label: 'Maybe — needs more signal', qualification: 'MAYBE' }
  if (score >= 20) return { label: 'Weak fit', qualification: 'SKIP' }
  return { label: 'Not a fit', qualification: 'SKIP' }
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
