import type { TrendItem, TrendSourceType } from '@/lib/domain/types'

export interface RawTrendSignal {
  source: string
  sourceType: TrendSourceType
  sourceItemId: string
  url?: string
  title: string
  excerpt?: string
  author?: string
  publishedAt?: string
  tags?: string[]
  metrics?: Record<string, unknown>
}

export interface SourceAdapter {
  sourceType: TrendSourceType
  sourceKey: string
  fetch(store: TrendStore): Promise<RawTrendSignal[]>
}

export interface TrendStore {
  getSource(sourceKey: string): Promise<{ id: string } | null>
  itemExists(fingerprint: string): Promise<boolean>
  saveItem(item: {
    sourceId: string
    sourceItemId: string
    url?: string
    title: string
    excerpt?: string
    author?: string
    publishedAt?: string
    metrics?: Record<string, unknown>
    topics: string[]
    contentFingerprint: string
    evidenceQuality: 'high' | 'medium' | 'low'
    expiresAt: string
  }): Promise<void>
  updateHealth(sourceKey: string, success: boolean, error?: string): Promise<void>
}

export type TrendPhase = 'breaking' | 'rising' | 'established' | 'saturated'

export interface TrendCandidate {
  item: TrendItem
  relevanceScore: number
  personaMatch: string[]
  freshnessScore: number
  momentumScore: number
  authorityScore: number
  noveltyScore: number
  insightScore: number
  credibilityScore: number
  overallScore: number
  whyNow: string
  // Phase 3: velocity + saturation
  velocityScore?: number
  saturationScore?: number
  trendPhase?: TrendPhase
}

export interface TrendRelevanceProfile {
  primaryTerritories: string[]
  secondaryTerritories: string[]
  technologies: string[]
  industries: string[]
  excludedTerritories: string[]
}
