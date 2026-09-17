/**
 * Taste Profile — dual-track learning system.
 *
 * Long-term taste: slow, stable, compounds over hundreds of interactions.
 *   Learning rate floor: 0.02. Represents durable preferences.
 *
 * Short-term taste: reactive to recent signals, decays toward long-term.
 *   Learning rate: 0.15. Half-life: ~10 interactions. Captures current
 *   interests without destabilizing learned preferences.
 *
 * Scoring blends both: 70% long-term + 30% short-term.
 */

import type { ContentMemory } from '@/lib/domain/types'

export interface TasteDimensions {
  technicalVsHuman: number
  opinionVsEducational: number
  timelyVsEvergreen: number
  shortVsDeep: number
  seriousVsPlayful: number
  personalVsUniversal: number
}

export interface TasteProfile {
  personaId: string
  preferences: TasteDimensions
  territoryAffinity: Record<string, number>
  totalInteractions: number
  lastUpdated: string
  // Short-term track (decays toward long-term)
  shortTerm: TasteDimensions
  shortTermWeight: number // 0-1, how much short-term is currently active
}

export interface TasteSignal {
  type: 'write_this' | 'not_for_me' | 'surprise_me' | 'posting' | 'heavy_edit' | 'regeneration' | 'opinion_selected' | 'ignored'
  territory?: string
  contentType?: 'technical' | 'opinion' | 'human' | 'educational' | 'timely' | 'observation'
  metadata?: {
    wasPersonal?: boolean
    wasTimely?: boolean
    wasShort?: boolean
    wasOpinion?: boolean
    wasTechnical?: boolean
  }
  idempotencyKey?: string
}

const DEFAULT_DIM: TasteDimensions = {
  technicalVsHuman: 0,
  opinionVsEducational: 0,
  timelyVsEvergreen: 0,
  shortVsDeep: 0,
  seriousVsPlayful: 0,
  personalVsUniversal: 0,
}

// Long-term learning: lr = 0.5/√(n+1), floored at 0.02.
// At n=25: lr≈0.098. At n=100: lr≈0.048. At n=250: lr≈0.031.
// Floor (0.02) kicks in around n=625.
const LONG_TERM_FLOOR = 0.02
const LONG_TERM_BASE = 0.5

// Short-term learning: higher rate, decays via half-life.
const SHORT_TERM_LR = 0.15
const SHORT_TERM_DECAY = 0.9 // per interaction, short-term weight *= 0.9

export function createTasteProfile(personaId: string): TasteProfile {
  return {
    personaId,
    preferences: { ...DEFAULT_DIM },
    territoryAffinity: {},
    totalInteractions: 0,
    lastUpdated: new Date().toISOString(),
    shortTerm: { ...DEFAULT_DIM },
    shortTermWeight: 0,
  }
}

export function applyTasteSignal(profile: TasteProfile, signal: TasteSignal): TasteProfile {
  const next: TasteProfile = {
    ...profile,
    preferences: { ...profile.preferences },
    territoryAffinity: { ...profile.territoryAffinity },
    shortTerm: { ...profile.shortTerm },
  }
  next.totalInteractions += 1

  // Long-term learning rate: decays with sqrt(n), floors at 0.02
  const llr = Math.max(LONG_TERM_FLOOR, LONG_TERM_BASE / Math.sqrt(profile.totalInteractions + 1))
  const strength = signalStrength(signal.type)

  if (strength !== 0) {
    applyDimensionalSignal(next.preferences, signal, strength, llr)
    applyDimensionalSignal(next.shortTerm, signal, strength, SHORT_TERM_LR)

    const territory = signal.territory ? normalizeTerritory(signal.territory) : undefined
    if (territory) {
      const current = next.territoryAffinity[territory] ?? 0.5
      next.territoryAffinity[territory] = clamp01(current + strength * llr * 0.3)
    }
  }

  // Decay short-term weight: each interaction moves it 10% toward 0
  // Only positive signals (write_this, posting, opinion_selected, surprise_me)
  // bump it back up. Negative/ignored signals let it decay.
  const signalImpact = strength > 0 ? strength * 0.3 : 0
  next.shortTermWeight = clamp01(
    profile.shortTermWeight * SHORT_TERM_DECAY + signalImpact,
  )

  // Decay short-term dimensions toward long-term (gentle drift)
  for (const key of Object.keys(next.shortTerm) as Array<keyof TasteDimensions>) {
    next.shortTerm[key] = next.shortTerm[key] + (next.preferences[key] - next.shortTerm[key]) * 0.05
  }

  next.lastUpdated = new Date().toISOString()
  return next
}

function applyDimensionalSignal(dims: TasteDimensions, signal: TasteSignal, strength: number, lr: number): void {
  if (signal.metadata?.wasTechnical !== undefined) {
    dims.technicalVsHuman = clamp(dims.technicalVsHuman + strength * lr * (signal.metadata.wasTechnical ? 0.5 : -0.5), -1, 1)
  }
  if (signal.metadata?.wasOpinion !== undefined) {
    dims.opinionVsEducational = clamp(dims.opinionVsEducational + strength * lr * (signal.metadata.wasOpinion ? 0.5 : -0.5), -1, 1)
  }
  if (signal.metadata?.wasTimely !== undefined) {
    dims.timelyVsEvergreen = clamp(dims.timelyVsEvergreen + strength * lr * (signal.metadata.wasTimely ? 0.5 : -0.5), -1, 1)
  }
  if (signal.metadata?.wasPersonal !== undefined) {
    dims.personalVsUniversal = clamp(dims.personalVsUniversal + strength * lr * (signal.metadata.wasPersonal ? 0.5 : -0.5), -1, 1)
  }
}

/**
 * Score how well an idea matches the dual-track taste profile.
 * Blends long-term (70%) and short-term (30%) preferences.
 */
export function scoreTasteMatch(profile: TasteProfile, idea: {
  territory?: string
  isTechnical?: boolean
  isOpinion?: boolean
  isTimely?: boolean
  isShort?: boolean
  isPersonal?: boolean
}): number {
  if (profile.totalInteractions < 2) return 0.5

  const longScore = scoreDimensions(profile.preferences, idea)
  const shortScore = scoreDimensions(profile.shortTerm, idea)

  // Blend: short-term weight determines how much short-term influences the score
  // At weight 0: pure long-term. At weight 1: 50/50 blend.
  const blend = profile.shortTermWeight * 0.3
  const blended = longScore * (1 - blend) + shortScore * blend

  // Territory affinity (from long-term track)
  if (idea.territory && profile.territoryAffinity[idea.territory] !== undefined) {
    return clamp01(blended + (profile.territoryAffinity[idea.territory] - 0.5) * 0.15)
  }

  return clamp01(blended)
}

function scoreDimensions(dims: TasteDimensions, idea: {
  territory?: string
  isTechnical?: boolean
  isOpinion?: boolean
  isTimely?: boolean
  isShort?: boolean
  isPersonal?: boolean
}): number {
  let score = 0.5
  let factors = 0
  if (idea.isTechnical !== undefined) { score += dims.technicalVsHuman * (idea.isTechnical ? 0.1 : -0.1); factors++ }
  if (idea.isOpinion !== undefined) { score += dims.opinionVsEducational * (idea.isOpinion ? 0.1 : -0.1); factors++ }
  if (idea.isTimely !== undefined) { score += dims.timelyVsEvergreen * (idea.isTimely ? 0.08 : -0.08); factors++ }
  if (idea.isPersonal !== undefined) { score += dims.personalVsUniversal * (idea.isPersonal ? 0.08 : -0.08); factors++ }
  return factors > 0 ? clamp01(score) : 0.5
}

function signalStrength(type: TasteSignal['type']): number {
  switch (type) {
    case 'write_this': return 0.6
    case 'posting': return 1.0
    case 'opinion_selected': return 0.5
    case 'surprise_me': return 0.3
    case 'ignored': return -0.1
    case 'regeneration': return -0.2
    case 'heavy_edit': return -0.3
    case 'not_for_me': return -0.6
    default: return 0
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function clamp01(n: number): number {
  return clamp(n, 0, 1)
}

export function normalizeTerritory(territory: string): string {
  return territory.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function computeSignalIdempotencyKey(signal: TasteSignal): string | undefined {
  if (signal.idempotencyKey) return signal.idempotencyKey
  return undefined
}
