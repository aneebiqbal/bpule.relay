import type { TrendRelevanceProfile } from '@/lib/trends/types'

/** The Relay brand account's trend interest — one authority for Growth. */
export const RELAY_TREND_PROFILE: TrendRelevanceProfile = {
  primaryTerritories: ['sales technology', 'revenue operations', 'ai', 'b2b saas', 'outreach'],
  secondaryTerritories: ['startups', 'product', 'data', 'automation', 'founder'],
  technologies: ['ai', 'crm', 'automation', 'analytics', 'llm'],
  industries: ['saas', 'b2b', 'sales'],
  excludedTerritories: [],
}
