/**
 * Decision Intelligence V3 — Centralized Configuration
 *
 * Single source of truth for all scoring weights, thresholds, and policy.
 * Versioned. Tuned against golden set. Never scattered across modules.
 */

import type { V3ScoringWeights } from './types'

// ── Version ──────────────────────────────────────────────────────────────────

export const V3_CONFIG_VERSION = 'relay_decision_v3.0.0'

// ── Scoring Weights (must sum to 1.0) ──────────────────────────────────────

export const V3_SCORING_WEIGHTS: V3ScoringWeights = {
  buyerRequestProbability: 0.25,  // Strongest signal: explicit buyer request
  externalNeedProbability: 0.15,  // External/commercial need present
  fit: 0.20,                      // Capability fit
  timing: 0.15,                   // Recency/urgency
  access: 0.10,                   // Can we reach them
  proofRelevance: 0.10,           // We have relevant proof
  evidenceQuality: 0.05,          // Evidence quality/completeness
}

// Verify weights sum to ~1.0
const _weightSum = Object.values(V3_SCORING_WEIGHTS).reduce((a, b) => a + b, 0)
if (Math.abs(_weightSum - 1.0) > 0.01) {
  throw new Error(`V3 scoring weights sum to ${_weightSum}, expected 1.0`)
}

// ── Fit Level Scoring ──────────────────────────────────────────────────────

export const FIT_SCORES: Record<string, number> = {
  EXCELLENT: 1.0,
  STRONG: 0.8,
  MEDIUM: 0.5,
  WEAK: 0.25,
  POOR: 0.0,
}

// ── Timing Level Scoring ───────────────────────────────────────────────────

export const TIMING_SCORES: Record<string, number> = {
  URGENT: 1.0,
  CURRENT: 0.8,
  WEAK: 0.4,
  STALE: 0.15,
}

// ── Access Level Scoring ───────────────────────────────────────────────────

export const ACCESS_SCORES: Record<string, number> = {
  DIRECT: 1.0,
  CONNECTION: 0.7,
  INDIRECT: 0.3,
  NONE: 0.0,
}

// ── Relationship Adjustments ───────────────────────────────────────────────
// These are CONTEXT adjustments, not gates. A service provider with an
// explicit hiring event should still score well on that episode.

export const RELATIONSHIP_CONTEXT: Record<string, {
  /** Score multiplier for this relationship (applied to non-buyer episodes) */
  multiplier: number
  /** Whether this relationship allows buyer episodes */
  allowsBuyerEpisodes: boolean
  /** Default message eligibility bias */
  messageBias: number
}> = {
  BUYER: { multiplier: 1.0, allowsBuyerEpisodes: true, messageBias: 0.0 },
  SERVICE_PROVIDER: { multiplier: 0.4, allowsBuyerEpisodes: true, messageBias: -0.2 },
  COMPETITOR: { multiplier: 0.2, allowsBuyerEpisodes: true, messageBias: -0.3 },
  PARTNER: { multiplier: 0.6, allowsBuyerEpisodes: true, messageBias: -0.1 },
  CANDIDATE: { multiplier: 0.5, allowsBuyerEpisodes: true, messageBias: -0.2 },
  MIXED: { multiplier: 0.7, allowsBuyerEpisodes: true, messageBias: -0.1 },
  UNKNOWN: { multiplier: 0.6, allowsBuyerEpisodes: true, messageBias: -0.1 },
}

// ── Episode Status Scoring ─────────────────────────────────────────────────

export const EPISODE_STATUS_SCORES: Record<string, number> = {
  CURRENT: 1.0,
  AGING: 0.7,
  STALE: 0.3,
  CLOSED: 0.0,
  UNKNOWN: 0.5,
}

// ── Need Owner Scoring ────────────────────────────────────────────────────
// How much does each need owner type contribute to buyer intent?

export const NEED_OWNER_BUYER_RELEVANCE: Record<string, number> = {
  SELF_NEED: 1.0,
  HIRING_NEED: 0.9,
  ORGANIZATION_NEED: 0.8,
  CUSTOMER_NEED: 0.3,
  PRODUCT_PROBLEM: 0.7,
  MARKET_PROBLEM: 0.2,
  SERVICE_OFFERING: 0.1,
  UNKNOWN: 0.4,
}

// ── Action Policy Thresholds ───────────────────────────────────────────────

export const ACTION_THRESHOLDS = {
  /** Score >= this + explicit buyer request + direct access → CONTACT_NOW */
  CONTACT_NOW_MIN: 70,
  /** Score >= this + buyer signal → CONNECT_WITH_NOTE */
  CONNECT_WITH_NOTE_MIN: 50,
  /** Score >= this → CONNECT_WITHOUT_NOTE or OBSERVE */
  CONNECT_MIN: 35,
  /** Score >= this → OBSERVE */
  OBSERVE_MIN: 20,
  /** Below this → SKIP */
  SKIP_MAX: 19,
} as const

// ── Access + Intent combinations for action ────────────────────────────────

export const ACCESS_INTENT_ACTION_MATRIX: Record<string, Record<string, string>> = {
  // access: DIRECT
  DIRECT: {
    high_intent: 'CONTACT_NOW',
    medium_intent: 'CONNECT_WITH_NOTE',
    low_intent: 'CONNECT_WITHOUT_NOTE',
    no_intent: 'OBSERVE',
  },
  // access: CONNECTION
  CONNECTION: {
    high_intent: 'CONNECT_WITH_NOTE',
    medium_intent: 'CONNECT_WITHOUT_NOTE',
    low_intent: 'OBSERVE',
    no_intent: 'OBSERVE',
  },
  // access: INDIRECT
  INDIRECT: {
    high_intent: 'CONNECT_WITHOUT_NOTE',
    medium_intent: 'OBSERVE',
    low_intent: 'WAIT',
    no_intent: 'WAIT',
  },
  // access: NONE
  NONE: {
    high_intent: 'OBSERVE',
    medium_intent: 'WAIT',
    low_intent: 'SKIP',
    no_intent: 'SKIP',
  },
}

// ── Message Eligibility ────────────────────────────────────────────────────

export const V3_MESSAGE_POLICY = {
  /** Minimum composite score to message */
  MIN_SCORE: 40,
  /** Minimum buyer request probability */
  MIN_BUYER_PROBABILITY: 0.25,
  /** Minimum model message_eligible */
  MIN_MODEL_ELIGIBLE: 0.35,
  /** Minimum fit level (0-1) */
  MIN_FIT: 0.3,
  /** Maximum relationship penalty before blocking */
  MAX_RELATIONSHIP_PENALTY: 0.5,
} as const

// ── Shadow Mode ─────────────────────────────────────────────────────────────

export const V3_SHADOW_CONFIG = {
  enabled: process.env.V3_SHADOW_MODE === 'true',
  /** Log all disagreements */
  logDisagreements: true,
  /** Minimum score delta to flag */
  flagThreshold: 15,
} as const

// ── Decision Provider Config ──────────────────────────────────────────────

export const V3_DECISION_PROVIDER_CONFIG = {
  primary: process.env.V3_DECISION_PROVIDER || 'openai_structured',
  fallback: 'longcat_structured',
  /** Feature flags */
  jevEnabled: process.env.JEV_API_KEY !== undefined,
  kevEnabled: process.env.KEV_API_KEY !== undefined || process.env.KEV_ENDPOINT !== undefined,
} as const
