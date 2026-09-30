/**
 * Action Policy — V3
 *
 * Determines the recommended action from the canonical DecisionPacket dimensions.
 *
 * KEY INVARIANT: Decision model can be uncertain. Action policy must remain safe.
 *
 * Even if a model outputs buyer_request = 0.62, the action policy does NOT
 * automatically generate a message. It produces HUMAN_REVIEW until evidence,
 * fit, timing, and confidence are all strong enough.
 *
 * The policy must never independently reinterpret intent. It reads canonical dimensions only.
 */

import type {
  V3Action,
  V3LeadDecisionPacket,
} from '../types'
import {
  ACTION_THRESHOLDS,
  ACCESS_INTENT_ACTION_MATRIX,
  V3_MESSAGE_POLICY,
} from '../config'

export interface V3ActionInput {
  score: number
  buyerRequestProbability: number
  externalNeedProbability: number
  access: string
  timing: string
  relationship: string
  fit: string
  messageEligible: number
  explicitRequest: boolean
  status: string
  /** Provider confidence in the decision (0-1) */
  confidence?: number
  /** Evidence quality (0-1) */
  evidenceQuality?: number
}

export interface V3ActionOutput {
  action: V3Action
  messageEligible: boolean
  reason: string
  /** Whether this should be routed to human review */
  needsReview: boolean
  reviewReason?: string
}

export function determineAction(input: V3ActionInput): V3ActionOutput {
  // ── Hard disqualifiers ──────────────────────────────────────────────────
  if (input.status === 'CLOSED') {
    return {
      action: 'SKIP',
      messageEligible: false,
      reason: 'Episode is closed/expired',
      needsReview: false,
    }
  }

  if (input.score < ACTION_THRESHOLDS.OBSERVE_MIN) {
    return {
      action: 'SKIP',
      messageEligible: false,
      reason: `Score ${input.score} below minimum threshold`,
      needsReview: false,
    }
  }

  // ── Intent classification ──────────────────────────────────────────────
  const intentLevel = classifyIntentLevel(input)

  // ── Access × Intent matrix ──────────────────────────────────────────────
  const accessKey = input.access as keyof typeof ACCESS_INTENT_ACTION_MATRIX
  const matrix = ACCESS_INTENT_ACTION_MATRIX[accessKey] ?? ACCESS_INTENT_ACTION_MATRIX.NONE
  const rawAction = matrix[intentLevel] as V3Action ?? 'OBSERVE'

  // ── SAFETY GATE: uncertain model → HUMAN_REVIEW, not CONTACT ──────────
  const safetyResult = applySafetyGate(input, rawAction)

  // ── Message eligibility (conservative) ──────────────────────────────────
  const messageEligible = computeMessageEligibility(input) && safetyResult.action !== 'HUMAN_REVIEW'

  // ── Build reason ───────────────────────────────────────────────────────
  const reason = buildReason(input, safetyResult.action, intentLevel)

  return {
    action: safetyResult.action,
    messageEligible,
    reason,
    needsReview: safetyResult.needsReview,
    reviewReason: safetyResult.reviewReason,
  }
}

// ── Safety Gate ──────────────────────────────────────────────────────────────
//
// The model can be uncertain. The action policy must be safe.
//
// Rules:
// 1. If buyer_request is in the "uncertain zone" (0.3-0.7) → HUMAN_REVIEW
// 2. If confidence is low (<0.5) and action involves contact → HUMAN_REVIEW
// 3. If evidence is weak and action is CONTACT → HUMAN_REVIEW
// 4. If relationship is not BUYER and action is CONTACT_NOW → HUMAN_REVIEW
// 5. If timing is STALE and action involves outreach → HUMAN_REVIEW
// 6. If fit is POOR/WEAK and action is CONTACT_NOW → HUMAN_REVIEW
// 7. Only clear, confident, well-supported signals → CONTACT

const UNCERTAIN_ZONE_MIN = 0.3
const UNCERTAIN_ZONE_MAX = 0.7
const MIN_CONFIDENCE_FOR_CONTACT = 0.5
const MIN_EVIDENCE_FOR_CONTACT = 0.4

function applySafetyGate(
  input: V3ActionInput,
  rawAction: V3Action,
): { action: V3Action; needsReview: boolean; reviewReason?: string } {
  const isContactAction = rawAction === 'CONTACT_NOW' || rawAction === 'CONNECT_WITH_NOTE'
  const isConnectAction = isContactAction || rawAction === 'CONNECT_WITHOUT_NOTE'

  // Never message from uncertain zone
  if (isConnectAction && input.buyerRequestProbability >= UNCERTAIN_ZONE_MIN && input.buyerRequestProbability < UNCERTAIN_ZONE_MAX) {
    // If no explicit request, demote to HUMAN_REVIEW
    if (!input.explicitRequest) {
      return {
        action: 'HUMAN_REVIEW',
        needsReview: true,
        reviewReason: `Buyer request probability ${input.buyerRequestProbability.toFixed(2)} is in uncertain zone (${UNCERTAIN_ZONE_MIN}-${UNCERTAIN_ZONE_MAX}) without explicit request — human review required`,
      }
    }
    // Explicit request in uncertain zone → downgrade one level
    if (rawAction === 'CONTACT_NOW') {
      return {
        action: 'CONNECT_WITH_NOTE',
        needsReview: false,
        reviewReason: undefined,
      }
    }
  }

  // Low confidence → HUMAN_REVIEW for any contact
  if (isContactAction && (input.confidence ?? 1) < MIN_CONFIDENCE_FOR_CONTACT) {
    return {
      action: 'HUMAN_REVIEW',
      needsReview: true,
      reviewReason: `Low confidence (${(input.confidence ?? 0).toFixed(2)}) for contact action — human review required`,
    }
  }

  // Weak evidence → downgrade contact
  if (isContactAction && (input.evidenceQuality ?? 1) < MIN_EVIDENCE_FOR_CONTACT) {
    return {
      action: 'HUMAN_REVIEW',
      needsReview: true,
      reviewReason: `Weak evidence (${(input.evidenceQuality ?? 0).toFixed(2)}) for contact action — human review required`,
    }
  }

  // Non-buyer relationship with contact → HUMAN_REVIEW
  // Service provider + buyer event = identity conflict that needs human verification
  if (rawAction === 'CONTACT_NOW' && input.relationship !== 'BUYER') {
    return {
      action: 'HUMAN_REVIEW',
      needsReview: true,
      reviewReason: `Relationship is ${input.relationship}, not BUYER — verify before contact`,
    }
  }

  // Service provider / competitor / unknown + CONNECT_WITH_NOTE → HUMAN_REVIEW
  // Identity conflict or uncertainty needs human verification before contact
  if (rawAction === 'CONNECT_WITH_NOTE' && input.relationship !== 'BUYER' && input.relationship !== 'PARTNER') {
    return {
      action: 'HUMAN_REVIEW',
      needsReview: true,
      reviewReason: `Relationship is ${input.relationship} with contact action — verify before outreach`,
    }
  }

  // Stale timing with outreach → HUMAN_REVIEW
  if (isConnectAction && input.timing === 'STALE') {
    return {
      action: 'HUMAN_REVIEW',
      needsReview: true,
      reviewReason: 'Timing is stale — verify if opportunity is still active',
    }
  }

  // Poor fit with CONTACT_NOW → downgrade
  if (rawAction === 'CONTACT_NOW' && (input.fit === 'POOR' || input.fit === 'WEAK')) {
    return {
      action: 'CONNECT_WITH_NOTE',
      needsReview: false,
    }
  }

  // Service provider relationship + CONNECT → review unless explicit
  if (input.relationship === 'SERVICE_PROVIDER' && isConnectAction && !input.explicitRequest) {
    return {
      action: 'OBSERVE',
      needsReview: false,
    }
  }

  return { action: rawAction, needsReview: false }
}

function classifyIntentLevel(input: V3ActionInput): 'high_intent' | 'medium_intent' | 'low_intent' | 'no_intent' {
  const buyer = input.buyerRequestProbability
  const external = input.externalNeedProbability

  if (buyer >= 0.7 && input.explicitRequest) return 'high_intent'
  if (buyer >= 0.5 || (buyer >= 0.3 && external >= 0.6)) return 'medium_intent'
  if (buyer >= 0.2 || external >= 0.4) return 'low_intent'
  return 'no_intent'
}

function computeMessageEligibility(input: V3ActionInput): boolean {
  if (input.score < V3_MESSAGE_POLICY.MIN_SCORE) return false
  if (input.buyerRequestProbability < V3_MESSAGE_POLICY.MIN_BUYER_PROBABILITY) return false
  if (input.messageEligible < V3_MESSAGE_POLICY.MIN_MODEL_ELIGIBLE) return false
  // Never message HUMAN_REVIEW cases
  if (input.buyerRequestProbability >= UNCERTAIN_ZONE_MIN && input.buyerRequestProbability < UNCERTAIN_ZONE_MAX && !input.explicitRequest) return false
  return true
}

function buildReason(input: V3ActionInput, action: V3Action, intentLevel: string): string {
  const parts: string[] = []

  if (action === 'HUMAN_REVIEW') {
    parts.push('uncertain classification')
    if (input.buyerRequestProbability >= UNCERTAIN_ZONE_MIN && input.buyerRequestProbability < UNCERTAIN_ZONE_MAX) {
      parts.push(`buyer=${input.buyerRequestProbability.toFixed(2)} in uncertain zone`)
    }
    return `HUMAN_REVIEW — ${parts.join(', ')}`
  }

  if (input.explicitRequest) parts.push('explicit request')
  if (input.buyerRequestProbability >= 0.6) parts.push('strong buyer signal')
  if (input.access === 'DIRECT') parts.push('direct access')
  if (input.timing === 'CURRENT' || input.timing === 'URGENT') parts.push('current timing')
  if (input.fit === 'STRONG' || input.fit === 'EXCELLENT') parts.push('strong fit')

  if (parts.length === 0) {
    parts.push(`${intentLevel.replace('_', ' ')}`, `score ${input.score}`)
  }

  return `${action} — ${parts.join(', ')}`
}

// ── Convert from full decision packet ────────────────────────────────────────

export function actionFromDecisionPacket(packet: V3LeadDecisionPacket): V3ActionOutput {
  const episode = packet.episodes.find((e) => e.id === packet.selectedEpisodeId)
  return determineAction({
    score: packet.score,
    buyerRequestProbability: packet.decision.buyerRequestProbability,
    externalNeedProbability: packet.decision.externalNeedProbability,
    access: packet.decision.access,
    timing: packet.decision.timing,
    relationship: packet.decision.relationship,
    fit: packet.decision.fit,
    messageEligible: packet.decision.messageEligible,
    explicitRequest: episode?.explicitRequest ?? false,
    status: episode?.status ?? 'UNKNOWN',
    confidence: packet.confidence,
    evidenceQuality: packet.proofStrength,
  })
}
